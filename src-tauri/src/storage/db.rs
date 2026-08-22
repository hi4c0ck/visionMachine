use sqlx::{SqlitePool, Pool, Row};
use uuid::Uuid;
use chrono::Utc;

pub struct Database {
    pool: Pool<sqlx::sqlite::Sqlite>,
}

impl Database {
    pub async fn new(path: &str) -> Result<Self, Box<dyn std::error::Error>> {
        if path.contains("..") {
            return Err("Path contains directory traversal".into());
        }
        
        // Ensure directory exists
        if let Some(parent) = std::path::Path::new(path).parent() {
            std::fs::create_dir_all(parent)?;
        }
        
        let db_url = format!("sqlite:{}", path);
        let pool = SqlitePool::connect(&db_url).await?;
        
        Ok(Self { pool })
    }
    
    /// Synchronous constructor for use in Tauri setup
    pub fn new_sync(path: &str) -> Result<Self, String> {
        if path.contains("..") {
            return Err("Path contains directory traversal".to_string());
        }
        
        // Ensure parent directory exists
        if let Some(parent) = std::path::Path::new(path).parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        }
        
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|e| format!("Failed to create runtime: {}", e))?;
        
        let db_url = format!("sqlite:{}", path);
        let pool = rt.block_on(async {
            SqlitePool::connect(&db_url).await
        })
        .map_err(|e| format!("Failed to connect to database: {}", e))?;
        
        Ok(Self { pool })
    }

    /// Constructor that accepts a Path directly (avoids encoding issues)
    pub fn new_sync_from_path(path: &std::path::Path) -> Result<Self, String> {
        // Create parent directories
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        }
        
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|e| format!("Failed to create runtime: {}", e))?;
        
        // Use direct path string from OsStr
        let db_url = format!("sqlite://{}?mode=rwc", path.to_string_lossy());
        log::info!("Connecting to DB with URL: {}", db_url);
        
        let pool = rt.block_on(async {
            SqlitePool::connect(&db_url).await
        })
        .map_err(|e| {
            log::error!("Database connection failed: {}", e);
            format!("Failed to connect to database: {}", e)
        })?;
        
        log::info!("Database connected successfully");
        Ok(Self { pool })
    }

    pub async fn initialize(&self) -> Result<(), Box<dyn std::error::Error>> {
        sqlx::query("PRAGMA journal_mode=WAL").execute(&self.pool).await?;
        sqlx::query("PRAGMA foreign_keys=ON").execute(&self.pool).await?;
        sqlx::query("PRAGMA busy_timeout=5000").execute(&self.pool).await?;
        sqlx::query("PRAGMA synchronous=NORMAL").execute(&self.pool).await?;
        
        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS profiles (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        "#).execute(&self.pool).await?;

        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                profile_id TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
            )
        "#).execute(&self.pool).await?;

        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                name TEXT NOT NULL,
                state TEXT DEFAULT 'idle',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            )
        "#).execute(&self.pool).await?;

        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS composers (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL UNIQUE,
                config_json TEXT NOT NULL,
                version INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            )
        "#).execute(&self.pool).await?;

        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS artifacts (
                id TEXT PRIMARY KEY,
                session_id TEXT,
                artifact_type TEXT NOT NULL,
                file_path TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
            )
        "#).execute(&self.pool).await?;

        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        "#).execute(&self.pool).await?;

        sqlx::query("CREATE INDEX IF NOT EXISTS idx_projects_profile ON projects(profile_id)").execute(&self.pool).await?;
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id)").execute(&self.pool).await?;
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_composers_session ON composers(session_id)").execute(&self.pool).await?;
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_artifacts_session ON artifacts(session_id)").execute(&self.pool).await?;
        
        Ok(())
    }

    // ===== Profile Operations =====
    
    pub async fn create_profile(&self, name: &str, email: Option<&str>) -> Result<serde_json::Value, Box<dyn std::error::Error>> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        
        sqlx::query("INSERT INTO profiles (id, name, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
            .bind(&id).bind(name).bind(email).bind(&now).bind(&now)
            .execute(&self.pool).await?;
        
        Ok(serde_json::json!({"id": id, "name": name, "email": email}))
    }

    pub async fn get_profile(&self, id: &str) -> Result<serde_json::Value, Box<dyn std::error::Error>> {
        let row = sqlx::query("SELECT id, name, email, created_at FROM profiles WHERE id = ?")
            .bind(id).fetch_optional(&self.pool).await?;
        
        match row {
            Some(r) => Ok(serde_json::json!({
                "id": r.get::<String, _>("id"),
                "name": r.get::<String, _>("name"),
                "email": r.get::<Option<String>, _>("email"),
                "created_at": r.get::<String, _>("created_at")
            })),
            None => Err("Profile not found".into()),
        }
    }

    pub async fn list_profiles(&self) -> Result<Vec<serde_json::Value>, Box<dyn std::error::Error>> {
        let rows = sqlx::query("SELECT id, name, email, created_at FROM profiles ORDER BY created_at DESC")
            .fetch_all(&self.pool).await?;
        
        Ok(rows.iter().map(|r| serde_json::json!({
            "id": r.get::<String, _>("id"),
            "name": r.get::<String, _>("name"),
            "email": r.get::<Option<String>, _>("email"),
            "created_at": r.get::<String, _>("created_at")
        })).collect())
    }

    // ===== Project Operations =====
    
    pub async fn create_project(&self, profile_id: &str, name: &str, description: Option<&str>) -> Result<serde_json::Value, Box<dyn std::error::Error>> {
        let id = Uuid::new_v4().to_string();
        
        sqlx::query("INSERT INTO projects (id, profile_id, name, description) VALUES (?, ?, ?, ?)")
            .bind(&id).bind(profile_id).bind(name).bind(description)
            .execute(&self.pool).await?;
        
        Ok(serde_json::json!({"id": id, "profile_id": profile_id, "name": name}))
    }

    pub async fn list_projects(&self, profile_id: &str) -> Result<Vec<serde_json::Value>, Box<dyn std::error::Error>> {
        let rows = sqlx::query("SELECT id, name, description, created_at FROM projects WHERE profile_id = ? ORDER BY created_at DESC")
            .bind(profile_id).fetch_all(&self.pool).await?;
        
        Ok(rows.iter().map(|r| serde_json::json!({
            "id": r.get::<String, _>("id"),
            "name": r.get::<String, _>("name"),
            "description": r.get::<Option<String>, _>("description"),
            "created_at": r.get::<String, _>("created_at")
        })).collect())
    }

    // ===== Session Operations =====
    
    pub async fn create_session(&self, project_id: &str, name: &str) -> Result<serde_json::Value, Box<dyn std::error::Error>> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        
        sqlx::query("INSERT INTO sessions (id, project_id, name, state, created_at, updated_at) VALUES (?, ?, ?, 'idle', ?, ?)")
            .bind(&id).bind(project_id).bind(name).bind(&now).bind(&now)
            .execute(&self.pool).await?;
        
        Ok(serde_json::json!({"id": id, "project_id": project_id, "name": name, "state": "idle"}))
    }

    pub async fn list_sessions(&self, project_id: &str) -> Result<Vec<serde_json::Value>, Box<dyn std::error::Error>> {
        let rows = sqlx::query("SELECT id, name, state, created_at FROM sessions WHERE project_id = ? ORDER BY created_at DESC")
            .bind(project_id).fetch_all(&self.pool).await?;
        
        Ok(rows.iter().map(|r| serde_json::json!({
            "id": r.get::<String, _>("id"),
            "name": r.get::<String, _>("name"),
            "state": r.get::<String, _>("state"),
            "created_at": r.get::<String, _>("created_at")
        })).collect())
    }

    // ===== Composer Operations =====
    
    pub async fn get_composer(&self, session_id: &str) -> Result<serde_json::Value, Box<dyn std::error::Error>> {
        match sqlx::query("SELECT id, session_id, config_json, version FROM composers WHERE session_id = ?")
            .bind(session_id).fetch_one(&self.pool).await {
                Ok(row) => Ok(serde_json::json!({
                    "id": row.get::<String, _>("id"),
                    "session_id": row.get::<String, _>("session_id"),
                    "config_json": row.get::<String, _>("config_json"),
                    "version": row.get::<i32, _>("version")
                })),
                Err(sqlx::Error::RowNotFound) => {
                    let id = Uuid::new_v4().to_string();
                    let config = serde_json::json!({"pipes": [], "state": "empty"}).to_string();
                    
                    sqlx::query("INSERT INTO composers (id, session_id, config_json, version) VALUES (?, ?, ?, 1)")
                        .bind(&id).bind(session_id).bind(&config)
                        .execute(&self.pool).await?;
                    
                    Ok(serde_json::json!({"id": id, "session_id": session_id, "config_json": config, "version": 1}))
                }
                Err(e) => Err(e.into()),
            }
    }

    pub async fn update_composer(&self, session_id: &str, config_json: &str) -> Result<serde_json::Value, Box<dyn std::error::Error>> {
        let current_version: i32 = match sqlx::query("SELECT version FROM composers WHERE session_id = ?")
            .bind(session_id).fetch_optional(&self.pool).await? {
                Some(row) => row.try_get(0)?,
                None => 0,
            };
        
        let new_version = current_version + 1;
        
        match sqlx::query("UPDATE composers SET config_json = ?, version = ? WHERE session_id = ?")
            .bind(config_json).bind(new_version).bind(session_id)
            .execute(&self.pool).await {
                Ok(_) => self.get_composer(session_id).await,
                Err(sqlx::Error::RowNotFound) => {
                    let id = Uuid::new_v4().to_string();
                    sqlx::query("INSERT INTO composers (id, session_id, config_json, version) VALUES (?, ?, ?, ?)")
                        .bind(&id).bind(session_id).bind(config_json).bind(1)
                        .execute(&self.pool).await?;
                    
                    Ok(serde_json::json!({"id": id, "session_id": session_id, "config_json": config_json, "version": 1}))
                }
                Err(e) => Err(e.into()),
            }
    }

    // ===== Artifact Operations =====
    
    pub async fn create_artifact(&self, session_id: Option<&str>, artifact_type: &str, file_path: &str) -> Result<serde_json::Value, Box<dyn std::error::Error>> {
        let id = Uuid::new_v4().to_string();
        
        sqlx::query("INSERT INTO artifacts (id, session_id, artifact_type, file_path) VALUES (?, ?, ?, ?)")
            .bind(&id).bind(session_id).bind(artifact_type).bind(file_path)
            .execute(&self.pool).await?;
        
        Ok(serde_json::json!({"id": id, "type": artifact_type, "path": file_path}))
    }

    pub async fn list_artifacts_by_session(&self, session_id: &str) -> Result<Vec<serde_json::Value>, Box<dyn std::error::Error>> {
        let rows = sqlx::query("SELECT id, artifact_type, file_path, created_at FROM artifacts WHERE session_id = ? ORDER BY created_at DESC")
            .bind(session_id).fetch_all(&self.pool).await?;
        
        Ok(rows.iter().map(|r| serde_json::json!({
            "id": r.get::<String, _>("id"),
            "type": r.get::<String, _>("artifact_type"),
            "path": r.get::<String, _>("file_path"),
            "created_at": r.get::<String, _>("created_at")
        })).collect())
    }

    // ===== Settings Operations =====
    
    pub async fn set_setting(&self, key: &str, value: &str) -> Result<(), Box<dyn std::error::Error>> {
        sqlx::query("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)")
            .bind(key).bind(value)
            .execute(&self.pool).await?;
        Ok(())
    }

    pub async fn get_setting(&self, key: &str) -> Result<Option<String>, Box<dyn std::error::Error>> {
        let row = sqlx::query("SELECT value FROM app_settings WHERE key = ?")
            .bind(key).fetch_optional(&self.pool).await?;
        
        match row {
            Some(r) => Ok(Some(r.try_get("value")?)),
            None => Ok(None),
        }
    }
}
