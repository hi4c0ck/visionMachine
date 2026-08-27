use sqlx::{sqlite::SqlitePool, Row};
use uuid::Uuid;

#[derive(Clone)]
pub struct Database {
    pub pool: SqlitePool,
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
        
        // Connect with ?mode=rwc to allow creating/connecting to existing DB
        let pool = SqlitePool::connect(&format!("sqlite://{}?mode=rwc", path))
            .await
            .map_err(|e| format!("Failed to connect to database: {}", e))?;
        
        Ok(Self { pool })
    }
    
    pub async fn migrate(&self) -> Result<(), String> {
        // Run migrations from SQL files - execute each file as a whole
        self.execute_migration_sql(include_str!("../../migrations/0001_create_schema.sql"))
            .await?;
        self.execute_migration_sql(include_str!("../../migrations/0002_composer_schema.sql"))
            .await?;
        self.run_additive_columns().await?;
        
        log::info!("[DB] All migrations completed");
        Ok(())
    }
    
    /// Execute a complete SQL migration file - split by statement boundaries
    async fn execute_migration_sql(&self, sql: &str) -> Result<(), String> {
        // Split the SQL into individual statements by looking for semicolons
        // that are not inside parentheses
        let mut statements = Vec::new();
        let mut current = String::new();
        let mut paren_depth = 0;

        for line in sql.lines() {
            let trimmed = line.trim();

            // Skip empty lines and full-line comments
            if trimmed.is_empty() || trimmed.starts_with("--") {
                continue;
            }

            // Strip inline comments (everything after -- on the same line)
            // But only if -- is not inside quotes
            let clean_line = Self::strip_inline_comment(trimmed);

            // Process character by character to track parentheses
            for ch in clean_line.chars() {
                match ch {
                    '(' => {
                        paren_depth += 1;
                        current.push(ch);
                    }
                    ')' => {
                        paren_depth -= 1;
                        current.push(ch);
                    }
                    ';' if paren_depth == 0 => {
                        // End of statement
                        if !current.trim().is_empty() {
                            statements.push(current.trim().to_string());
                        }
                        current.clear();
                    }
                    _ => {
                        current.push(ch);
                    }
                }
            }
        }

        // Handle any remaining text
        if !current.trim().is_empty() {
            statements.push(current.trim().to_string());
        }

        // Execute each statement
        for stmt in statements {
            if stmt.is_empty() {
                continue;
            }
            
            log::debug!("[DB] Executing: {}", stmt);
            
            sqlx::query(&stmt)
                .execute(&self.pool)
                .await
                .map_err(|e| format!("Migration error: {}", e))?;
        }
        
        Ok(())
    }

    /// Strip inline SQL comments (-- to end of line)
    fn strip_inline_comment(line: &str) -> String {
        let mut result = String::with_capacity(line.len());
        let mut in_single_quote = false;
        let mut in_double_quote = false;

        for ch in line.chars() {
            match ch {
                '\'' if !in_double_quote => {
                    in_single_quote = !in_single_quote;
                    result.push(ch);
                }
                '"' if !in_single_quote => {
                    in_double_quote = !in_double_quote;
                    result.push(ch);
                }
                '-' if !in_single_quote && !in_double_quote && result.ends_with('-') => {
                    // Found --, skip rest of line
                    break;
                }
                _ => {
                    result.push(ch);
                }
            }
        }

        result
    }
    
    async fn run_additive_columns(&self) -> Result<(), String> {
        // Add columns that live code writes but migration files don't have
        let columns = [
            "ALTER TABLE sessions ADD COLUMN fps INTEGER DEFAULT 24",
            "ALTER TABLE sessions ADD COLUMN resolution TEXT DEFAULT '720p'",
            "ALTER TABLE sessions ADD COLUMN orientation TEXT DEFAULT 'horizontal'",
            "ALTER TABLE sessions ADD COLUMN pipes_json TEXT",
            "ALTER TABLE sessions ADD COLUMN total_generated_frames INTEGER DEFAULT 0",
            "ALTER TABLE projects ADD COLUMN directory_path TEXT",
        ];
        
        for sql in columns {
            // Ignore "duplicate column" errors
            let _ = sqlx::query(sql).execute(&self.pool).await;
        }
        
        Ok(())
    }
    
    /// Seed default profile if missing (Phase 1.4)
    pub async fn seed_default_profile(&self) -> Result<(), String> {
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM profiles WHERE id = ?")
            .bind("default")
            .fetch_one(&self.pool)
            .await
            .map_err(|e| e.to_string())?;
        
        if count == 0 {
            sqlx::query("INSERT INTO profiles (id, name) VALUES (?, ?)")
                .bind("default")
                .bind("Default User")
                .execute(&self.pool)
                .await
                .map_err(|e| e.to_string())?;
        }
        
        Ok(())
    }
    
    // Profile operations
    pub async fn create_profile(&self, name: &str) -> Result<String, String> {
        let id = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO profiles (id, name) VALUES (?, ?)")
            .bind(&id).bind(name)
            .execute(&self.pool)
            .await
            .map_err(|e| e.to_string())?;
        
        Ok(id)
    }
    
    pub async fn list_profiles(&self) -> Result<Vec<serde_json::Value>, String> {
        let rows = sqlx::query("SELECT id, name, created_at FROM profiles ORDER BY created_at DESC")
            .fetch_all(&self.pool)
            .await
            .map_err(|e| e.to_string())?;
        
        let profiles: Vec<serde_json::Value> = rows.iter()
            .map(|row| {
                serde_json::json!({
                    "id": row.get::<String, usize>(0),
                    "name": row.get::<String, usize>(1),
                    "created_at": row.get::<String, usize>(2),
                })
            })
            .collect();
        
        Ok(profiles)
    }
    
    // Project operations
    pub async fn create_project(&self, profile_id: &str, name: &str, directory_path: Option<&str>) -> Result<String, String> {
        let id = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO projects (id, profile_id, name, directory_path) VALUES (?, ?, ?, ?)")
            .bind(&id)
            .bind(profile_id)
            .bind(name)
            .bind(directory_path)
            .execute(&self.pool)
            .await
            .map_err(|e| e.to_string())?;
        
        Ok(id)
    }
    
    pub async fn list_projects(&self, profile_id: &str) -> Result<Vec<serde_json::Value>, String> {
        let rows = sqlx::query("SELECT id, profile_id, name, directory_path, created_at FROM projects WHERE profile_id = ? ORDER BY created_at DESC")
            .bind(profile_id)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| e.to_string())?;
        
        let projects: Vec<serde_json::Value> = rows.iter()
            .map(|row| {
                serde_json::json!({
                    "id": row.get::<String, usize>(0),
                    "profile_id": row.get::<String, usize>(1),
                    "name": row.get::<String, usize>(2),
                    "directory_path": row.get::<Option<String>, usize>(3),
                    "created_at": row.get::<String, usize>(4),
                })
            })
            .collect();
        
        Ok(projects)
    }
    
    // Session operations
    pub async fn create_session(&self, project_id: &str, name: &str, pipes_json: Option<&str>) -> Result<String, String> {
        let id = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO sessions (id, project_id, name, pipes_json) VALUES (?, ?, ?, ?)")
            .bind(&id)
            .bind(project_id)
            .bind(name)
            .bind(pipes_json)
            .execute(&self.pool)
            .await
            .map_err(|e| e.to_string())?;
        
        Ok(id)
    }
    
    pub async fn list_sessions(&self, project_id: &str) -> Result<Vec<serde_json::Value>, String> {
        let rows = sqlx::query("SELECT id, project_id, name, fps, resolution, orientation, pipes_json, total_generated_frames, created_at FROM sessions WHERE project_id = ? ORDER BY created_at DESC")
            .bind(project_id)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| e.to_string())?;
        
        let sessions: Vec<serde_json::Value> = rows.iter()
            .map(|row| {
                serde_json::json!({
                    "id": row.get::<String, usize>(0),
                    "project_id": row.get::<String, usize>(1),
                    "name": row.get::<String, usize>(2),
                    "fps": row.get::<i64, usize>(3),
                    "resolution": row.get::<String, usize>(4),
                    "orientation": row.get::<String, usize>(5),
                    "pipes_json": row.get::<Option<String>, usize>(6),
                    "total_generated_frames": row.get::<i64, usize>(7),
                    "created_at": row.get::<String, usize>(8),
                })
            })
            .collect();
        
        Ok(sessions)
    }
    
    pub async fn update_session(&self, session_id: &str, updates: &serde_json::Value) -> Result<(), String> {
        // Build dynamic update query
        let mut set_clauses = Vec::new();
        let mut has_params = false;

        if let Some(val) = updates.get("name") {
            if let Some(s) = val.as_str() {
                set_clauses.push("name = ?".to_string());
                has_params = true;
            }
        }
        if let Some(val) = updates.get("fps") {
            if let Some(n) = val.as_i64() {
                set_clauses.push("fps = ?".to_string());
                has_params = true;
            }
        }
        if let Some(val) = updates.get("resolution") {
            if let Some(s) = val.as_str() {
                set_clauses.push("resolution = ?".to_string());
                has_params = true;
            }
        }
        if let Some(val) = updates.get("orientation") {
            if let Some(s) = val.as_str() {
                set_clauses.push("orientation = ?".to_string());
                has_params = true;
            }
        }
        if let Some(val) = updates.get("pipes_json") {
            if let Some(s) = val.as_str() {
                set_clauses.push("pipes_json = ?".to_string());
                has_params = true;
            }
        }
        if let Some(val) = updates.get("total_generated_frames") {
            if let Some(n) = val.as_i64() {
                set_clauses.push("total_generated_frames = ?".to_string());
                has_params = true;
            }
        }

        if set_clauses.is_empty() {
            return Ok(());
        }

        let sql = format!(
            "UPDATE sessions SET {} WHERE id = ?",
            set_clauses.join(", ")
        );

        // Execute without dynamic params since we need to bind individually
        // This is a simplified approach - in production use proper prepared statements
        if !has_params {
            sqlx::query(&sql)
                .bind(session_id)
                .execute(&self.pool)
                .await
                .map_err(|e| e.to_string())?;
        } else {
            // For dynamic params, use individual binds based on which fields changed
            // Build a tuple of all possible values
            let name = updates.get("name").and_then(|v| v.as_str());
            let fps = updates.get("fps").and_then(|v| v.as_i64());
            let resolution = updates.get("resolution").and_then(|v| v.as_str());
            let orientation = updates.get("orientation").and_then(|v| v.as_str());
            let pipes_json = updates.get("pipes_json").and_then(|v| v.as_str());
            let total_frames = updates.get("total_generated_frames").and_then(|v| v.as_i64());

            sqlx::query(&sql)
                .bind(name)
                .bind(fps)
                .bind(resolution)
                .bind(orientation)
                .bind(pipes_json)
                .bind(total_frames)
                .bind(session_id)
                .execute(&self.pool)
                .await
                .map_err(|e| e.to_string())?;
        }

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
