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
    
    /// Strip inline SQL comments (-- to end of line)
    fn strip_inline_comment(line: &str) -> String {
        let mut result = String::with_capacity(line.len());
        let mut in_single_quote = false;
        let mut in_double_quote = false;
        let mut prev_char = '\0';

        for ch in line.chars() {
            // Check for comment start (-- not inside quotes)
            if ch == '-' && prev_char == '-' && !in_single_quote && !in_double_quote {
                break; // Skip rest of line
            }

            match ch {
                '\'' if !in_double_quote => {
                    in_single_quote = !in_single_quote;
                    result.push(ch);
                }
                '"' if !in_single_quote => {
                    in_double_quote = !in_double_quote;
                    result.push(ch);
                }
                _ => {
                    result.push(ch);
                }
            }
            prev_char = ch;
        }

        result
    }
    
    /// Execute a complete SQL migration file - split by statement boundaries
    async fn execute_migration_sql(&self, sql: &str) -> Result<(), String> {
        // First, strip all comments from the SQL
        let sql_no_comments = Self::strip_all_comments(sql);
        
        log::info!("[DB] SQL after comment stripping (first 500 chars):\n{}", &sql_no_comments[..sql_no_comments.len().min(500)]);
        
        // Split the SQL into individual statements by looking for semicolons
        // that are not inside parentheses
        let mut statements = Vec::new();
        let mut current = String::new();
        let mut paren_depth = 0;

        for line in sql_no_comments.lines() {
            let trimmed = line.trim();
            
            // Skip empty lines
            if trimmed.is_empty() {
                continue;
            }

            // Process character by character to track parentheses
            for ch in trimmed.chars() {
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
            
            // Add newline to preserve formatting
            if !trimmed.is_empty() {
                current.push('\n');
            }
        }
        
        // Handle any remaining text
        if !current.trim().is_empty() {
            statements.push(current.trim().to_string());
        }

        log::info!("[DB] Parsed {} statements from migration SQL", statements.len());
        
        // Execute each statement
        for stmt in statements {
            if stmt.is_empty() {
                continue;
            }

            log::info!("[DB] Executing: {}", stmt);
            let r = sqlx::query(&stmt)
                .execute(&self.pool)
                .await;
            if let Err(e) = r {
                log::error!("[DB] Failed to execute: {:?}, error: {}", stmt, e);
                return Err(format!("Migration error: {}", e));
            }
        }
        
        Ok(())
    }
    
    /// Strip all SQL comments (both inline and multi-line)
    fn strip_all_comments(sql: &str) -> String {
        let mut result = String::with_capacity(sql.len());
        let mut chars = sql.chars().peekable();
        
        while let Some(ch) = chars.next() {
            // Check for -- comment
            if ch == '-' {
                if let Some(&next) = chars.peek() {
                    if next == '-' {
                        // Skip until end of line
                        for c in &mut chars {
                            if c == '\n' {
                                result.push(c);
                                break;
                            }
                        }
                        continue;
                    }
                }
            }
            
            // Check for /* */ multi-line comment
            if ch == '/' {
                if let Some(&next) = chars.peek() {
                    if next == '*' {
                        // Skip until */
                        chars.next(); // consume *
                        loop {
                            match chars.next() {
                                Some('*') => {
                                    if let Some(&next) = chars.peek() {
                                        if next == '/' {
                                            chars.next(); // consume /
                                            break;
                                        }
                                    }
                                }
                                Some(_) => continue,
                                None => break,
                            }
                        }
                        continue;
                    }
                }
            }
            
            result.push(ch);
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
            "ALTER TABLE sessions ADD COLUMN files_metadata TEXT",
            "CREATE TABLE IF NOT EXISTS project_files (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                file_name TEXT NOT NULL,
                file_path TEXT NOT NULL,
                file_type TEXT DEFAULT 'other',
                file_size INTEGER DEFAULT 0,
                added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            )",
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

    /// Get or create a profile for a given ID (uses upsert logic)
    pub async fn get_or_create_profile(&self, profile_id: &str, name: &str) -> Result<serde_json::Value, String> {
        // Try to get existing profile
        let row = sqlx::query("SELECT id, name, created_at FROM profiles WHERE id = ?")
            .bind(profile_id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| e.to_string())?;

        if let Some(row) = row {
            return Ok(serde_json::json!({
                "id": row.get::<String, usize>(0),
                "name": row.get::<String, usize>(1),
                "created_at": row.get::<String, usize>(2),
            }));
        }

        // Create new profile
        sqlx::query("INSERT INTO profiles (id, name) VALUES (?, ?)")
            .bind(profile_id)
            .bind(name)
            .execute(&self.pool)
            .await
            .map_err(|e| e.to_string())?;

        Ok(serde_json::json!({
            "id": profile_id,
            "name": name,
            "created_at": chrono::Utc::now().to_rfc3339(),
        }))
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
    pub async fn create_session(&self, project_id: &str, name: &str, pipes_json: Option<&str>, files_metadata: Option<&str>) -> Result<String, String> {
        let id = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO sessions (id, project_id, name, pipes_json, files_metadata) VALUES (?, ?, ?, ?, ?)")
            .bind(&id)
            .bind(project_id)
            .bind(name)
            .bind(pipes_json)
            .bind(files_metadata)
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
            if let Some(_s) = val.as_str() {
                set_clauses.push("name = ?".to_string());
                has_params = true;
            }
        }
        if let Some(val) = updates.get("fps") {
            if let Some(_n) = val.as_i64() {
                set_clauses.push("fps = ?".to_string());
                has_params = true;
            }
        }
        if let Some(val) = updates.get("resolution") {
            if let Some(_s) = val.as_str() {
                set_clauses.push("resolution = ?".to_string());
                has_params = true;
            }
        }
        if let Some(val) = updates.get("orientation") {
            if let Some(_s) = val.as_str() {
                set_clauses.push("orientation = ?".to_string());
                has_params = true;
            }
        }
        if let Some(val) = updates.get("pipes_json") {
            if let Some(_s) = val.as_str() {
                set_clauses.push("pipes_json = ?".to_string());
                has_params = true;
            }
        }
        if let Some(val) = updates.get("total_generated_frames") {
            if let Some(_n) = val.as_i64() {
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

    // File operations
    pub async fn add_file(
        &self,
        project_id: &str,
        file_name: &str,
        file_path: &str,
        file_type: &str,
        file_size: i64,
    ) -> Result<String, String> {
        let id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO project_files (id, project_id, file_name, file_path, file_type, file_size) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .bind(&id)
        .bind(project_id)
        .bind(file_name)
        .bind(file_path)
        .bind(file_type)
        .bind(file_size)
        .execute(&self.pool)
        .await
        .map_err(|e| e.to_string())?;

        Ok(id)
    }

    pub async fn list_files(&self, project_id: &str) -> Result<Vec<serde_json::Value>, String> {
        let rows = sqlx::query(
            "SELECT id, project_id, file_name, file_path, file_type, file_size, added_at FROM project_files WHERE project_id = ? ORDER BY added_at DESC"
        )
        .bind(project_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| e.to_string())?;

        let files: Vec<serde_json::Value> = rows.iter()
            .map(|row| {
                serde_json::json!({
                    "id": row.get::<String, usize>(0),
                    "project_id": row.get::<String, usize>(1),
                    "file_name": row.get::<String, usize>(2),
                    "file_path": row.get::<String, usize>(3),
                    "file_type": row.get::<String, usize>(4),
                    "file_size": row.get::<i64, usize>(5),
                    "added_at": row.get::<String, usize>(6),
                })
            })
            .collect();

        Ok(files)
    }

    pub async fn delete_file(&self, file_id: &str) -> Result<(), String> {
        sqlx::query("DELETE FROM project_files WHERE id = ?")
            .bind(file_id)
            .execute(&self.pool)
            .await
            .map_err(|e| e.to_string())?;

        Ok(())
    }
}
