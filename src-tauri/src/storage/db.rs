use sqlx::{SqliteConnection, Connection, query_as};
use uuid::Uuid;
use chrono::Utc;
use std::path::PathBuf;
use serde_json::Value;

#[derive(Clone)]
pub struct Database {
    pub conn: tokio::sync::Mutex<Option<SqliteConnection>>,
    path: String,
}

impl Database {
    pub async fn new(path: &str) -> Result<Self, Box<dyn std::error::Error>> {
        // Validate path for security
        if path.contains("..") {
            return Err("Path contains directory traversal".into());
        }
        
        Ok(Self {
            conn: tokio::sync::Mutex::new(None),
            path: path.to_string(),
        })
    }

    async fn get_conn(&self) -> Result<tokio::sync::MutexGuard<'_, Option<SqliteConnection>>, Box<dyn std::error::Error>> {
        let mut conn = self.conn.lock().await;
        if conn.is_none() {
            let db_path = format!("sqlite:{}", PathBuf::from(&self.path).join("visionmachine.db").display());
            *conn = Some(SqliteConnection::connect(&db_path).await?);
        }
        Ok(conn)
    }

    /// Initialize or connect to database with production PRAGMAs and schema
    pub async fn initialize(&mut self) -> Result<(), Box<dyn std::error::Error>> {
        let mut conn = self.get_conn().await?;
        
        // Production PRAGMAs for SQLite optimization
        sqlx::query("PRAGMA journal_mode=WAL")
            .execute(&mut **conn)
            .await?;
        sqlx::query("PRAGMA foreign_keys=ON")
            .execute(&mut **conn)
            .await?;
        sqlx::query("PRAGMA busy_timeout=5000")
            .execute(&mut **conn)
            .await?;
        sqlx::query("PRAGMA synchronous=NORMAL")
            .execute(&mut **conn)
            .await?;
        
        // Create tables with full schema
        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS profiles (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                email TEXT,
                avatar_path TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                settings JSON
            )
        "#).execute(&mut **conn).await?;

        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                profile_id TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                logo_path TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
            )
        "#).execute(&mut **conn).await?;

        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT,
                state TEXT DEFAULT 'idle',
                last_accessed DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            )
        "#).execute(&mut **conn).await?;

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
        "#).execute(&mut **conn).await?;

        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS artifacts (
                id TEXT PRIMARY KEY,
                session_id TEXT,
                project_id TEXT,
                profile_id TEXT,
                artifact_type TEXT NOT NULL,
                file_path TEXT NOT NULL,
                metadata JSON,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
                FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE SET NULL
            )
        "#).execute(&mut **conn).await?;

        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        "#).execute(&mut **conn).await?;

        sqlx::query(r#"
            CREATE TABLE IF NOT EXISTS migrations (
                version INTEGER PRIMARY KEY,
                description TEXT,
                applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        "#).execute(&mut **conn).await?;

        // Create indexes for performance
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_projects_profile ON projects(profile_id)")
            .execute(&mut **conn).await?;
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id)")
            .execute(&mut **conn).await?;
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_composers_session ON composers(session_id)")
            .execute(&mut **conn).await?;
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_artifacts_session ON artifacts(session_id)")
            .execute(&mut **conn).await?;
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_artifacts_project ON artifacts(project_id)")
            .execute(&mut **conn).await?;
        sqlx::query("CREATE INDEX IF NOT EXISTS idx_artifacts_profile ON artifacts(profile_id)")
            .execute(&mut **conn).await?;
        
        Ok(())
    }

    /// Profile operations
    pub async fn create_profile(&self, name: &str, email: Option<&str>) -> Result<serde_json::Value, Box<dyn std::error::Error>> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        
        let mut conn = self.get_conn().await?;
        sqlx::query("INSERT INTO profiles (id, name, email, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
            .bind(&id)
            .bind(name)
            .bind(email)
            .bind(&now)
            .bind(&now)
            .execute(&mut **conn)
            .await?;
        
        Ok(serde_json::json!({"id": id, "name": name, "email": email}))
    }

    pub async fn get_profile(&self, id: &str) -> Result<serde_json::Value, Box<dyn std::error::Error>> {
        let mut conn = self.get_conn().await?;
        let row = sqlx::query("SELECT id, name, email, avatar_path, created_at FROM profiles WHERE id = ?")
            .bind(id)
            .fetch_optional(&mut **conn)
            .await?;
        
        match row {
            Some(row) => {
                let id: String = row.try_get("id")?;
                let name: String = row.try_get("name")?;
                let email: Option<String> = row.try_get("email")?;
                let created_at: String = row.try_get("created_at")?;
                
                Ok(serde_json::json!({
                    "id": id,
                    "name": name,
                    "email": email,
                    "created_at": created_at
                }))
            }
            None => Err("Profile not found".into()),
        }
    }

    pub async fn list_profiles(&self) -> Result<Vec<serde_json::Value>, Box<dyn std::error::Error>> {
        let mut conn = self.get_conn().await?;
        let rows = sqlx::query("SELECT id, name, email, created_at FROM profiles ORDER BY created_at DESC")
            .fetch_all(&mut **conn)
            .await?;
        
        let mut result = Vec::new();
        for row in rows {
            let id: String = row.try_get("id")?;
            let name: String = row.try_get("name")?;
            let email: Option<String> = row.try_get("email")?;
            let created_at: String = row.try_get("created_at")?;
            
            result.push(serde_json::json!({
                "id": id,
                "name": name,
                "email": email,
                "created_at": created_at
            }));
        }
        
        Ok(result)
    }

    pub async fn logout_user(&self) -> Result<(), Box<dyn std::error::Error>> {
        let mut conn = self.get_conn().await?;
        sqlx::query("UPDATE sessions SET state = 'idle', last_accessed = NULL")
            .execute(&mut **conn)
            .await?;
        Ok(())
    }

    /// Project operations
    pub async fn create_project(&self, profile_id: &str, name: &str, description: Option<&str>) -> Result<serde_json::Value, Box<dyn std::error::Error>> {
        let id = Uuid::new_v4().to_string();
        
        let mut conn = self.get_conn().await?;
        sqlx::query("INSERT INTO projects (id, profile_id, name, description) VALUES (?, ?, ?, ?)")
            .bind(&id)
            .bind(profile_id)
            .bind(name)
            .bind(description)
            .execute(&mut **conn)
            .await?;
        
        Ok(serde_json::json!({"id": id, "profile_id": profile_id, "name": name, "description": description}))
    }

    pub async fn get_project(&self, id: &str) -> Result<serde_json::Value, Box<dyn std::error::Error>> {
        let mut conn = self.get_conn().await?;
        let row = sqlx::query("SELECT id, profile_id, name, description, created_at FROM projects WHERE id = ?")
            .bind(id)
            .fetch_optional(&mut **conn)
            .await?;
        
        match row {
            Some(row) => {
                let id: String = row.try_get("id")?;
                let profile_id: String = row.try_get("profile_id")?;
                let name: String = row.try_get("name")?;
                let description: Option<String> = row.try_get("description")?;
                let created_at: String = row.try_get("created_at")?;
                
                Ok(serde_json::json!({
                    "id": id,
                    "profile_id": profile_id,
                    "name": name,
                    "description": description,
                    "created_at": created_at
                }))
            }
            None => Err("Project not found".into()),
        }
    }

    pub async fn list_projects(&self, profile_id: &str) -> Result<Vec<serde_json::Value>, Box<dyn std::error::Error>> {
        let mut conn = self.get_conn().await?;
        let rows = sqlx::query("SELECT id, name, description, created_at FROM projects WHERE profile_id = ? ORDER BY created_at DESC")
            .bind(profile_id)
            .fetch_all(&mut **conn)
            .await?;
        
        let mut result = Vec::new();
        for row in rows {
            let id: String = row.try_get("id")?;
            let name: String = row.try_get("name")?;
            let description: Option<String> = row.try_get("description")?;
            let created_at: String = row.try_get("created_at")?;
            
            result.push(serde_json::json!({
                "id": id,
                "name": name,
                "description": description,
                "created_at": created_at
            }));
        }
        
        Ok(result)
    }

    pub async fn delete_project(&self, id: &str) -> Result<(), Box<dyn std::error::Error>> {
        let mut conn = self.get_conn().await?;
        sqlx::query("DELETE FROM projects WHERE id = ?")
            .bind(id)
            .execute(&mut **conn)
            .await?;
        Ok(())
    }

    /// Session operations
    pub async fn create_session(&self, project_id: &str, name: &str) -> Result<serde_json::Value, Box<dyn std::error::Error>> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        
        let mut conn = self.get_conn().await?;
        sqlx::query("INSERT INTO sessions (id, project_id, name, state, last_accessed, created_at, updated_at) VALUES (?, ?, ?, 'idle', ?, ?, ?)")
            .bind(&id)
            .bind(project_id)
            .bind(name)
            .bind(&now)
            .bind(&now)
            .bind(&now)
            .execute(&mut **conn)
            .await?;
        
        Ok(serde_json::json!({"id": id, "project_id": project_id, "name": name, "state": "idle"}))
    }

    pub async fn get_session(&self, id: &str) -> Result<serde_json::Value, Box<dyn std::error::Error>> {
        let mut conn = self.get_conn().await?;
        let row = sqlx::query("SELECT id, project_id, name, state, last_accessed, created_at FROM sessions WHERE id = ?")
            .bind(id)
            .fetch_optional(&mut **conn)
            .await?;
        
        match row {
            Some(row) => {
                let id: String = row.try_get("id")?;
                let project_id: String = row.try_get("project_id")?;
                let name: String = row.try_get("name")?;
                let state: String = row.try_get("state")?;
                let last_accessed: Option<String> = row.try_get("last_accessed")?;
                let created_at: String = row.try_get("created_at")?;
                
                Ok(serde_json::json!({
                    "id": id,
                    "project_id": project_id,
                    "name": name,
                    "state": state,
                    "last_accessed": last_accessed,
                    "created_at": created_at
                }))
            }
            None => Err("Session not found".into()),
        }
    }

    pub async fn list_sessions(&self, project_id: &str) -> Result<Vec<serde_json::Value>, Box<dyn std::error::Error>> {
        let mut conn = self.get_conn().await?;
        let rows = sqlx::query("SELECT id, name, state, last_accessed, created_at FROM sessions WHERE project_id = ? ORDER BY created_at DESC")
            .bind(project_id)
            .fetch_all(&mut **conn)
            .await?;
        
        let mut result = Vec::new();
        for row in rows {
            let id: String = row.try_get("id")?;
            let name: String = row.try_get("name")?;
            let state: String = row.try_get("state")?;
            let last_accessed: Option<String> = row.try_get("last_accessed")?;
            let created_at: String = row.try_get("created_at")?;
            
            result.push(serde_json::json!({
                "id": id,
                "name": name,
                "state": state,
                "last_accessed": last_accessed,
                "created_at": created_at
            }));
        }
        
        Ok(result)
    }

    pub async fn update_session_state(&self, id: &str, state: &str) -> Result<(), Box<dyn std::error::Error>> {
        let mut conn = self.get_conn().await?;
        let now = Utc::now().to_rfc3339();
        sqlx::query("UPDATE sessions SET state = ?, updated_at = ?, last_accessed = ? WHERE id = ?")
            .bind(state)
            .bind(&now)
            .bind(&now)
            .bind(id)
            .execute(&mut **conn)
            .await?;
        Ok(())
    }

    /// Composer operations
    pub async fn get_composer(&self, session_id: &str) -> Result<serde_json::Value, Box<dyn std::error::Error>> {
        let mut conn = self.get_conn().await?;
        
        match sqlx::query("SELECT id, session_id, config_json, version FROM composers WHERE session_id = ?")
            .bind(session_id)
            .fetch_one(&mut **conn)
            .await {
                Ok(row) => {
                    let id: String = row.try_get("id")?;
                    let sid: String = row.try_get("session_id")?;
                    let config_json: String = row.try_get("config_json")?;
                    let version: i32 = row.try_get("version")?;
                    
                    Ok(serde_json::json!({
                        "id": id,
                        "session_id": sid,
                        "config_json": config_json,
                        "version": version
                    }))
                }
                Err(sqlx::Error::RowNotFound) => {
                    // Auto-create empty composer
                    let id = Uuid::new_v4().to_string();
                    let config = serde_json::json!({"pipes": [], "state": "empty"}).to_string();
                    
                    sqlx::query("INSERT INTO composers (id, session_id, config_json, version) VALUES (?, ?, ?, 1)")
                        .bind(&id)
                        .bind(session_id)
                        .bind(&config)
                        .execute(&mut **conn)
                        .await?;
                    
                    Ok(serde_json::json!({"id": id, "session_id": session_id, "config_json": config, "version": 1}))
                }
                Err(e) => Err(e.into()),
            }
    }

    pub async fn update_composer(&self, session_id: &str, config_json: &str) -> Result<serde_json::Value, Box<dyn std::error::Error>> {
        let mut conn = self.get_conn().await?;
        
        // Get current version
        let current_version: i32 = match sqlx::query("SELECT version FROM composers WHERE session_id = ?")
            .bind(session_id)
            .fetch_optional(&mut **conn)
            .await? {
                Some(row) => row.try_get(0)?,
                None => 0,
            };
        
        let new_version = current_version + 1;
        
        let result = sqlx::query("UPDATE composers SET config_json = ?, version = ? WHERE session_id = ?")
            .bind(config_json)
            .bind(new_version)
            .bind(session_id)
            .execute(&mut **conn)
            .await;
        
        match result {
            Ok(_) => self.get_composer(session_id).await,
            Err(sqlx::Error::RowNotFound) => {
                let id = Uuid::new_v4().to_string();
                sqlx::query("INSERT INTO composers (id, session_id, config_json, version) VALUES (?, ?, ?, ?)")
                    .bind(&id)
                    .bind(session_id)
                    .bind(config_json)
                    .bind(1)
                    .execute(&mut **conn)
                    .await?;
                
                Ok(serde_json::json!({"id": id, "session_id": session_id, "config_json": config_json, "version": 1}))
            }
            Err(e) => Err(e.into()),
        }
    }

    /// Artifact operations
    pub async fn create_artifact(&self, session_id: Option<&str>, project_id: Option<&str>, profile_id: Option<&str>, artifact_type: &str, file_path: &str, metadata: Option<&str>) -> Result<serde_json::Value, Box<dyn std::error::Error>> {
        let id = Uuid::new_v4().to_string();
        
        let mut conn = self.get_conn().await?;
        sqlx::query("INSERT INTO artifacts (id, session_id, project_id, profile_id, artifact_type, file_path, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)")
            .bind(&id)
            .bind(session_id)
            .bind(project_id)
            .bind(profile_id)
            .bind(artifact_type)
            .bind(file_path)
            .bind(metadata)
            .execute(&mut **conn)
            .await?;
        
        Ok(serde_json::json!({"id": id, "type": artifact_type, "path": file_path}))
    }

    pub async fn list_artifacts_by_session(&self, session_id: &str) -> Result<Vec<serde_json::Value>, Box<dyn std::error::Error>> {
        let mut conn = self.get_conn().await?;
        let rows = sqlx::query("SELECT id, artifact_type, file_path, metadata, created_at FROM artifacts WHERE session_id = ? ORDER BY created_at DESC")
            .bind(session_id)
            .fetch_all(&mut **conn)
            .await?;
        
        let mut result = Vec::new();
        for row in rows {
            let id: String = row.try_get("id")?;
            let artifact_type: String = row.try_get("artifact_type")?;
            let file_path: String = row.try_get("file_path")?;
            let metadata: Option<String> = row.try_get("metadata")?;
            let created_at: String = row.try_get("created_at")?;
            
            result.push(serde_json::json!({
                "id": id,
                "type": artifact_type,
                "path": file_path,
                "metadata": metadata,
                "created_at": created_at
            }));
        }
        
        Ok(result)
    }

    /// Settings operations
    pub async fn set_setting(&self, key: &str, value: &str) -> Result<(), Box<dyn std::error::Error>> {
        let mut conn = self.get_conn().await?;
        sqlx::query("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)")
            .bind(key)
            .bind(value)
            .execute(&mut **conn)
            .await?;
        Ok(())
    }

    pub async fn get_setting(&self, key: &str) -> Result<Option<String>, Box<dyn std::error::Error>> {
        let mut conn = self.get_conn().await?;
        let row = sqlx::query("SELECT value FROM app_settings WHERE key = ?")
            .bind(key)
            .fetch_optional(&mut **conn)
            .await?;
        
        match row {
            Some(row) => Ok(Some(row.try_get("value")?)),
            None => Ok(None),
        }
    }

    /// Database maintenance
    pub async fn vacuum(&self) -> Result<(), Box<dyn std::error::Error>> {
        let mut conn = self.get_conn().await?;
        sqlx::query("VACUUM")
            .execute(&mut **conn)
            .await?;
        Ok(())
    }

    /// Stats and diagnostics
    pub async fn stats(&self) -> Result<serde_json::Value, Box<dyn std::error::Error>> {
        let mut conn = self.get_conn().await?;
        
        let page_size: (i64,) = sqlx::query_as("PRAGMA page_size")
            .fetch_one(&mut **conn)
            .await?;
        let page_count: (i64,) = sqlx::query_as("PRAGMA page_count")
            .fetch_one(&mut **conn)
            .await?;
        let journal: (String,) = sqlx::query_as("PRAGMA journal_mode")
            .fetch_one(&mut **conn)
            .await?;
        
        Ok(serde_json::json!({
            "page_size": page_size.0,
            "page_count": page_count.0,
            "journal_mode": journal.0,
            "size_mb": ((page_size.0 * page_count.0) as f64 / 1024.0 / 1024.0).round(2)
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    
    async fn setup_test_db() -> (Database, PathBuf) {
        let temp_dir = std::env::temp_dir().join("visionmachine_test");
        std::fs::create_dir_all(&temp_dir).unwrap();
        
        let db = Database::new(temp_dir.to_str().unwrap()).await.unwrap();
        let mut db_mut = db.clone();
        db_mut.initialize().await.unwrap();
        
        (db, temp_dir)
    }
    
    #[tokio::test]
    async fn test_wal_mode_enabled() {
        let (db, _dir) = setup_test_db().await;
        let stats = db.stats().await.unwrap();
        assert_eq!(stats["journal_mode"], "wal");
    }
    
    #[tokio::test]
    async fn test_foreign_keys_enforced() {
        let (db, _dir) = setup_test_db().await;
        let result = db.create_project("invalid-id", "Test", None).await;
        assert!(result.is_err());
    }
    
    #[tokio::test]
    async fn test_profile_lifecycle() {
        let (db, _dir) = setup_test_db().await;
        let profile = db.create_profile("John Doe", Some("john@example.com")).await.unwrap();
        assert_eq!(profile["name"], "John Doe");
        
        let profiles = db.list_profiles().await.unwrap();
        assert_eq!(profiles.len(), 1);
        
        db.logout_user().await.unwrap();
    }
    
    #[tokio::test]
    async fn test_cascade_delete() {
        let (db, _dir) = setup_test_db().await;
        let profile = db.create_profile("User", None).await.unwrap();
        let project = db.create_project(profile["id"].as_str().unwrap(), "Project", None).await.unwrap();
        let session = db.create_session(project["id"].as_str().unwrap(), "Session").await.unwrap();
        let _composer = db.get_composer(session["id"].as_str().unwrap()).await.unwrap();
        
        db.delete_project(project["id"].as_str().unwrap()).await.unwrap();
        let result = db.get_session(session["id"].as_str().unwrap()).await;
        assert!(result.is_err());
    }
    
    #[tokio::test]
    async fn test_full_workflow() {
        let (db, _dir) = setup_test_db().await;
        let profile = db.create_profile("Alice", None).await.unwrap();
        let project = db.create_project(profile["id"].as_str().unwrap(), "Project", None).await.unwrap();
        let session = db.create_session(project["id"].as_str().unwrap(), "Session").await.unwrap();
        let composer = db.get_composer(session["id"].as_str().unwrap()).await.unwrap();
        
        assert_eq!(composer["version"], 1);
        
        let updated = db.update_composer(session["id"].as_str().unwrap(), "{\"pipes\":[]}").await.unwrap();
        assert_eq!(updated["version"], 2);
        
        db.create_artifact(Some(&session["id"].as_str().unwrap()), None, Some(&profile["id"].as_str().unwrap()), "video", "/output.mp4", None).await.unwrap();
        
        let stats = db.stats().await.unwrap();
        assert_eq!(stats["journal_mode"], "wal");
    }
    
    #[tokio::test]
    async fn test_concurrent_access() {
        let (db, _dir) = setup_test_db().await;
        let profile = db.create_profile("Concurrent User", None).await.unwrap();
        let project = db.create_project(profile["id"].as_str().unwrap(), "Project", None).await.unwrap();
        
        let handles: Vec<_> = (0..5).map(|i| {
            let db_clone = db.clone();
            let proj_id = project["id"].as_str().unwrap().to_string();
            tokio::spawn(async move {
                db_clone.create_session(&proj_id, &format!("Session {}", i)).await
            })
        }).collect();
        
        for handle in handles {
            handle.await.unwrap().unwrap();
        }
        
        let sessions = db.list_sessions(project["id"].as_str().unwrap()).await.unwrap();
        assert_eq!(sessions.len(), 5);
    }
    
    #[tokio::test]
    async fn test_path_security() {
        let result = Database::new("../evil/path").await;
        assert!(result.is_err());
    }
    
    #[tokio::test]
    async fn test_artifact_linking() {
        let (db, _dir) = setup_test_db().await;
        let profile = db.create_profile("User", None).await.unwrap();
        let project = db.create_project(profile["id"].as_str().unwrap(), "Project", None).await.unwrap();
        let session = db.create_session(project["id"].as_str().unwrap(), "Session").await.unwrap();
        
        let artifact = db.create_artifact(Some(&session["id"].as_str().unwrap()), Some(&project["id"].as_str().unwrap()), None, "image", "/output.png", None).await.unwrap();
        assert_eq!(artifact["type"], "image");
        
        let artifacts = db.list_artifacts_by_session(&session["id"].as_str().unwrap()).await.unwrap();
        assert_eq!(artifacts.len(), 1);
    }
    
    #[tokio::test]
    async fn test_database_maintenance() {
        let (db, _dir) = setup_test_db().await;
        db.vacuum().await.unwrap();
        let stats = db.stats().await.unwrap();
        assert!(stats["size_mb"].as_f64().unwrap() >= 0.0);
    }
}
