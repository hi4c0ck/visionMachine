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

        // SQLite enforces FKs only when the pragma is ON per-connection.
        // Without it, all ON DELETE CASCADE declarations are inert.
        sqlx::query("PRAGMA foreign_keys = ON")
            .execute(&pool)
            .await
            .map_err(|e| format!("Failed to enable foreign keys: {}", e))?;

        Ok(Self { pool })
    }

    pub async fn migrate(&self) -> Result<(), String> {
        // Run migrations from SQL files - execute each file as a whole
        self.execute_migration_sql(include_str!("../../migrations/0001_create_schema.sql"))
            .await?;
        self.execute_migration_sql(include_str!("../../migrations/0002_composer_schema.sql"))
            .await?;
        self.run_additive_columns().await?;
        self.execute_migration_sql(include_str!(
            "../../migrations/0004_clean_composer_schema.sql"
        ))
        .await?;
        self.execute_migration_sql(include_str!(
            "../../migrations/0005_video_generation_tasks.sql"
        ))
        .await?;
        self.execute_migration_sql(include_str!("../../migrations/0006_settings_and_logs.sql"))
            .await?;
        self.run_additive_generation_group_columns().await?;
        self.execute_migration_sql(include_str!("../../migrations/0010_generation_groups.sql"))
            .await?;
        self.run_additive_task_columns().await?;
        self.run_additive_session_columns().await?;

        log::info!("[DB] All migrations completed");
        Ok(())
    }

    /// Additive session columns (0009): a bare `ALTER TABLE ADD COLUMN` in a
    /// migration file hard-fails on databases that already ran it, so apply
    /// it tolerantly like the other additive columns (duplicate-column
    /// errors ignored).
    async fn run_additive_generation_group_columns(&self) -> Result<(), String> {
        // The migration table is created below; this additive column is kept
        // tolerant so pre-0010 databases upgrade without a hard failure.
        let _ = sqlx::query("ALTER TABLE generation_logs ADD COLUMN group_id TEXT")
            .execute(&self.pool)
            .await;
        Ok(())
    }

    async fn run_additive_session_columns(&self) -> Result<(), String> {
        let _ = sqlx::query("ALTER TABLE sessions ADD COLUMN directory_path TEXT")
            .execute(&self.pool)
            .await;
        Ok(())
    }

    /// Additive columns for `video_generation_tasks` (migration 0007): a bare
    /// `ALTER TABLE ADD COLUMN` in a migration file hard-fails on databases
    /// that already ran it, so follow the same idempotent pattern as
    /// `run_additive_columns` above — the 0007 file documents the column, the
    /// code applies it tolerantly (duplicate-column errors ignored).
    async fn run_additive_task_columns(&self) -> Result<(), String> {
        let columns = [
            // E1: persist the redacted request-log path so the DB fallback in
            // `get_generation_task` can rebuild the task view after the
            // in-memory registry evicts a terminal task (or after restart).
            "ALTER TABLE video_generation_tasks ADD COLUMN request_log TEXT",
            // 0008: persist the task start timestamp (Unix ms) so the DB
            // fallback can rebuild the live elapsed timer after restart / the
            // registry evicted the task. NULL on pre-0008 rows (frontend
            // shows no timer rather than a bogus value).
            "ALTER TABLE video_generation_tasks ADD COLUMN started_at INTEGER",
        ];

        for sql in columns {
            // Ignore "duplicate column" errors on already-migrated DBs.
            let _ = sqlx::query(sql).execute(&self.pool).await;
        }

        Ok(())
    }

    /// Execute a complete SQL migration file - split by statement boundaries
    async fn execute_migration_sql(&self, sql: &str) -> Result<(), String> {
        // First, strip all comments from the SQL
        let sql_no_comments = Self::strip_all_comments(sql);

        log::info!(
            "[DB] SQL after comment stripping (first 500 chars):\n{}",
            &sql_no_comments[..sql_no_comments.len().min(500)]
        );

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

        log::info!(
            "[DB] Parsed {} statements from migration SQL",
            statements.len()
        );

        // Execute each statement
        for stmt in statements {
            if stmt.is_empty() {
                continue;
            }

            log::info!("[DB] Executing: {}", stmt);
            let r = sqlx::query(&stmt).execute(&self.pool).await;
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
            .bind(&id)
            .bind(name)
            .execute(&self.pool)
            .await
            .map_err(|e| e.to_string())?;

        Ok(id)
    }

    /// Get or create a profile for a given ID (uses upsert logic)
    pub async fn get_or_create_profile(
        &self,
        profile_id: &str,
        name: &str,
    ) -> Result<serde_json::Value, String> {
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
        let rows =
            sqlx::query("SELECT id, name, created_at FROM profiles ORDER BY created_at DESC")
                .fetch_all(&self.pool)
                .await
                .map_err(|e| e.to_string())?;

        let profiles: Vec<serde_json::Value> = rows
            .iter()
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
    pub async fn create_project(
        &self,
        profile_id: &str,
        name: &str,
        directory_path: Option<&str>,
    ) -> Result<String, String> {
        let id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO projects (id, profile_id, name, directory_path) VALUES (?, ?, ?, ?)",
        )
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

        let projects: Vec<serde_json::Value> = rows
            .iter()
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

    /// Deterministically remove a project and everything that hangs off it.
    /// Runs in one transaction and issues explicit deletes in FK-safe order,
    /// so it is correct even on pooled connections where the foreign-key
    /// pragma did not take effect.
    pub async fn delete_project(&self, project_id: &str) -> Result<(), String> {
        let mut tx = self.pool.begin().await.map_err(|e| e.to_string())?;

        // Composer blobs are keyed to session_id — clean them first.
        sqlx::query(
            "DELETE FROM composers WHERE session_id IN (SELECT id FROM sessions WHERE project_id = ?)",
        )
        .bind(project_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        // Session-level settings rows are keyed to session_id too.
        sqlx::query(
            "DELETE FROM session_settings WHERE session_id IN (SELECT id FROM sessions WHERE project_id = ?)",
        )
        .bind(project_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        // Generated frames are keyed to session_id as well.
        sqlx::query(
            "DELETE FROM generated_frames WHERE session_id IN (SELECT id FROM sessions WHERE project_id = ?)",
        )
        .bind(project_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        // Generation tasks are keyed to session_id.
        sqlx::query(
            "DELETE FROM video_generation_tasks WHERE session_id IN (SELECT id FROM sessions WHERE project_id = ?)",
        )
        .bind(project_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        // Portable generation log entries are keyed to session_id too.
        sqlx::query(
            "DELETE FROM generation_logs WHERE session_id IN (SELECT id FROM sessions WHERE project_id = ?)",
        )
        .bind(project_id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

        // Project files are keyed to project_id.
        sqlx::query("DELETE FROM project_files WHERE project_id = ?")
            .bind(project_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        // Sessions are keyed to project_id.
        sqlx::query("DELETE FROM sessions WHERE project_id = ?")
            .bind(project_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        // Finally the project itself.
        sqlx::query("DELETE FROM projects WHERE id = ?")
            .bind(project_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        tx.commit().await.map_err(|e| e.to_string())?;
        Ok(())
    }

    // Session operations
    pub async fn create_session(
        &self,
        project_id: &str,
        name: &str,
        pipes_json: Option<&str>,
        files_metadata: Option<&str>,
    ) -> Result<String, String> {
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

    /// Duplicate a session: copy its copyable fields into a brand-new session
    /// row under the same project, with a fresh id + optional new name. The
    /// copy is fully independent — no shared rows.
    pub async fn duplicate_session(
        &self,
        source_session_id: &str,
        new_name: Option<&str>,
    ) -> Result<String, String> {
        let src = sqlx::query(
            "SELECT project_id, name, fps, resolution, orientation, files_metadata \
             FROM sessions WHERE id = ?",
        )
        .bind(source_session_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Source session not found: {source_session_id}"))?;

        let project_id: String = src.get(0);
        let source_name: String = src.get(1);
        // fps / resolution / orientation can be NULL on legacy rows
        // (pre-migration-0003) — read them tolerantly and fall back to the
        // schema defaults so a NULL column can never fail the whole copy.
        let fps: i64 = src
            .try_get::<Option<i64>, _>(2)
            .ok()
            .flatten()
            .unwrap_or(24);
        let resolution: String = src
            .try_get::<Option<String>, _>(3)
            .ok()
            .flatten()
            .filter(|r| !r.trim().is_empty())
            .unwrap_or_else(|| "720p".to_string());
        let orientation: String = src
            .try_get::<Option<String>, _>(4)
            .ok()
            .flatten()
            .filter(|o| !o.trim().is_empty())
            .unwrap_or_else(|| "horizontal".to_string());
        let files_metadata: Option<String> = src
            .try_get::<Option<String>, _>(5)
            .ok()
            .flatten()
            .filter(|m| !m.trim().is_empty());

        let new_id = Uuid::new_v4().to_string();
        let target_name: String = match new_name {
            Some(n) if !n.trim().is_empty() => n.trim().to_string(),
            _ => format!("{source_name} (copy)"),
        };

        // A copy's pipes live in its OWN composer row, re-keyed by the caller
        // (Pipe::rekeyed mints fresh ids so the copy never shares Svelte
        // `each` keys with the source). The legacy sessions.pipes_json column
        // must therefore stay NULL: copying the source's blob here would leave
        // stale, id-colliding pipe ids in the copy's session row.
        sqlx::query(
            "INSERT INTO sessions (id, project_id, name, fps, resolution, orientation, pipes_json, files_metadata, directory_path) \
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&new_id)
        .bind(&project_id)
        .bind(&target_name)
        .bind(&fps)
        .bind(&resolution)
        .bind(&orientation)
        .bind(Option::<String>::None)
        .bind(&files_metadata)
        .bind(Option::<String>::None) // a copy starts with no session-specific dir
        .execute(&self.pool)
        .await
        .map_err(|e| e.to_string())?;

        Ok(new_id)
    }

    pub async fn list_sessions(&self, project_id: &str) -> Result<Vec<serde_json::Value>, String> {
        let rows = sqlx::query(
            "SELECT s.id, s.project_id, s.name, s.fps, s.resolution, s.orientation, s.pipes_json, s.total_generated_frames, s.created_at, s.directory_path, p.directory_path \
             FROM sessions s LEFT JOIN projects p ON p.id = s.project_id \
             WHERE s.project_id = ? ORDER BY s.created_at DESC",
        )
        .bind(project_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| e.to_string())?;

        let sessions: Vec<serde_json::Value> = rows
            .iter()
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
                    "directory_path": row.get::<Option<String>, usize>(9).unwrap_or_default(),
                    "project_directory_path": row.get::<Option<String>, usize>(10).unwrap_or_default(),
                })
            })
            .collect();

        Ok(sessions)
    }

    pub async fn update_session(
        &self,
        session_id: &str,
        updates: &serde_json::Value,
    ) -> Result<(), String> {
        // Collect only the fields that are actually present AND type-correct.
        // Field names are hard-coded. The same vector drives both the SQL SET
        // clause and the bind order, so placeholders and values always match 1:1.
        //
        // Values are bound as TEXT. The fps / total_generated_frames columns
        // carry INTEGER affinity, so SQLite coerces a well-formed numeric
        // string back to an INTEGER on store; list_sessions reads them as i64.
        let mut sets: Vec<(&'static str, String)> = Vec::new();

        if let Some(name) = updates.get("name").and_then(|v| v.as_str()) {
            sets.push(("name", name.to_string()));
        }
        if let Some(fps) = updates.get("fps").and_then(|v| v.as_i64()) {
            sets.push(("fps", fps.to_string()));
        }
        if let Some(resolution) = updates.get("resolution").and_then(|v| v.as_str()) {
            sets.push(("resolution", resolution.to_string()));
        }
        if let Some(orientation) = updates.get("orientation").and_then(|v| v.as_str()) {
            sets.push(("orientation", orientation.to_string()));
        }
        if let Some(pipes_json) = updates.get("pipes_json").and_then(|v| v.as_str()) {
            sets.push(("pipes_json", pipes_json.to_string()));
        }
        if let Some(total_frames) = updates
            .get("total_generated_frames")
            .and_then(|v| v.as_i64())
        {
            sets.push(("total_generated_frames", total_frames.to_string()));
        }
        // 0009: the session's own media directory (the "open folder" action).
        // An empty string clears it (the engine then falls back to the project dir).
        if let Some(dir) = updates.get("directory_path").and_then(|v| v.as_str()) {
            sets.push(("directory_path", dir.to_string()));
        }

        if sets.is_empty() {
            // Nothing to change — still confirm the session exists.
            return self.assert_session_exists(session_id).await;
        }

        // Build SQL with one '?' per present field, in deterministic order.
        let mut sql = String::from("UPDATE sessions SET ");
        let mut first = true;
        for (field, _) in &sets {
            if !first {
                sql.push_str(", ");
            }
            sql.push_str(field);
            sql.push_str(" = ?");
            first = false;
        }
        sql.push_str(" WHERE id = ?");

        // Bind exactly the values for the present fields, in the same order,
        // then the session id. No NULLs, no bind-count mismatch.
        let mut query = sqlx::query(&sql);
        for (_, value) in &sets {
            query = query.bind(value);
        }
        query = query.bind(session_id);

        let result = query
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to update session: {e}"))?;

        if result.rows_affected() == 0 {
            return Err(format!(
                "Session not found: {session_id} (partial update affected 0 rows)"
            ));
        }

        Ok(())
    }

    /// Confirm the target session exists; used both when a partial update has
    /// no valid fields and to turn "0 rows affected" into a real error.
    async fn assert_session_exists(&self, session_id: &str) -> Result<(), String> {
        let exists = sqlx::query("SELECT 1 FROM sessions WHERE id = ?")
            .bind(session_id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| format!("Failed to check session existence: {e}"))?;
        if exists.is_none() {
            return Err(format!("Session not found: {session_id}"));
        }
        Ok(())
    }

    pub async fn delete_session(&self, session_id: &str) -> Result<(), String> {
        // Explicit cascade — do not rely on the per-connection FK pragma,
        // which is not guaranteed on every pooled connection.
        let mut tx = self.pool.begin().await.map_err(|e| e.to_string())?;
        sqlx::query("DELETE FROM composers WHERE session_id = ?")
            .bind(session_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        sqlx::query("DELETE FROM session_settings WHERE session_id = ?")
            .bind(session_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        sqlx::query("DELETE FROM generation_logs WHERE session_id = ?")
            .bind(session_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        sqlx::query("DELETE FROM generated_frames WHERE session_id = ?")
            .bind(session_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        sqlx::query("DELETE FROM video_generation_tasks WHERE session_id = ?")
            .bind(session_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        sqlx::query("DELETE FROM sessions WHERE id = ?")
            .bind(session_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        tx.commit().await.map_err(|e| e.to_string())?;
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

        let files: Vec<serde_json::Value> = rows
            .iter()
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

    // ── Profile settings (per-user, Phase 1) ─────────────────────────────
    /// Load the raw settings JSON for a profile (None when never saved —
    /// the frontend seeds defaults in that case).
    pub async fn get_profile_settings(&self, profile_id: &str) -> Result<Option<String>, String> {
        let row = sqlx::query("SELECT settings_json FROM profile_settings WHERE profile_id = ?")
            .bind(profile_id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| e.to_string())?;
        Ok(row.and_then(|r| r.try_get(0).ok()))
    }

    /// Upsert the profile's settings blob.
    pub async fn save_profile_settings(
        &self,
        profile_id: &str,
        settings_json: &str,
    ) -> Result<(), String> {
        sqlx::query(
            "INSERT INTO profile_settings (profile_id, settings_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)\n             ON CONFLICT (profile_id) DO UPDATE SET settings_json = excluded.settings_json, updated_at = CURRENT_TIMESTAMP",
        )
        .bind(profile_id)
        .bind(settings_json)
        .execute(&self.pool)
        .await
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    // ── Generation log (portable entries, P5) ────────────────────────────
    /// Upsert a redacted generation log entry (keyed by task id).
    pub async fn add_generation_log(&self, entry: &serde_json::Value) -> Result<(), String> {
        let task_id = entry
            .get("taskId")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let session_id = entry
            .get("sessionId")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let pipe_id = entry
            .get("pipeId")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if task_id.is_empty() {
            return Err("generation log entry missing taskId".to_string());
        }
        // Bind as a JSON string (codebase pattern: composers/sessions store
        // their JSON blobs as TEXT; sqlx SQLite has no native Value bind).
        let group_id = entry.get("groupId").and_then(|v| v.as_str());
        let entry_json = entry.to_string();
        sqlx::query(
            "INSERT INTO generation_logs (task_id, session_id, pipe_id, group_id, entry_json, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)\n             ON CONFLICT (task_id) DO UPDATE SET session_id = excluded.session_id, pipe_id = excluded.pipe_id, group_id = excluded.group_id, entry_json = excluded.entry_json, updated_at = CURRENT_TIMESTAMP",
        )
        .bind(&task_id)
        .bind(&session_id)
        .bind(&pipe_id)
        .bind(group_id)
        .bind(entry_json)
        .execute(&self.pool)
        .await
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub async fn get_generation_log(
        &self,
        task_id: &str,
    ) -> Result<Option<serde_json::Value>, String> {
        let row = sqlx::query("SELECT entry_json FROM generation_logs WHERE task_id = ?")
            .bind(task_id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| e.to_string())?;
        Ok(row
            .and_then(|r| r.try_get::<String, _>(0).ok())
            .map(|json| serde_json::from_str(&json).unwrap_or(serde_json::Value::Null)))
    }

    /// All log entries for a session, newest first.
    pub async fn list_generation_logs(
        &self,
        session_id: &str,
    ) -> Result<Vec<serde_json::Value>, String> {
        let rows = sqlx::query(
            "SELECT entry_json FROM generation_logs WHERE session_id = ? ORDER BY created_at DESC",
        )
        .bind(session_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| e.to_string())?;
        Ok(rows
            .iter()
            .map(|row| {
                row.try_get::<String, _>(0)
                    .ok()
                    .and_then(|json| serde_json::from_str(&json).ok())
                    .unwrap_or(serde_json::Value::Null)
            })
            .collect())
    }
}

#[cfg(test)]
mod update_session_tests {
    use super::Database;
    use std::sync::atomic::{AtomicUsize, Ordering};

    // Each setup() gets its own DB file: the harness runs tests in parallel
    // on shared worker threads, and a shared file races on the seed profile.
    static SETUP_COUNTER: AtomicUsize = AtomicUsize::new(0);

    async fn setup() -> (Database, String, String) {
        let n = SETUP_COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("vm_updsess_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let path = dir
            .join(format!("update_session_test_{}.db", n))
            .to_string_lossy()
            .to_string();
        let _ = std::fs::remove_file(&path);
        let db = Database::new(&path).await.unwrap();
        db.migrate().await.unwrap();
        db.seed_default_profile().await.unwrap();
        let project_id = db.create_project("default", "T", None).await.unwrap();
        let session_id = db
            .create_session(&project_id, "S", None, None)
            .await
            .unwrap();
        (db, project_id, session_id)
    }

    #[tokio::test]
    async fn test_name_only_update() {
        let (db, project_id, session_id) = setup().await;
        db.update_session(&session_id, &serde_json::json!({ "name": "Renamed" }))
            .await
            .unwrap();
        let sessions = db.list_sessions(&project_id).await.unwrap();
        assert_eq!(sessions[0]["name"], "Renamed");
        // Untouched fields keep their defaults.
        assert_eq!(sessions[0]["fps"], 24);
        assert_eq!(sessions[0]["orientation"], "horizontal");
    }

    #[tokio::test]
    async fn test_fps_only_update() {
        let (db, project_id, session_id) = setup().await;
        db.update_session(&session_id, &serde_json::json!({ "fps": 60 }))
            .await
            .unwrap();
        let sessions = db.list_sessions(&project_id).await.unwrap();
        assert_eq!(sessions[0]["fps"], 60);
        // name untouched
        assert_eq!(sessions[0]["name"], "S");
    }

    #[tokio::test]
    async fn test_resolution_only_update() {
        let (db, project_id, session_id) = setup().await;
        db.update_session(&session_id, &serde_json::json!({ "resolution": "1080p" }))
            .await
            .unwrap();
        let sessions = db.list_sessions(&project_id).await.unwrap();
        assert_eq!(sessions[0]["resolution"], "1080p");
    }

    #[tokio::test]
    async fn test_orientation_only_update() {
        let (db, project_id, session_id) = setup().await;
        db.update_session(
            &session_id,
            &serde_json::json!({ "orientation": "vertical" }),
        )
        .await
        .unwrap();
        let sessions = db.list_sessions(&project_id).await.unwrap();
        assert_eq!(sessions[0]["orientation"], "vertical");
    }

    #[tokio::test]
    async fn test_multi_field_update() {
        let (db, project_id, session_id) = setup().await;
        db.update_session(
            &session_id,
            &serde_json::json!({
                "name": "Multi",
                "fps": 30,
                "resolution": "4k",
                "orientation": "vertical",
                "total_generated_frames": 42
            }),
        )
        .await
        .unwrap();
        let sessions = db.list_sessions(&project_id).await.unwrap();
        assert_eq!(sessions[0]["name"], "Multi");
        assert_eq!(sessions[0]["fps"], 30);
        assert_eq!(sessions[0]["resolution"], "4k");
        assert_eq!(sessions[0]["orientation"], "vertical");
        assert_eq!(sessions[0]["total_generated_frames"], 42);
    }

    #[tokio::test]
    async fn test_nonexistent_session_errors() {
        let (db, _project_id, _session_id) = setup().await;
        let missing = "no-such-session-id";
        let res = db
            .update_session(missing, &serde_json::json!({ "name": "X" }))
            .await;
        assert!(res.is_err(), "expected error for missing session, got Ok");
        assert!(res.unwrap_err().contains("no-such-session-id"));
    }
}

#[cfg(test)]
mod settings_logs_tests {
    use super::Database;
    use std::sync::atomic::{AtomicUsize, Ordering};

    // Per-test DB file: the harness runs tests in parallel on shared worker
    // threads, and a shared file races on the seed profile.
    static COUNTER: AtomicUsize = AtomicUsize::new(0);

    async fn setup() -> (Database, String, String) {
        let n = COUNTER.fetch_add(1, Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("vm_setlogs_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let path = dir
            .join(format!("settings_logs_test_{n}.db"))
            .to_string_lossy()
            .to_string();
        let _ = std::fs::remove_file(&path);
        let db = Database::new(&path).await.unwrap();
        db.migrate().await.unwrap();
        db.seed_default_profile().await.unwrap();
        let project_id = db.create_project("default", "P", None).await.unwrap();
        let session_id = db
            .create_session(&project_id, "S", None, None)
            .await
            .unwrap();
        (db, project_id, session_id)
    }

    #[tokio::test]
    async fn profile_settings_round_trip_and_upsert() {
        let (db, _p, _s) = setup().await;
        assert_eq!(db.get_profile_settings("default").await.unwrap(), None);
        db.save_profile_settings("default", "{\"generationDefaults\":{\"fps\":30}}")
            .await
            .unwrap();
        let got = db.get_profile_settings("default").await.unwrap().unwrap();
        assert!(got.contains("\"fps\":30"));
        // Upsert overwrites and stays one row
        db.save_profile_settings("default", "{\"fps\":1}")
            .await
            .unwrap();
        let count: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM profile_settings WHERE profile_id = 'default'")
                .fetch_one(&db.pool)
                .await
                .unwrap();
        assert_eq!(count.0, 1);
        let got2 = db.get_profile_settings("default").await.unwrap().unwrap();
        assert!(got2.contains("\"fps\":1"));
    }

    #[tokio::test]
    async fn generation_log_upsert_and_list() {
        let (db, _p, session_id) = setup().await;
        let entry = serde_json::json!({
            "taskId": "t1",
            "sessionId": session_id,
            "pipeId": "p1",
            "startedAt": 1,
            "status": "done",
            "pieces": []
        });
        db.add_generation_log(&entry).await.unwrap();
        let got = db.get_generation_log("t1").await.unwrap().unwrap();
        assert_eq!(got["taskId"], "t1");
        // Upsert the same task id (terminal-state update)
        let entry2 = serde_json::json!({
            "taskId": "t1",
            "sessionId": session_id,
            "pipeId": "p1",
            "startedAt": 1,
            "finishedAt": 2,
            "status": "done",
            "pieces": []
        });
        db.add_generation_log(&entry2).await.unwrap();
        let got = db.get_generation_log("t1").await.unwrap().unwrap();
        assert_eq!(got["finishedAt"], 2);
        let entries = db.list_generation_logs(&session_id).await.unwrap();
        assert_eq!(entries.len(), 1);
        // Missing taskId is rejected (portable log contract)
        assert!(db
            .add_generation_log(&serde_json::json!({ "sessionId": session_id }))
            .await
            .is_err());
        // Unknown task reads back as None
        assert_eq!(db.get_generation_log("nope").await.unwrap(), None);
    }
}
