use super::db::Database;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Storage manager for VisionMachine
#[derive(Clone)]
pub struct StorageManager {
    db: Arc<Mutex<Database>>,
    current_path: Arc<Mutex<String>>,
}

#[derive(Clone)]
pub struct StorageManagerHandle {
    pub manager: Arc<StorageManager>,
}

impl StorageManager {
    pub fn new(db: Database) -> Self {
        let default_path = Self::get_default_storage_path();
        Self {
            db: Arc::new(Mutex::new(db)),
            current_path: Arc::new(Mutex::new(default_path)),
        }
    }
    
    pub fn get_default_storage_path() -> String {
        std::env::temp_dir()
            .join("VisionMachine")
            .to_string_lossy()
            .to_string()
    }
    
    pub async fn initialize(&self) -> Result<(), Box<dyn std::error::Error>> {
        let path = self.get_current_path().await;
        
        // Ensure directory exists
        std::fs::create_dir_all(&path)?;
        
        let mut db = self.db.lock().await;
        db.initialize().await?;
        
        // Store initial path
        db.set_setting("storage_path", &path).await?;
        
        Ok(())
    }
    
    pub async fn get_current_path(&self) -> String {
        self.current_path.lock().await.clone()
    }
    
    pub async fn set_storage_path(&self, new_path: &str) -> Result<(), String> {
        // Validate path
        if new_path.contains("..") {
            return Err("Invalid path: contains traversal".into());
        }
        
        // Ensure directory exists
        std::fs::create_dir_all(new_path).map_err(|e| format!("Cannot create directory: {}", e))?;
        
        // Update path
        *self.current_path.lock().await = new_path.to_string();
        
        // Reinitialize database
        let mut db = self.db.lock().await;
        db.initialize().await.map_err(|e| e.to_string())?;
        db.set_setting("storage_path", new_path).await.map_err(|e| e.to_string())?;
        
        Ok(())
    }
    
    pub fn get_db(&self) -> Arc<Mutex<Database>> {
        self.db.clone()
    }
    
    pub async fn stats(&self) -> Result<serde_json::Value, String> {
        self.db.lock().await.stats().await.map_err(|e| e.to_string())
    }
}

// Tauri Commands

#[tauri::command]
async fn get_storage_path(manager: tauri::State<StorageManagerHandle>) -> String {
    manager.manager.get_current_path().await
}

#[tauri::command]
async fn set_storage_path(
    new_path: String,
    manager: tauri::State<StorageManagerHandle>,
) -> Result<(), String> {
    manager.manager.set_storage_path(&new_path).await
}

#[tauri::command]
async fn get_database_stats(manager: tauri::State<StorageManagerHandle>) -> Result<serde_json::Value, String> {
    manager.manager.stats().await
}
