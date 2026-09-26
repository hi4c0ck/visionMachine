//! Persistent session-generation group rows.

use super::db::Database;
use serde::{Deserialize, Serialize};
use sqlx::Row;

/// One group-run source record: which pipe's successful output clip feeds
/// this run's composition, in what order. Persisted ON the group row (as a
/// JSON array in `sources_json`) and written atomically with the
/// composition state, so a row can never describe a source set different
/// from the artifacts on disk.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupSourceRecord {
    /// Pipe id (stable identity; the run's queue order is the source of
    /// truth for ordering, so `order_index` is informational only).
    pub pipe_id: String,
    /// The task that produced the source clip.
    pub task_id: String,
    /// The clip's original location (`<session>/<pipe-name>/<task>/video.mp4`).
    pub source_path: String,
    /// Where the clip was staged inside `session-video/` (the concat
    /// manifest always references these, never the originals).
    pub staged_path: String,
    /// Zero-based position in the concat order.
    pub order_index: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerationGroupRow {
    pub group_id: String,
    pub session_id: String,
    pub status: String,
    pub progress: f64,
    pub pipes_json: String,
    pub failure_policy: String,
    pub auto_compose: bool,
    pub session_video_path: Option<String>,
    pub compose_state: Option<String>,
    pub compose_error: Option<String>,
    pub error: Option<String>,
    pub started_at: i64,
    /// Group-run source records (JSON array of `GroupSourceRecord`).
    /// `NULL` on pre-0011 rows (read back as an empty list).
    pub sources_json: Option<String>,
}

impl Database {
    pub async fn insert_generation_group(&self, r: &GenerationGroupRow) -> Result<(), String> {
        // sources_json is additive (0011) — the tolerant-ALTER means pre-migrated
        // DBs lack the column, so only write it when the caller has records.
        if r.sources_json
            .as_deref()
            .filter(|s| !s.is_empty())
            .is_some()
        {
            let sources_json = r.sources_json.as_deref().unwrap_or("[]");
            sqlx::query("INSERT INTO generation_groups (group_id, session_id, status, progress, pipes_json, failure_policy, auto_compose, session_video_path, compose_state, compose_error, error, started_at, sources_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
                .bind(&r.group_id).bind(&r.session_id).bind(&r.status).bind(r.progress).bind(&r.pipes_json).bind(&r.failure_policy).bind(r.auto_compose as i64).bind(&r.session_video_path).bind(&r.compose_state).bind(&r.compose_error).bind(&r.error).bind(r.started_at).bind(sources_json)
                .execute(&self.pool).await.map_err(|e| e.to_string())?;
        } else {
            sqlx::query("INSERT INTO generation_groups (group_id, session_id, status, progress, pipes_json, failure_policy, auto_compose, session_video_path, compose_state, compose_error, error, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
                .bind(&r.group_id).bind(&r.session_id).bind(&r.status).bind(r.progress).bind(&r.pipes_json).bind(&r.failure_policy).bind(r.auto_compose as i64).bind(&r.session_video_path).bind(&r.compose_state).bind(&r.compose_error).bind(&r.error).bind(r.started_at)
                .execute(&self.pool).await.map_err(|e| e.to_string())?;
        }
        Ok(())
    }
    pub async fn update_generation_group(
        &self,
        group_id: &str,
        status: &str,
        progress: f64,
        pipes_json: &str,
        error: Option<&str>,
    ) -> Result<(), String> {
        sqlx::query("UPDATE generation_groups SET status = ?, progress = ?, pipes_json = ?, error = ?, updated_at = CURRENT_TIMESTAMP WHERE group_id = ?")
            .bind(status).bind(progress).bind(pipes_json).bind(error).bind(group_id)
            .execute(&self.pool).await.map_err(|e| e.to_string())?;
        Ok(())
    }
    /// Persist the composition outcome AND its source records atomically, so
    /// the group row never describes a source set different from what was
    /// actually staged/concatenated.
    pub async fn update_generation_group_composition(
        &self,
        group_id: &str,
        session_video_path: Option<&str>,
        compose_state: Option<&str>,
        compose_error: Option<&str>,
        sources_json: Option<&str>,
    ) -> Result<(), String> {
        sqlx::query("UPDATE generation_groups SET session_video_path = ?, compose_state = ?, compose_error = ?, sources_json = ?, updated_at = CURRENT_TIMESTAMP WHERE group_id = ?")
            .bind(session_video_path).bind(compose_state).bind(compose_error).bind(sources_json).bind(group_id)
            .execute(&self.pool).await.map_err(|e| e.to_string())?;
        Ok(())
    }
    pub async fn get_generation_group_row(
        &self,
        group_id: &str,
    ) -> Result<Option<GenerationGroupRow>, String> {
        let row = sqlx::query("SELECT group_id, session_id, status, progress, pipes_json, failure_policy, auto_compose, session_video_path, compose_state, compose_error, error, started_at, sources_json FROM generation_groups WHERE group_id = ?")
            .bind(group_id).fetch_optional(&self.pool).await.map_err(|e| e.to_string())?;
        Ok(row.map(|r| GenerationGroupRow {
            group_id: r.get("group_id"),
            session_id: r.get("session_id"),
            status: r.get("status"),
            progress: r.get("progress"),
            pipes_json: r.get("pipes_json"),
            failure_policy: r.get("failure_policy"),
            auto_compose: r.get::<i64, _>("auto_compose") != 0,
            session_video_path: r.get("session_video_path"),
            compose_state: r.get("compose_state"),
            compose_error: r.get("compose_error"),
            error: r.get("error"),
            started_at: r.get("started_at"),
            sources_json: r.try_get("sources_json").ok().flatten(),
        }))
    }
}
