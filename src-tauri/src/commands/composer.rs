use crate::AppState;
use serde::Deserialize;
use tauri::State;

// ── Request/Response types ───────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveInput {
    pub session_id: String,
    pub name: String,
    pub pipes: Vec<serde_json::Value>,
    #[serde(default = "default_fps")]
    pub fps: u32,
    #[serde(default)]
    pub resolution: Option<String>,
    #[serde(default)]
    pub orientation: Option<String>,
    #[serde(default)]
    pub total_generated_frames: Option<u32>,
}

fn default_fps() -> u32 {
    24
}

// ── Commands ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_composer(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let db = &state.db.lock().await;
    let composer = db.get_composer(&session_id).await.map_err(|e| e.to_string())?;
    
    let pipes: Vec<serde_json::Value> = composer.pipes.iter()
        .map(|p| serde_json::to_value(p).unwrap_or_default())
        .collect();
    
    Ok(serde_json::json!({
        "id": composer.id,
        "sessionId": composer.session_id,
        "name": composer.name,
        "pipes": pipes,
        "fps": composer.fps,
        "resolution": composer.resolution,
        "orientation": composer.orientation,
        "totalGeneratedFrames": composer.total_generated_frames,
    }))
}

#[tauri::command]
pub async fn save_composer(
    input: SaveInput,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = &state.db.lock().await;
    
    // Convert JSON pipes to typed Pipes
    let pipes: Vec<crate::models::Pipe> = input.pipes.iter()
        .map(|p| serde_json::from_value(p.clone()).map_err(|e| e.to_string()))
        .collect::<Result<Vec<_>, _>>()?;
    
    // Preserve existing composer id when one is already stored for this session
    let existing = db.get_composer(&input.session_id).await.ok();
    let composer = crate::models::ComposerConfig {
        id: existing
            .as_ref()
            .map(|c| c.id.clone())
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string()),
        session_id: input.session_id.clone(),
        name: input.name,
        pipes,
        fps: input.fps,
        resolution: input.resolution.unwrap_or_else(|| "720p".to_string()),
        orientation: input.orientation.unwrap_or_else(|| "horizontal".to_string()),
        total_generated_frames: input.total_generated_frames.unwrap_or(0),
        created_at: None,
        updated_at: None,
    };
    
    db.save_composer(&composer).await.map_err(|e| e.to_string())
}

