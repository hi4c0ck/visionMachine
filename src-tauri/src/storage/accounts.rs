//! Small per-account service: stats, artifact paths, data dump, cascade delete.
//! Used by the welcome-page account list and account deletion.

use sqlx::{sqlite::SqlitePool, Row};

use crate::storage::media_scan;

/// Counts of an account's generated data (shown on the delete-confirmation modal).
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
pub struct AccountStats {
    pub sessions: i64,
    pub images: i64,
    pub videos: i64,
}

impl AccountStats {
    /// Whether the account owns anything worth confirming / archiving.
    pub fn has_data(&self) -> bool {
        self.sessions > 0 || self.images > 0 || self.videos > 0
    }
}

/// Per-account operations over the shared pool.
pub struct AccountService {
    pool: SqlitePool,
}

impl AccountService {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    async fn count(&self, sql: &str, profile_id: &str) -> Result<i64, String> {
        let n: i64 = sqlx::query_scalar(sql)
            .bind(profile_id)
            .fetch_one(&self.pool)
            .await
            .map_err(|e| e.to_string())?;
        Ok(n)
    }

    /// (sessions, images, videos) owned by this account.
    /// images = generated frames + image-type project files.
    pub async fn stats(&self, profile_id: &str) -> Result<AccountStats, String> {
        let proj = "SELECT id FROM projects WHERE profile_id = ?";
        let sess = format!("SELECT id FROM sessions WHERE project_id IN ({proj})");

        let sessions = self
            .count(
                &format!("SELECT COUNT(*) FROM sessions WHERE project_id IN ({proj})"),
                profile_id,
            )
            .await?;
        let frames = self
            .count(
                &format!("SELECT COUNT(*) FROM generated_frames WHERE session_id IN ({sess})"),
                profile_id,
            )
            .await?;
        let image_files = self
            .count(
                &format!(
                    "SELECT COUNT(*) FROM project_files WHERE project_id IN ({proj}) \
                     AND lower(coalesce(file_type, '')) = 'image'"
                ),
                profile_id,
            )
            .await?;
        let videos = self
            .count(
                &format!(
                    "SELECT COUNT(*) FROM project_files WHERE project_id IN ({proj}) \
                     AND lower(coalesce(file_type, '')) = 'video'"
                ),
                profile_id,
            )
            .await?;

        Ok(AccountStats {
            sessions,
            images: frames + image_files,
            videos,
        })
    }

    /// Display name of the profile (falls back to the id when missing).
    pub async fn name(&self, profile_id: &str) -> Result<String, String> {
        Ok(
            sqlx::query_scalar::<_, String>("SELECT name FROM profiles WHERE id = ?")
                .bind(profile_id)
                .fetch_optional(&self.pool)
                .await
                .map_err(|e| e.to_string())?
                .unwrap_or_else(|| profile_id.to_string()),
        )
    }

    /// Every on-disk media file this account references, deduplicated.
    /// Sources: tracked artifacts (generated frames / project files), legacy
    /// generation-pipeline outputs, and media refs embedded in JSON blobs.
    pub async fn artifact_paths(&self, profile_id: &str) -> Result<Vec<String>, String> {
        let proj = "SELECT id FROM projects WHERE profile_id = ?";
        let sess = format!("SELECT id FROM sessions WHERE project_id IN ({proj})");
        let mut paths: Vec<String> = Vec::new();

        // Tracked artifacts: generated frames + project files.
        let rows = sqlx::query(&format!(
            "SELECT file_path FROM generated_frames WHERE session_id IN ({sess}) \n UNION \n SELECT file_path FROM project_files WHERE project_id IN ({proj})"
        ))
        .bind(profile_id)
        .bind(profile_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| e.to_string())?;
        for r in &rows {
            if let Some(p) = r.get::<Option<String>, _>(0) {
                if !p.trim().is_empty() {
                    paths.push(p);
                }
            }
        }

        // Legacy generation-pipeline outputs (0002 tables, often empty).
        let legacy = sqlx::query(&format!(
            "SELECT output_path FROM generation_tasks \n WHERE session_id IN ({sess}) AND output_path IS NOT NULL \n UNION \n SELECT image_path FROM keyframes \n WHERE image_path IS NOT NULL AND node_id IN \n (SELECT id FROM prompt_nodes WHERE pipe_id \n IN (SELECT id FROM pipes WHERE session_id IN ({sess})))"
        ))
        .bind(profile_id)
        .bind(profile_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| e.to_string())?;
        for r in &legacy {
            if let Some(p) = r.get::<Option<String>, _>(0) {
                if !p.trim().is_empty() {
                    paths.push(p);
                }
            }
        }

        // Media refs embedded in composer / session JSON blobs.
        let composers = sqlx::query_scalar::<_, String>(&format!(
            "SELECT config_json FROM composers WHERE session_id IN ({sess})"
        ))
        .bind(profile_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| e.to_string())?;
        for json in &composers {
            media_scan::collect_from_json(json, &mut paths);
        }

        let blobs = sqlx::query(&format!(
            "SELECT pipes_json, files_metadata FROM sessions WHERE project_id IN ({proj})"
        ))
        .bind(profile_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| e.to_string())?;
        for r in &blobs {
            if let Some(json) = r.get::<Option<String>, _>(0) {
                media_scan::collect_from_json(&json, &mut paths);
            }
            if let Some(json) = r.get::<Option<String>, _>(1) {
                media_scan::collect_from_json(&json, &mut paths);
            }
        }

        let mut seen = std::collections::HashSet::new();
        paths.retain(|p| seen.insert(p.clone()));
        Ok(paths)
    }

    /// JSON snapshot of every DB row the account owns (archival / restore).
    pub async fn data_dump(&self, profile_id: &str) -> Result<serde_json::Value, String> {
        let sess_in = "SELECT id FROM sessions WHERE project_id IN \
                       (SELECT id FROM projects WHERE profile_id = ?)";

        let rows = sqlx::query("SELECT id, name, created_at FROM profiles WHERE id = ?")
            .bind(profile_id)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| e.to_string())?;
        let profiles: Vec<serde_json::Value> = rows
            .iter()
            .map(|r| {
                serde_json::json!({
                    "id": r.get::<String, _>(0),
                    "name": r.get::<String, _>(1),
                    "created_at": r.get::<String, _>(2),
                })
            })
            .collect();

        let rows = sqlx::query(
            "SELECT id, name, coalesce(directory_path, ''), created_at \
             FROM projects WHERE profile_id = ?",
        )
        .bind(profile_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| e.to_string())?;
        let projects: Vec<serde_json::Value> = rows
            .iter()
            .map(|r| {
                serde_json::json!({
                    "id": r.get::<String, _>(0),
                    "name": r.get::<String, _>(1),
                    "directory_path": r.get::<String, _>(2),
                    "created_at": r.get::<String, _>(3),
                })
            })
            .collect();

        let rows = sqlx::query(
            "SELECT id, project_id, name, coalesce(fps, 0), coalesce(resolution, ''), \
             coalesce(orientation, ''), coalesce(total_generated_frames, 0) \
             FROM sessions WHERE project_id IN \
             (SELECT id FROM projects WHERE profile_id = ?)",
        )
        .bind(profile_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| e.to_string())?;
        let sessions: Vec<serde_json::Value> = rows
            .iter()
            .map(|r| {
                serde_json::json!({
                    "id": r.get::<String, _>(0),
                    "project_id": r.get::<String, _>(1),
                    "name": r.get::<String, _>(2),
                    "fps": r.get::<i64, _>(3),
                    "resolution": r.get::<String, _>(4),
                    "orientation": r.get::<String, _>(5),
                    "total_generated_frames": r.get::<i64, _>(6),
                })
            })
            .collect();

        let rows = sqlx::query(&format!(
            "SELECT id, session_id, coalesce(name, ''), config_json, coalesce(version, 0) \
             FROM composers WHERE session_id IN ({sess_in})"
        ))
        .bind(profile_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| e.to_string())?;
        let composers: Vec<serde_json::Value> = rows
            .iter()
            .map(|r| {
                serde_json::json!({
                    "id": r.get::<String, _>(0),
                    "session_id": r.get::<String, _>(1),
                    "name": r.get::<String, _>(2),
                    "config_json": r.get::<String, _>(3),
                    "version": r.get::<i64, _>(4),
                })
            })
            .collect();

        Ok(serde_json::json!({
            "archived_at": chrono::Utc::now().to_rfc3339(),
            "profiles": profiles,
            "projects": projects,
            "sessions": sessions,
            "composers": composers,
        }))
    }

    /// Explicit cascade delete of the account and everything it owns.
    /// Mirrors the per-connection FK pragma (does not rely on it).
    pub async fn delete_cascade(&self, profile_id: &str) -> Result<(), String> {
        let proj = "SELECT id FROM projects WHERE profile_id = ?";
        let sess = format!("SELECT id FROM sessions WHERE project_id IN ({proj})");
        let pipes = format!("SELECT id FROM pipes WHERE session_id IN ({sess})");
        let nodes = format!("SELECT id FROM prompt_nodes WHERE pipe_id IN ({pipes})");

        let mut tx = self.pool.begin().await.map_err(|e| e.to_string())?;
        for sql in [
            // Legacy generation-pipeline (deepest children first).
            format!("DELETE FROM keyframes WHERE node_id IN ({nodes})"),
            format!("DELETE FROM prompt_nodes WHERE pipe_id IN ({pipes})"),
            format!("DELETE FROM generation_tasks WHERE session_id IN ({sess})"),
            format!("DELETE FROM pipes WHERE session_id IN ({sess})"),
            // Composer era.
            format!("DELETE FROM composers WHERE session_id IN ({sess})"),
            format!("DELETE FROM session_settings WHERE session_id IN ({sess})"),
            format!("DELETE FROM generated_frames WHERE session_id IN ({sess})"),
            // Project level.
            format!("DELETE FROM project_files WHERE project_id IN ({proj})"),
            format!("DELETE FROM sessions WHERE project_id IN ({proj})"),
            // Profile level.
            format!("DELETE FROM projects WHERE profile_id IN ({proj})"),
            "DELETE FROM profiles WHERE id = ?".to_string(),
        ] {
            sqlx::query(&sql)
                .bind(profile_id)
                .execute(&mut *tx)
                .await
                .map_err(|e| e.to_string())?;
        }
        tx.commit().await.map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::db::Database;

    /// Shared per-process temp DB (same pattern as the db.rs tests);
    /// each test uses a unique profile id so parallel tests don't clash.
    async fn fixture() -> (Database, AccountService) {
        let dir = std::env::temp_dir().join(format!("vm_accts_{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("accts_test.db").to_string_lossy().to_string();
        let db = Database::new(&path).await.unwrap();
        db.migrate().await.unwrap();
        db.seed_default_profile().await.unwrap();
        let service = AccountService::new(db.pool.clone());
        (db, service)
    }

    /// Profile + project + session + a generated frame + image/video files
    /// + a composer blob with an embedded media ref.
    async fn seed_account(db: &Database, profile_id: &str) {
        db.get_or_create_profile(profile_id, "Tester")
            .await
            .unwrap();
        let project = db.create_project(profile_id, "P", None).await.unwrap();
        let session = db.create_session(&project, "S", None, None).await.unwrap();

        sqlx::query(
            "INSERT INTO generated_frames (id, session_id, pipe_index, frame_index, file_path) \
             VALUES (?, ?, 0, 0, ?)",
        )
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(&session)
        .bind("/tmp/vm_test/frame_0.png")
        .execute(&db.pool)
        .await
        .unwrap();

        db.add_file(&project, "img", "/tmp/vm_test/ref.png", "image", 100)
            .await
            .unwrap();
        db.add_file(&project, "vid", "/tmp/vm_test/out.mp4", "video", 1000)
            .await
            .unwrap();

        sqlx::query("INSERT INTO composers (id, session_id, config_json) VALUES (?, ?, ?)")
            .bind(uuid::Uuid::new_v4().to_string())
            .bind(&session)
            .bind(r#"{"keyframes":[{"image_path":"/tmp/vm_test/kf.png"}]}"#)
            .execute(&db.pool)
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn stats_count_generated_data() {
        let (db, service) = fixture().await;
        let profile = format!("accts_{}", uuid::Uuid::new_v4());
        seed_account(&db, &profile).await;

        let stats = service.stats(&profile).await.unwrap();
        assert_eq!(stats.sessions, 1);
        assert_eq!(stats.images, 2); // 1 generated frame + 1 image file
        assert_eq!(stats.videos, 1);
        assert!(stats.has_data());
    }

    #[tokio::test]
    async fn artifact_paths_merge_tracked_and_embedded() {
        let (db, service) = fixture().await;
        let profile = format!("accts_{}", uuid::Uuid::new_v4());
        seed_account(&db, &profile).await;

        let paths = service.artifact_paths(&profile).await.unwrap();
        for expected in [
            "/tmp/vm_test/frame_0.png",
            "/tmp/vm_test/ref.png",
            "/tmp/vm_test/out.mp4",
            "/tmp/vm_test/kf.png", // embedded in the composer blob
        ] {
            assert!(paths.iter().any(|p| p == expected), "missing {expected}");
        }
        let unique: std::collections::HashSet<_> = paths.iter().collect();
        assert_eq!(unique.len(), paths.len(), "paths must be deduplicated");
    }

    #[tokio::test]
    async fn empty_account_has_no_data() {
        let (db, service) = fixture().await;
        let profile = format!("accts_{}", uuid::Uuid::new_v4());
        db.get_or_create_profile(&profile, "Empty").await.unwrap();

        let stats = service.stats(&profile).await.unwrap();
        assert!(!stats.has_data());
        assert!(service.artifact_paths(&profile).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn delete_cascade_removes_everything() {
        let (db, service) = fixture().await;
        let profile = format!("accts_{}", uuid::Uuid::new_v4());
        seed_account(&db, &profile).await;

        service.delete_cascade(&profile).await.unwrap();

        assert!(!service.stats(&profile).await.unwrap().has_data());
        assert!(service.artifact_paths(&profile).await.unwrap().is_empty());
        // Profile row is gone → name() falls back to the id.
        assert_eq!(service.name(&profile).await.unwrap(), profile);
        let dump = service.data_dump(&profile).await.unwrap();
        assert_eq!(dump["projects"].as_array().unwrap().len(), 0);
        assert_eq!(dump["composers"].as_array().unwrap().len(), 0);
    }
}
