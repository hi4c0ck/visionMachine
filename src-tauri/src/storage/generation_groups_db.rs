//! Persistent session-generation group rows.

use super::db::Database;
use serde::{Deserialize, Serialize};
use sqlx::Row;

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
}

impl Database {
    pub async fn insert_generation_group(&self, r: &GenerationGroupRow) -> Result<(), String> {
        sqlx::query("INSERT INTO generation_groups (group_id, session_id, status, progress, pipes_json, failure_policy, auto_compose, session_video_path, compose_state, compose_error, error, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
            .bind(&r.group_id).bind(&r.session_id).bind(&r.status).bind(r.progress).bind(&r.pipes_json).bind(&r.failure_policy).bind(r.auto_compose as i64).bind(&r.session_video_path).bind(&r.compose_state).bind(&r.compose_error).bind(&r.error).bind(r.started_at)
            .execute(&self.pool).await.map_err(|e| e.to_string())?;
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
    pub async fn update_generation_group_composition(
        &self,
        group_id: &str,
        session_video_path: Option<&str>,
        compose_state: Option<&str>,
        compose_error: Option<&str>,
    ) -> Result<(), String> {
        sqlx::query("UPDATE generation_groups SET session_video_path = ?, compose_state = ?, compose_error = ?, updated_at = CURRENT_TIMESTAMP WHERE group_id = ?")
            .bind(session_video_path).bind(compose_state).bind(compose_error).bind(group_id)
            .execute(&self.pool).await.map_err(|e| e.to_string())?;
        Ok(())
    }
    pub async fn get_generation_group_row(
        &self,
        group_id: &str,
    ) -> Result<Option<GenerationGroupRow>, String> {
        let row = sqlx::query("SELECT group_id, session_id, status, progress, pipes_json, failure_policy, auto_compose, session_video_path, compose_state, compose_error, error, started_at FROM generation_groups WHERE group_id = ?")
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
        }))
    }
}
