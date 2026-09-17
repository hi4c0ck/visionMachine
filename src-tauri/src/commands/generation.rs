//! Thin generation commands: start / poll / cancel for pipe-level tasks.
//! The progress modal polls `get_generation_task`; live state comes from the
//! in-memory registry, terminal tasks fall back to the DB row.

use serde::Deserialize;
use tauri::State;

use crate::generation::{
    EngineInput, GenerationStageView, GenerationTaskView, ModelSpecWire, TaskStatus,
};
use crate::AppState;

#[derive(Deserialize)]
pub struct StartGenerationInput {
    pub session_id: String,
    pub pipe_id: String,
    /// Final prompt string built by the frontend prompt engine.
    pub prompt: String,
    /// Per-piece model override from the generate modal (Phase 4). None = use
    /// the global provider setting. Recorded in the generation log; the
    /// provider engine consumes these when it lands.
    #[serde(default)]
    pub image_model: Option<String>,
    #[serde(default)]
    pub video_model: Option<String>,
    /// Reproducibility seed (docs/agnes-model-catalog.md). None = the
    /// provider picks; the value is recorded in the generation log.
    #[serde(default)]
    pub seed: Option<i64>,
    /// Provider profile that owns the API slots (docs/provider-engine-tasks.md,
    /// Phase A). Keys are read from the profile settings blob at request time only.
    #[serde(default)]
    pub profile_id: Option<String>,
    /// Resolved model specs from the frontend catalog (Phase A). Tolerant:
    /// old callers send no specs and the fields default to None.
    #[serde(default)]
    pub image_spec: Option<ModelSpecWire>,
    #[serde(default)]
    pub video_spec: Option<ModelSpecWire>,
}

#[derive(Deserialize)]
pub struct TaskIdInput {
    pub task_id: String,
}

#[tauri::command]
pub async fn start_generation(
    input: StartGenerationInput,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let composer = {
        let db = &state.db.lock().await;
        db.get_composer(&input.session_id)
            .await
            .map_err(|e| e.to_string())?
    };
    let pipe = composer
        .pipes
        .iter()
        .find(|p| p.id == input.pipe_id)
        .ok_or_else(|| "Pipe not found".to_string())?;

    let task_id = uuid::Uuid::new_v4().to_string();
    let view = GenerationTaskView {
        task_id: task_id.clone(),
        session_id: input.session_id.clone(),
        pipe_id: input.pipe_id.clone(),
        status: TaskStatus::Queued,
        progress: 0.0,
        stages: crate::generation::TaskRegistry::build_stages(&task_id, pipe),
        error: None,
        output_path: None,
    };
    let engine_input = EngineInput {
        prompt: input.prompt,
        pipe_id: input.pipe_id.clone(),
        fps: composer.fps,
        resolution: composer.resolution.clone(),
        orientation: composer.orientation.clone(),
        q_value: pipe.q_value,
        c_value: pipe.c_value,
        image_model: input.image_model,
        video_model: input.video_model,
        seed: input.seed,
        profile_id: input.profile_id,
        image_spec: input.image_spec,
        video_spec: input.video_spec,
    };

    state.generation.registry.start(view, engine_input).await?;

    Ok(serde_json::json!({ "task_id": task_id }))
}

#[tauri::command]
pub async fn get_generation_task(
    input: TaskIdInput,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    if let Some(view) = state.generation.registry.get(&input.task_id) {
        return Ok(serde_json::to_value(view).map_err(|e| e.to_string())?);
    }

    // Terminal fallback: rebuild from the DB row.
    let row = {
        let db = &state.db.lock().await;
        db.get_generation_task_row(&input.task_id)
            .await
            .map_err(|e| e.to_string())?
    }
    .ok_or_else(|| "Task not found".to_string())?;

    let stages: Vec<GenerationStageView> = row
        .stages_json
        .and_then(|j| serde_json::from_str(&j).ok())
        .unwrap_or_default();
    let status = match row.status.as_str() {
        "queued" => TaskStatus::Queued,
        "running" => TaskStatus::Running,
        "done" => TaskStatus::Done,
        "cancelled" => TaskStatus::Cancelled,
        _ => TaskStatus::Error,
    };
    let view = GenerationTaskView {
        task_id: row.id,
        session_id: row.session_id,
        pipe_id: row.pipe_id,
        status,
        progress: row.progress as f32,
        stages,
        error: row.error,
        output_path: row.output_path,
    };
    Ok(serde_json::to_value(view).map_err(|e| e.to_string())?)
}

#[tauri::command]
pub async fn cancel_generation(
    input: TaskIdInput,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.generation.registry.cancel(&input.task_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn start_generation_input_seed_is_optional() {
        // No seed key (pre-seed callers) → None.
        let without: StartGenerationInput = serde_json::from_value(serde_json::json!({
            "session_id": "s",
            "pipe_id": "p",
            "prompt": "x"
        }))
        .unwrap();
        assert!(without.seed.is_none());

        // Explicit seed round-trips.
        let with: StartGenerationInput = serde_json::from_value(serde_json::json!({
            "session_id": "s",
            "pipe_id": "p",
            "prompt": "x",
            "seed": 42
        }))
        .unwrap();
        assert_eq!(with.seed, Some(42));
    }

    #[test]
    fn start_generation_input_tolerates_missing_specs_and_profile() {
        // Pre-Phase-A caller: no profile_id / no specs → all None.
        let legacy: StartGenerationInput = serde_json::from_value(serde_json::json!({
            "session_id": "s",
            "pipe_id": "p",
            "prompt": "x"
        }))
        .unwrap();
        assert!(legacy.profile_id.is_none());
        assert!(legacy.image_spec.is_none());
        assert!(legacy.video_spec.is_none());

        // New caller with a full spec round-trips into ModelSpecWire.
        let full: StartGenerationInput = serde_json::from_value(serde_json::json!({
            "session_id": "s",
            "pipe_id": "p",
            "prompt": "x",
            "profile_id": "prof-1",
            "video_spec": {
                "id": "agnes-video-2.5-flash",
                "kind": "video",
                "endpoint": "/v1/videos",
                "sync": false,
                "requestFormat": "video-job-seconds",
                "limits": { "seconds": [4.0, 12.0], "sizeMap": { "720p": "720P" } },
                "supportsSeed": true
            }
        }))
        .unwrap();
        assert_eq!(full.profile_id.as_deref(), Some("prof-1"));
        let vspec = full.video_spec.as_ref().unwrap();
        assert_eq!(vspec.id, "agnes-video-2.5-flash");
        assert!(vspec.supports_seed());
        assert_eq!(vspec.limits.seconds, Some([4.0, 12.0]));
    }
}
