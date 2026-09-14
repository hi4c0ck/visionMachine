//! Generation task persistence (video_generation_tasks table, migration 0005).
//! Live state lives in the in-memory registry; this table tracks terminal and
//! terminal-recoverable rows. FK to sessions cascades on session/project delete.

use sqlx::Row;

use super::db::Database;

/// A persisted generation-task row. Stages are stored as a JSON array of
/// GenerationStageView (serde camelCase), so a terminal row can be rebuilt
/// into a full task view by the commands layer.
pub struct GenerationTaskRow {
    pub id: String,
    pub session_id: String,
    pub pipe_id: String,
    pub status: String,
    pub progress: f64,
    pub stages_json: Option<String>,
    pub output_path: Option<String>,
    pub error: Option<String>,
}

impl Database {
    pub async fn insert_generation_task(
        &self,
        task_id: &str,
        session_id: &str,
        pipe_id: &str,
        status: &str,
    ) -> Result<(), String> {
        sqlx::query(
            "INSERT INTO video_generation_tasks (id, session_id, pipe_id, status, progress) \
             VALUES (?, ?, ?, ?, 0.0)",
        )
        .bind(task_id)
        .bind(session_id)
        .bind(pipe_id)
        .bind(status)
        .execute(&self.pool)
        .await
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub async fn update_generation_task(
        &self,
        task_id: &str,
        status: &str,
        progress: f64,
        stages_json: &str,
        output_path: Option<&str>,
        error: Option<&str>,
    ) -> Result<(), String> {
        sqlx::query(
            "UPDATE video_generation_tasks \
             SET status = ?, progress = ?, stages_json = ?, output_path = ?, error = ?, \
                 updated_at = CURRENT_TIMESTAMP \
             WHERE id = ?",
        )
        .bind(status)
        .bind(progress)
        .bind(stages_json)
        .bind(output_path)
        .bind(error)
        .bind(task_id)
        .execute(&self.pool)
        .await
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub async fn get_generation_task_row(
        &self,
        task_id: &str,
    ) -> Result<Option<GenerationTaskRow>, String> {
        let row = sqlx::query(
            "SELECT id, session_id, pipe_id, status, progress, stages_json, output_path, error \
             FROM video_generation_tasks WHERE id = ?",
        )
        .bind(task_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| e.to_string())?;

        Ok(row.map(|r| GenerationTaskRow {
            id: r.get("id"),
            session_id: r.get("session_id"),
            pipe_id: r.get("pipe_id"),
            status: r.get("status"),
            progress: r.get::<f64, _>("progress"),
            stages_json: r.get("stages_json"),
            output_path: r.get("output_path"),
            error: r.get("error"),
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};

    async fn setup() -> (Database, String) {
        let opts = SqliteConnectOptions::new()
            .in_memory(true)
            .create_if_missing(true);
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(opts)
            .await
            .expect("pool");
        let db = Database::from_pool(pool);
        db.migrate().await.expect("migrate");
        // FKs are enforced: seed a valid profile → project → session chain.
        let profile = db.create_profile("default").await.expect("profile");
        let pid = db
            .create_project(&profile, "a project", None)
            .await
            .unwrap();
        let sid = db
            .create_session(&pid, "a session", None, None)
            .await
            .unwrap();
        (db, sid)
    }

    #[tokio::test]
    async fn insert_get_roundtrip() {
        let (db, sid) = setup().await;
        db.insert_generation_task("t1", &sid, "pipe1", "queued")
            .await
            .unwrap();
        let row = db.get_generation_task_row("t1").await.unwrap().unwrap();
        assert_eq!(row.status, "queued");
        assert_eq!(row.pipe_id, "pipe1");

        db.update_generation_task("t1", "done", 1.0, "[]", Some("/out.mp4"), None)
            .await
            .unwrap();
        let row = db.get_generation_task_row("t1").await.unwrap().unwrap();
        assert_eq!(row.status, "done");
        assert_eq!(row.output_path, Some("/out.mp4".to_string()));
        assert!(row.error.is_none());
    }

    #[tokio::test]
    async fn session_delete_cascades_tasks() {
        let (db, sid) = setup().await;
        db.insert_generation_task("t1", &sid, "pipe1", "running")
            .await
            .unwrap();
        db.delete_session(&sid).await.unwrap();
        assert!(db.get_generation_task_row("t1").await.unwrap().is_none());
    }
}
