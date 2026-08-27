use crate::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

// ── Request types ────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct CreatePipeRequest {
    pub session_id: String,
    pub composer_id: String,
    pub name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdatePipeConfigRequest {
    pub pipe_id: String,
    pub num_inference_steps: Option<u32>,
    pub cfg_scale: Option<f32>,
    pub target_frames: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct SetKeyframeRequest {
    pub pipe_id: String,
    pub slot_index: u8,
    pub source_type: String,
    pub source_value: String,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AddPromptNodeRequest {
    pub pipe_id: String,
    pub parent_id: Option<String>,
    pub tag: String,
    pub value: String,
    pub frame_start: Option<u32>,
    pub frame_end: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSessionSettingsRequest {
    pub session_id: String,
    pub resolution: Option<String>,
    pub aspect_ratio: Option<String>,
    pub total_frames: Option<u32>,
    pub fps: Option<f64>,
}

// ── Response types ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct PipeRowResponse {
    pub id: String,
    pub name: String,
    pub order_index: usize,
    pub num_inference_steps: u32,
    pub cfg_scale: f32,
    pub target_frames: Option<u32>,
    pub status: String,
    pub keyframes: Vec<KeyframeSlotResponse>,
    pub prompt_nodes: Vec<PromptNodeResponse>,
}

#[derive(Debug, Serialize)]
pub struct KeyframeSlotResponse {
    pub slot_index: u8,
    pub source_type: String,
    pub source_value: String,
    pub description: Option<String>,
    pub has_image: bool,
}

#[derive(Debug, Serialize)]
pub struct PromptNodeResponse {
    pub id: String,
    pub parent_id: Option<String>,
    pub tag: String,
    pub value: String,
    pub frame_start: Option<u32>,
    pub frame_end: Option<u32>,
    pub enabled: bool,
}

// ── Tauri Commands ──────────────────────────────────────────────────────────

/// Get the full composer configuration for a session
#[tauri::command]
pub async fn get_composer(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let db = &state.db.lock().await;
    
    let composer = db.get_composer(&session_id).await.map_err(|e| e.to_string())?;
    let settings = db.get_or_create_session_settings(&session_id).await.map_err(|e| e.to_string())?;
    let pipes = db.list_pipes(&composer.id).await.map_err(|e| e.to_string())?;
    
    let pipes_json: Vec<serde_json::Value> = pipes.iter().map(|pipe| {
        let status_str = match &pipe.status {
            crate::models::PipeStatus::Idle => "idle",
            crate::models::PipeStatus::Generating => "generating",
            crate::models::PipeStatus::Completed => "completed",
            crate::models::PipeStatus::Error(_) => "error",
        };
        
        serde_json::json!({
            "id": pipe.id,
            "name": pipe.name,
            "order_index": pipe.order_index,
            "num_inference_steps": pipe.num_inference_steps,
            "cfg_scale": pipe.cfg_scale,
            "target_frames": pipe.target_frames,
            "task_id": pipe.task_id,
            "status": status_str.trim_start_matches("error:"),
            "keyframes": pipe.keyframes.iter().map(|kf| {
                serde_json::json!({
                    "slot_index": kf.slot_index,
                    "source_type": kf.source_type,
                    "source_value": kf.source_value,
                    "description": kf.description,
                    "has_image": kf.has_image(),
                })
            }).collect::<Vec<_>>(),
            "prompt_nodes": pipe.prompt_nodes.iter().map(|node| {
                serde_json::json!({
                    "id": node.id,
                    "parent_id": node.parent_id,
                    "tag": format!("{:?}", node.tag).to_lowercase(),
                    "value": node.value,
                    "frame_start": node.frame_start,
                    "frame_end": node.frame_end,
                    "enabled": node.enabled,
                })
            }).collect::<Vec<_>>()
        })
    }).collect();
    
    Ok(serde_json::json!({
        "id": composer.id,
        "session_id": composer.session_id,
        "name": composer.name,
        "state": format!("{:?}", composer.state).to_lowercase(),
        "version": composer.version,
        "pipes": pipes_json,
        "settings": serde_json::json!({
            "resolution": format!("{:?}", settings.resolution).to_lowercase(),
            "aspect_ratio": format!("{:?}", settings.aspect_ratio).to_lowercase(),
            "total_frames": settings.total_frames,
            "fps": settings.fps,
            "max_frames": settings.resolution.max_frames(),
        })
    }))
}

/// Save the entire composer configuration
#[tauri::command]
pub async fn save_composer(
    config: serde_json::Value,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = &state.db.lock().await;
    // If config is wrapped in { sessionId, sessionData }, unwrap it
    let composer: crate::models::ComposerConfig = if config.get("sessionId").is_some() && config.get("sessionData").is_some() {
        let session_data = config.get("sessionData").unwrap();
        // Parse as frontend format and convert to backend
        let frontend: crate::models::frontend_conversion::FrontendComposerConfig =
            serde_json::from_value(session_data.clone())
                .map_err(|e| format!("Invalid frontend session data: {}", e))?;
        frontend.to_backend()
    } else {
        serde_json::from_value(config)
            .map_err(|e| format!("Invalid composer config: {}", e))?
    };
    db.save_composer(&composer).await.map_err(|e| e.to_string())
}

/// Add a new pipe
#[tauri::command]
pub async fn add_pipe(
    req: CreatePipeRequest,
    state: State<'_, AppState>,
) -> Result<PipeRowResponse, String> {
    let db = &state.db.lock().await;
    
    let name = req.name.unwrap_or_else(|| format!("Pipe {}", chrono::Utc::now().timestamp()));
    let pipe = db.add_pipe(&req.composer_id, &req.session_id, &name, 0)
        .await.map_err(|e| e.to_string())?;
    
    Ok(PipeRowResponse {
        id: pipe.id,
        name: pipe.name,
        order_index: pipe.order_index,
        num_inference_steps: pipe.num_inference_steps,
        cfg_scale: pipe.cfg_scale,
        target_frames: pipe.target_frames,
        status: format!("{:?}", pipe.status).to_lowercase(),
        keyframes: (1..=3).map(|i| KeyframeSlotResponse {
            slot_index: i,
            source_type: "none".to_string(),
            source_value: String::new(),
            description: None,
            has_image: false,
        }).collect(),
        prompt_nodes: Vec::new(),
    })
}

/// Update pipe configuration
#[tauri::command]
pub async fn update_pipe_config(
    req: UpdatePipeConfigRequest,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = &state.db.lock().await;
    
    let updates = serde_json::json!({
        "num_inference_steps": req.num_inference_steps.unwrap_or(20),
        "cfg_scale": req.cfg_scale.unwrap_or(7.5),
        "target_frames": req.target_frames,
    });
    
    db.update_pipe(&req.pipe_id, &updates).await.map_err(|e| e.to_string())
}

/// Remove a pipe
#[tauri::command]
pub async fn remove_pipe(
    pipe_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = &state.db.lock().await;
    db.delete_pipe(&pipe_id).await.map_err(|e| e.to_string())
}

/// Set a keyframe image
#[tauri::command]
pub async fn set_keyframe(
    req: SetKeyframeRequest,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = &state.db.lock().await;
    db.add_keyframe(
        &req.pipe_id, req.slot_index, &req.source_type,
        &req.source_value, req.description.as_deref(),
    ).await.map_err(|e| e.to_string())?;
    Ok(())
}

/// Clear a keyframe
#[tauri::command]
pub async fn clear_keyframe(
    pipe_id: String,
    slot_index: u8,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = &state.db.lock().await;
    db.remove_keyframe(&pipe_id, slot_index).await.map_err(|e| e.to_string())
}

/// List keyframes for a pipe
#[tauri::command]
pub async fn list_keyframes(
    pipe_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<KeyframeSlotResponse>, String> {
    let db = &state.db.lock().await;
    let keyframes = db.list_keyframes(&pipe_id).await.map_err(|e| e.to_string())?;
    Ok(keyframes.into_iter().map(|kf| KeyframeSlotResponse {
        slot_index: kf.slot_index,
        source_type: kf.source_type.clone(),
        source_value: kf.source_value.clone(),
        description: kf.description.clone(),
        has_image: kf.has_image(),
    }).collect())
}

/// Add a prompt node to a pipe with one-type-per-row validation
#[tauri::command]
pub async fn add_prompt_node(
    req: AddPromptNodeRequest,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let db = &state.db.lock().await;
    
    // Validate parent-child tag compatibility
    if let Some(parent_id) = &req.parent_id {
        let parent_nodes = db.list_prompt_nodes(&req.pipe_id).await
            .map_err(|e| e.to_string())?;
        
        let parent = parent_nodes.iter().find(|n| n.id == *parent_id);
        if let Some(parent) = parent {
            // If parent exists, check that we're adding allowed child types
            // Only segments can have children (movement, rotation, etc.)
            if parent.tag != crate::models::PromptTag::Segment && parent.tag != crate::models::PromptTag::GlobalStyle {
                return Err(format!(
                    "Cannot add {} under {}. Only segments and global_style can have children.",
                    req.tag, format!("{:?}", parent.tag).to_lowercase()
                ));
            }
            
            // For segments, validate child type is allowed
            if parent.tag == crate::models::PromptTag::Segment {
                let allowed_children = [
                    crate::models::PromptTag::Movement,
                    crate::models::PromptTag::Rotation,
                    crate::models::PromptTag::FocalPoint,
                    crate::models::PromptTag::Lighting,
                    crate::models::PromptTag::Exposure,
                    crate::models::PromptTag::LensEffect,
                ];
                let requested_tag = match req.tag.as_str() {
                    "movement" => crate::models::PromptTag::Movement,
                    "rotation" => crate::models::PromptTag::Rotation,
                    "focal_point" => crate::models::PromptTag::FocalPoint,
                    "lighting" => crate::models::PromptTag::Lighting,
                    "exposure" => crate::models::PromptTag::Exposure,
                    "lens_effect" => crate::models::PromptTag::LensEffect,
                    _ => return Err(format!("Invalid child tag '{}' under segment", req.tag)),
                };
                if !allowed_children.contains(&requested_tag) {
                    return Err(format!("Cannot add {} under segment", req.tag));
                }
            }
        }
    }
    
    let node_id = db.add_prompt_node(
        &req.pipe_id,
        req.parent_id.as_deref(),
        &req.tag,
        &req.value,
        req.frame_start,
        req.frame_end,
    ).await.map_err(|e| e.to_string())?;
    
    Ok(node_id)
}

/// Update a prompt node
#[tauri::command]
pub async fn update_prompt_node(
    node_id: String,
    value: Option<String>,
    frame_start: Option<u32>,
    frame_end: Option<u32>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = &state.db.lock().await;
    db.update_prompt_node(
        &node_id,
        value.as_deref(),
        frame_start,
        frame_end,
    ).await.map_err(|e| e.to_string())
}

/// Toggle prompt node enabled state
#[tauri::command]
pub async fn toggle_prompt_node(
    node_id: String,
    enabled: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = &state.db.lock().await;
    db.toggle_prompt_node(&node_id, enabled).await.map_err(|e| e.to_string())
}

/// Remove a prompt node and its children
#[tauri::command]
pub async fn remove_prompt_node(
    node_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = &state.db.lock().await;
    db.remove_prompt_node(&node_id).await.map_err(|e| e.to_string())
}

/// Update session settings
#[tauri::command]
pub async fn update_session_settings(
    req: UpdateSessionSettingsRequest,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let db = &state.db.lock().await;
    
    let mut settings = db.get_or_create_session_settings(&req.session_id)
        .await.map_err(|e| e.to_string())?;
    
    if let Some(resolution) = &req.resolution {
        settings.resolution = match resolution.as_str() {
            "480p" => crate::models::Resolution::P480,
            "720p" => crate::models::Resolution::P720,
            "1080p" => crate::models::Resolution::P1080,
            _ => return Err(format!("Invalid resolution: {}", resolution)),
        };
    }
    
    if let Some(aspect_ratio) = &req.aspect_ratio {
        settings.aspect_ratio = match aspect_ratio.as_str() {
            "9:16" => crate::models::AspectRatio::R9x16,
            "1:1" => crate::models::AspectRatio::R1x1,
            _ => crate::models::AspectRatio::R16x9,
        };
    }
    
    if let Some(frames) = req.total_frames {
        if !settings.validate_frame_count(frames) {
            return Err(format!(
                "Frame count {} is invalid for resolution {}. Max: {}, must satisfy 8n+1",
                frames,
                format!("{:?}", settings.resolution),
                settings.resolution.max_frames()
            ));
        }
        settings.total_frames = frames;
    }
    
    if let Some(fps) = req.fps {
        settings.fps = fps;
    }
    
    db.save_session_settings(&settings).await.map_err(|e| e.to_string())?;
    
    Ok(serde_json::json!({
        "resolution": format!("{:?}", settings.resolution).to_lowercase(),
        "aspect_ratio": format!("{:?}", settings.aspect_ratio).to_lowercase(),
        "total_frames": settings.total_frames,
        "fps": settings.fps,
        "max_frames": settings.resolution.max_frames(),
    }))
}

/// Get session settings
#[tauri::command]
pub async fn get_session_settings(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let db = &state.db.lock().await;
    let settings = db.get_or_create_session_settings(&session_id)
        .await.map_err(|e| e.to_string())?;
    
    Ok(serde_json::json!({
        "id": settings.id,
        "session_id": settings.session_id,
        "resolution": format!("{:?}", settings.resolution).to_lowercase(),
        "aspect_ratio": format!("{:?}", settings.aspect_ratio).to_lowercase(),
        "total_frames": settings.total_frames,
        "fps": settings.fps,
        "max_frames": settings.resolution.max_frames(),
    }))
}

/// Trigger generation from composer configuration (stub - backend not yet implemented)
#[tauri::command]
pub async fn generate_from_composer(
    session_id: String,
    composer_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let task_id = uuid::Uuid::new_v4().to_string();
    
    Ok(serde_json::json!({
        "task_id": task_id,
        "session_id": session_id,
        "composer_id": composer_id,
        "status": "queued",
        "message": "Generation task created - backend integration pending",
    }))
}
