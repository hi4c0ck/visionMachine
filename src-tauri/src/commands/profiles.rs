use crate::storage::Database;
use tauri::{Emitter, State};

#[tauri::command]
pub async fn create_profile(
    name: String,
    email: Option<String>,
    db: State<Database>,
) -> Result<serde_json::Value, String> {
    db.create_profile(&name, email.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_profiles(
    db: State<Database>,
) -> Result<Vec<serde_json::Value>, String> {
    db.list_profiles()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_current_profile(
    db: State<Database>,
) -> Result<Option<serde_json::Value>, String> {
    let mut conn = db.get_conn().await.map_err(|e| e.to_string())?;
    
    let row = sqlx::query("SELECT * FROM profiles ORDER BY updated_at DESC LIMIT 1")
        .fetch_optional(&mut **conn)
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(row.map(|r| serde_json::json!({
        "id": r.get::<String, _>("id"),
        "name": r.get::<String, _>("name"),
        "email": r.get::<Option<String>, _>("email"),
        "created_at": r.get::<String, _>("created_at"),
        "active": true
    })))
}

#[tauri::command]
pub async fn login_profile(
    profile_id: String,
    db: State<Database>,
) -> Result<serde_json::Value, String> {
    let mut conn = db.get_conn().await.map_err(|e| e.to_string())?;
    
    // Check if profile exists
    let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM profiles WHERE id = ?)")
        .bind(&profile_id)
        .fetch_one(&mut **conn)
        .await
        .map_err(|e| e.to_string())?;
    
    if !exists {
        return Err("Profile not found".to_string());
    }
    
    // Update timestamp to mark as active
    sqlx::query("UPDATE profiles SET updated_at = ? WHERE id = ?")
        .bind(chrono::Utc::now().to_rfc3339())
        .bind(&profile_id)
        .execute(&mut **conn)
        .await
        .map_err(|e| e.to_string())?;
    
    // Return profile data
    let row = sqlx::query("SELECT * FROM profiles WHERE id = ?")
        .bind(&profile_id)
        .fetch_one(&mut **conn)
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(serde_json::json!({
        "id": row.get::<String, _>("id"),
        "name": row.get::<String, _>("name"),
        "email": row.get::<Option<String>, _>("email"),
        "created_at": row.get::<String, _>("created_at"),
        "active": true
    }))
}

#[tauri::command]
pub async fn logout_profile(
    app: tauri::AppHandle,
) -> Result<(), String> {
    app.emit("profile_logged_out", ())
        .map_err(|e| e.to_string())?;
    Ok(())
}
