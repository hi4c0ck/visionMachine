use crate::AppState;
use serde::Deserialize;
use tauri::State;

// ── Request/Response types ───────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct SaveInput {
    pub session_id: String,
    pub name: String,
    pub pipes: Vec<serde_json::Value>,
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
        "session_id": composer.session_id,
        "name": composer.name,
        "pipes": pipes,
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
    
    let composer = crate::models::ComposerConfig {
        id: uuid::Uuid::new_v4().to_string(),
        session_id: input.session_id.clone(),
        name: input.name,
        pipes,
        created_at: None,
        updated_at: None,
    };
    
    db.save_composer(&composer).await.map_err(|e| e.to_string())
}

