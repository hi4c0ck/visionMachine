use crate::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

// ── Request/Response types ───────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct SaveInput {
    pub session_id: String,
    pub name: String,
    pub pipes: Vec<serde_json::Value>,
}

#[derive(Debug, Serialize)]
pub struct ComposerData {
    pub id: String,
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

#[tauri::command]
pub async fn add_pipe(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let db = &state.db.lock().await;
    let mut composer = db.get_composer(&session_id).await.map_err(|e| e.to_string())?;
    
    let pipe = crate::models::Pipe::new(&format!("Pipe {}", composer.pipes.len() + 1), 121);
    composer.pipes.push(pipe);
    
    db.save_composer(&composer).await.map_err(|e| e.to_string())?;
    
    let last = composer.pipes.last().unwrap();
    serde_json::to_value(last).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_pipe(
    pipe_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = &state.db.lock().await;
    let pipes = db.list_pipes("").await?;
    
    if pipes.is_empty() {
        return Err("No pipes found".to_string());
    }
    
    let mut composer = db.get_composer(&pipes[0].id[..8]).await.map_err(|e| e.to_string())?;
    
    composer.pipes.retain(|p| p.id != pipe_id);
    
    db.save_composer(&composer).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_pipe_config(
    pipe_id: String,
    q_value: Option<u32>,
    c_value: Option<f32>,
    length_frames: Option<u32>,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let db = &state.db.lock().await;
    let pipes = db.list_pipes("").await?;
    
    if pipes.is_empty() {
        return Err("No pipes found".to_string());
    }
    
    let mut composer = db.get_composer(&pipes[0].id[..8]).await.map_err(|e| e.to_string())?;
    
    if let Some(pipe) = composer.pipes.iter_mut().find(|p| p.id == pipe_id) {
        if let Some(q) = q_value {
            pipe.q_value = q;
        }
        if let Some(c) = c_value {
            pipe.c_value = c;
        }
        if let Some(frames) = length_frames {
            pipe.length_frames = frames;
        }
    } else {
        return Err(format!("Pipe {} not found", pipe_id));
    }
    
    db.save_composer(&composer).await.map_err(|e| e.to_string())?;
    
    let pipe = composer.pipes.iter().find(|p| p.id == pipe_id).unwrap();
    serde_json::to_value(pipe).map_err(|e| e.to_string())
}
