use sqlx::{sqlite::{SqlitePool, SqlitePoolOptions}, Row};
use uuid::Uuid;

pub struct Database {
    pool: SqlitePool,
}

impl Database {
    /// Create from an existing pool (for sync initialization)
    pub fn from_pool(pool: SqlitePool) -> Self {
        Self { pool }
    }
    
    /// Create a new database connection (async - use during setup)
    pub async fn new(path: &str) -> Result<Self, String> {
        if path.contains("..") {
            return Err("Invalid path".to_string());
        }
        
        // Ensure parent directory exists
        if let Some(parent) = std::path::Path::new(path).parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        }
        
        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect(&format!("sqlite://{}", path))
            .await
            .map_err(|e| format!("Failed to connect to database: {}", e))?;
        
        Ok(Self { pool })
    }
    
    pub async fn migrate(&self) -> Result<(), String> {
        sqlx::query("CREATE TABLE IF NOT EXISTS profiles (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )").execute(&self.pool).await.map_err(|e| e.to_string())?;
        
        sqlx::query("CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            profile_id TEXT NOT NULL,
            name TEXT NOT NULL,
            directory_path TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
        )").execute(&self.pool).await.map_err(|e| e.to_string())?;
        
        sqlx::query("CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            name TEXT NOT NULL,
            fps INTEGER DEFAULT 24,
            resolution TEXT DEFAULT '720p',
            orientation TEXT DEFAULT 'horizontal',
            pipes_json TEXT,
            total_generated_frames INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        )").execute(&self.pool).await.map_err(|e| e.to_string())?;
        
        // Create indexes
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_projects_profile ON projects(profile_id)")
            .execute(&self.pool)
            .await
            .map_err(|e| e.to_string())?;
        
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id)")
            .execute(&self.pool)
            .await
            .map_err(|e| e.to_string())?;
        
        Ok(())
    }
    
    // Profile operations
    pub async fn create_profile(&self, name: &str) -> Result<String, String> {
        let id = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO profiles (id, name) VALUES (?, ?)")
            .bind(&id).bind(name)
            .execute(&self.pool).await.map_err(|e| e.to_string())?;
        Ok(id)
    }
    
    pub async fn list_profiles(&self) -> Result<Vec<serde_json::Value>, String> {
        let rows = sqlx::query("SELECT * FROM profiles ORDER BY created_at DESC")
            .fetch_all(&self.pool).await.map_err(|e| e.to_string())?;
        
        Ok(rows.iter().map(|row| {
            serde_json::json!({
                "id": row.get::<String, _>("id"),
                "name": row.get::<String, _>("name"),
                "created_at": row.get::<String, _>("created_at")
            })
        }).collect())
    }
    
    // Project operations
    pub async fn create_project(&self, profile_id: &str, name: &str, directory_path: Option<&str>) -> Result<String, String> {
        let id = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO projects (id, profile_id, name, directory_path) VALUES (?, ?, ?, ?)")
            .bind(&id).bind(profile_id).bind(name).bind(directory_path)
            .execute(&self.pool).await.map_err(|e| e.to_string())?;
        Ok(id)
    }
    
    pub async fn list_projects(&self, profile_id: &str) -> Result<Vec<serde_json::Value>, String> {
        let rows = sqlx::query("SELECT * FROM projects WHERE profile_id = ? ORDER BY created_at DESC")
            .bind(profile_id)
            .fetch_all(&self.pool).await.map_err(|e| e.to_string())?;
        
        Ok(rows.iter().map(|row| {
            serde_json::json!({
                "id": row.get::<String, _>("id"),
                "profile_id": row.get::<String, _>("profile_id"),
                "name": row.get::<String, _>("name"),
                "directory_path": row.get::<Option<String>, _>("directory_path"),
                "created_at": row.get::<String, _>("created_at")
            })
        }).collect())
    }
    
    // Session operations
    pub async fn create_session(&self, project_id: &str, name: &str, pipes_json: Option<&str>) -> Result<String, String> {
        let id = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO sessions (id, project_id, name, pipes_json) VALUES (?, ?, ?, ?)")
            .bind(&id).bind(project_id).bind(name).bind(pipes_json)
            .execute(&self.pool).await.map_err(|e| e.to_string())?;
        Ok(id)
    }
    
    pub async fn list_sessions(&self, project_id: &str) -> Result<Vec<serde_json::Value>, String> {
        let rows = sqlx::query("SELECT * FROM sessions WHERE project_id = ? ORDER BY created_at DESC")
            .bind(project_id)
            .fetch_all(&self.pool).await.map_err(|e| e.to_string())?;
        
        Ok(rows.iter().map(|row| {
            serde_json::json!({
                "id": row.get::<String, _>("id"),
                "project_id": row.get::<String, _>("project_id"),
                "name": row.get::<String, _>("name"),
                "fps": row.get::<i64, _>("fps"),
                "resolution": row.get::<String, _>("resolution"),
                "orientation": row.get::<String, _>("orientation"),
                "pipes_json": row.get::<Option<String>, _>("pipes_json"),
                "total_generated_frames": row.get::<i64, _>("total_generated_frames"),
                "created_at": row.get::<String, _>("created_at")
            })
        }).collect())
    }
    
    pub async fn update_session(&self, session_id: &str, updates: &serde_json::Value) -> Result<(), String> {
        let mut set_clauses: Vec<String> = vec![];
        let mut args: Vec<String> = vec![];
        
        if let Some(name) = updates.get("name").and_then(|v| v.as_str()) {
            set_clauses.push("name = ?".to_string());
            args.push(name.to_string());
        }
        if let Some(fps) = updates.get("fps").and_then(|v| v.as_i64()) {
            set_clauses.push("fps = ?".to_string());
            args.push(fps.to_string());
        }
        if let Some(resolution) = updates.get("resolution").and_then(|v| v.as_str()) {
            set_clauses.push("resolution = ?".to_string());
            args.push(resolution.to_string());
        }
        if let Some(orientation) = updates.get("orientation").and_then(|v| v.as_str()) {
            set_clauses.push("orientation = ?".to_string());
            args.push(orientation.to_string());
        }
        if let Some(pipes_json) = updates.get("pipes_json").and_then(|v| v.as_str()) {
            set_clauses.push("pipes_json = ?".to_string());
            args.push(pipes_json.to_string());
        }
        
        set_clauses.push("updated_at = CURRENT_TIMESTAMP".to_string());
        args.push(session_id.to_string());
        
        let sql = format!("UPDATE sessions SET {} WHERE id = ?", set_clauses.join(", "));
        
        let mut query = sqlx::query(&sql);
        for arg in &args {
            query = query.bind(arg);
        }
        query.execute(&self.pool).await.map_err(|e| e.to_string())?;
        
        Ok(())
    }
    
    pub async fn delete_session(&self, session_id: &str) -> Result<(), String> {
        sqlx::query("DELETE FROM sessions WHERE id = ?")
            .bind(session_id)
            .execute(&self.pool)
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}
