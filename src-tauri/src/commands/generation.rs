//! Thin generation commands: start / poll / cancel for pipe-level tasks.
//! The progress modal polls `get_generation_task`; live state comes from the
//! in-memory registry, terminal tasks fall back to the DB row.

use serde::Deserialize;
use tauri::State;

use crate::generation::{EngineInput, GenerationStageView, GenerationTaskView, TaskStatus};
use crate::AppState;

#[derive(Deserialize)]
pub struct StartGenerationInput {
    pub session_id: String,
    pub pipe_id: String,
    /// Final prompt string built by the frontend prompt engine.
    pub prompt: String,
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
