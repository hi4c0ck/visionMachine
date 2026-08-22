use super::db::Database;
use crate::models::{
    ComposerConfig, PipeRow, KeyframeSlot, SessionSettings, Resolution, AspectRatio, PromptNode,
    PromptTag, pipe_status_from_db,
    composer::{PromptNodeDbRow, KeyframeDbRow, SessionSettingsDbRow},
};
use chrono::Utc;

impl Database {
    // ── Composer CRUD ────────────────────────────────────────────────────────

    pub async fn get_composer(&self, session_id: &str) -> Result<ComposerConfig, Box<dyn std::error::Error>> {
        let mut conn = self.get_conn().await?;
        use sqlx::query_as;

        match query_as::<_, crate::models::composer::ComposerDbRow>(
            "SELECT id, session_id, name, description, config_json, version, created_at, updated_at
             FROM composers WHERE session_id = ?"
        )
        .bind(session_id)
        .fetch_optional(&mut **conn)
        .await? {
            Some(row) => {
                let config: ComposerConfig = serde_json::from_str(&row.config_json)?;
                Ok(config)
            }
            None => {
                let id = uuid::Uuid::new_v4().to_string();
                let composer = ComposerConfig::new(session_id, "Untitled Composer");
                let config_json = serde_json::to_string(&composer)?;
                sqlx::query(
                    "INSERT INTO composers (id, session_id, name, config_json, version) VALUES (?, ?, ?, ?, 1)"
                )
                .bind(&id).bind(session_id).bind("Untitled Composer").bind(&config_json)
                .execute(&mut **conn).await?;
                Ok(composer)
            }
        }
    }

    pub async fn save_composer(&self, composer: &ComposerConfig) -> Result<(), Box<dyn std::error::Error>> {
        let mut conn = self.get_conn().await?;
        let config_json = serde_json::to_string(composer)?;
        sqlx::query(
            "UPDATE composers SET config_json = ?, version = version + 1, updated_at = ? WHERE session_id = ?"
        )
        .bind(&config_json).bind(Utc::now().to_rfc3339()).bind(&composer.session_id)
        .execute(&mut **conn).await?;
        Ok(())
    }

    // ── Pipes ────────────────────────────────────────────────────────────────

    pub async fn add_pipe(
        &self, composer_id: &str, session_id: &str, name: &str, order_index: usize,
    ) -> Result<PipeRow, Box<dyn std::error::Error>> {
        let mut conn = self.get_conn().await?;
        let pipe_id = uuid::Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO pipes (id, session_id, composer_id, name, order_index, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 'idle', ?, ?)"
        )
        .bind(&pipe_id).bind(session_id).bind(composer_id).bind(name).bind(order_index).bind(&now).bind(&now)
        .execute(&mut **conn).await?;
        Ok(PipeRow::new(session_id, composer_id, name, order_index))
    }

    pub async fn update_pipe(
        &self, pipe_id: &str, updates: &serde_json::Value,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut conn = self.get_conn().await?;
        sqlx::query(
            "UPDATE pipes SET num_inference_steps = ?, cfg_scale = ?, target_frames = ?,
             status = ?, last_error = ?, updated_at = ? WHERE id = ?"
        )
        .bind(updates["num_inference_steps"].as_u64().unwrap_or(20) as i64)
        .bind(updates["cfg_scale"].as_f64().unwrap_or(7.5))
        .bind(updates["target_frames"].as_u64())
        .bind(updates["status"].as_str().unwrap_or("idle"))
        .bind(updates["last_error"].as_str())
        .bind(Utc::now().to_rfc3339())
        .bind(pipe_id)
        .execute(&mut **conn).await?;
        Ok(())
    }

    pub async fn delete_pipe(&self, pipe_id: &str) -> Result<(), Box<dyn std::error::Error>> {
        let mut conn = self.get_conn().await?;
        sqlx::query("DELETE FROM pipe_prompt_nodes WHERE pipe_id = ?").bind(pipe_id).execute(&mut **conn).await?;
        sqlx::query("DELETE FROM pipe_keyframes WHERE pipe_id = ?").bind(pipe_id).execute(&mut **conn).await?;
        sqlx::query("DELETE FROM pipes WHERE id = ?").bind(pipe_id).execute(&mut **conn).await?;
        Ok(())
    }

    pub async fn list_pipes(&self, composer_id: &str) -> Result<Vec<PipeRow>, Box<dyn std::error::Error>> {
        let mut conn = self.get_conn().await?;
        use sqlx::query_as;

        let rows: Vec<crate::models::composer::PipeDbRow> = query_as(
            "SELECT id, session_id, composer_id, name, order_index,
                    num_inference_steps, cfg_scale, target_frames, task_id,
                    status, last_error, created_at, updated_at
             FROM pipes WHERE composer_id = ? ORDER BY order_index ASC"
        )
        .bind(composer_id)
        .fetch_all(&mut **conn).await?;

        let mut result = Vec::new();
        for row in rows {
            let mut pipe = Self::pipe_row_from_db(row);
            pipe.keyframes = self.list_keyframes(&pipe.id).await.unwrap_or_default();
            pipe.prompt_nodes = self.list_prompt_nodes(&pipe.id).await.unwrap_or_default();
            result.push(pipe);
        }
        Ok(result)
    }

    fn pipe_row_from_db(row: crate::models::composer::PipeDbRow) -> PipeRow {
        PipeRow {
            id: row.id, session_id: row.session_id, composer_id: row.composer_id,
            name: row.name, order_index: row.order_index,
            num_inference_steps: row.num_inference_steps as u32,
            cfg_scale: row.cfg_scale, target_frames: row.target_frames,
            task_id: row.task_id,
            status: pipe_status_from_db(&row.status),
            last_error: row.last_error,
            keyframes: Vec::new(),
            prompt_nodes: Vec::new(),
            created_at: row.created_at,
            updated_at: row.updated_at,
        }
    }

    // ── Keyframes ────────────────────────────────────────────────────────────

    pub async fn add_keyframe(
        &self, pipe_id: &str, slot_index: u8, source_type: &str,
        source_value: &str, description: Option<&str>,
    ) -> Result<KeyframeSlot, Box<dyn std::error::Error>> {
        let mut conn = self.get_conn().await?;
        let kf_id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT OR REPLACE INTO pipe_keyframes
             (id, pipe_id, slot_index, source_type, source_value, description, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&kf_id).bind(pipe_id).bind(slot_index as i32)
        .bind(source_type).bind(source_value).bind(description)
        .bind(Utc::now().to_rfc3339())
        .execute(&mut **conn).await?;
        Ok(KeyframeSlot::new(pipe_id, slot_index))
    }

    pub async fn remove_keyframe(&self, pipe_id: &str, slot_index: u8) -> Result<(), Box<dyn std::error::Error>> {
        let mut conn = self.get_conn().await?;
        sqlx::query(
            "UPDATE pipe_keyframes SET source_type='none', source_value='', description=NULL, created_at=?
             WHERE pipe_id=? AND slot_index=?"
        )
        .bind(Utc::now().to_rfc3339()).bind(pipe_id).bind(slot_index as i32)
        .execute(&mut **conn).await?;
        Ok(())
    }

    pub async fn list_keyframes(&self, pipe_id: &str) -> Result<Vec<KeyframeSlot>, Box<dyn std::error::Error>> {
        let mut conn = self.get_conn().await?;
        let rows: Vec<KeyframeDbRow> = sqlx::query_as(
            "SELECT id, pipe_id, slot_index, source_type, source_value,
                    description, width, height, ratio, created_at
             FROM pipe_keyframes WHERE pipe_id = ? ORDER BY slot_index ASC"
        )
        .bind(pipe_id).fetch_all(&mut **conn).await?;
        Ok(rows.into_iter().map(|r| KeyframeSlot {
            id: r.id, pipe_id: r.pipe_id, slot_index: r.slot_index,
            source_type: r.source_type, source_value: r.source_value,
            description: r.description, width: r.width, height: r.height,
            ratio: r.ratio, created_at: r.created_at,
        }).collect())
    }

    // ── Prompt Nodes ─────────────────────────────────────────────────────────

    pub async fn add_prompt_node(
        &self, pipe_id: &str, parent_id: Option<&str>, tag_label: &str,
        value: &str, frame_start: Option<u32>, frame_end: Option<u32>,
    ) -> Result<String, Box<dyn std::error::Error>> {
        let mut conn = self.get_conn().await?;
        let node_id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO pipe_prompt_nodes
             (id, pipe_id, parent_id, tag, value, frame_start, frame_end, enabled, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)"
        )
        .bind(&node_id)
        .bind(pipe_id)
        .bind(parent_id)
        .bind(tag_label)
        .bind(value)
        .bind(frame_start)
        .bind(frame_end)
        .bind(Utc::now().to_rfc3339())
        .bind(Utc::now().to_rfc3339())
        .execute(&mut **conn).await?;
        Ok(node_id)
    }

    pub async fn update_prompt_node(
        &self, node_id: &str, value: Option<&str>, frame_start: Option<u32>, frame_end: Option<u32>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let mut conn = self.get_conn().await?;
        sqlx::query(
            "UPDATE pipe_prompt_nodes SET value=COALESCE(?,value), frame_start=COALESCE(?,frame_start),
             frame_end=COALESCE(?,frame_end), updated_at=? WHERE id=?"
        )
        .bind(value).bind(frame_start).bind(frame_end)
        .bind(Utc::now().to_rfc3339()).bind(node_id)
        .execute(&mut **conn).await?;
        Ok(())
    }

    pub async fn toggle_prompt_node(&self, node_id: &str, enabled: bool) -> Result<(), Box<dyn std::error::Error>> {
        let mut conn = self.get_conn().await?;
        sqlx::query(
            "UPDATE pipe_prompt_nodes SET enabled=?, updated_at=? WHERE id=?"
        )
        .bind(enabled).bind(Utc::now().to_rfc3339()).bind(node_id)
        .execute(&mut **conn).await?;
        Ok(())
    }

    pub async fn remove_prompt_node(&self, node_id: &str) -> Result<(), Box<dyn std::error::Error>> {
        let mut conn = self.get_conn().await?;
        sqlx::query("DELETE FROM pipe_prompt_nodes WHERE parent_id = ?").bind(node_id).execute(&mut **conn).await?;
        sqlx::query("DELETE FROM pipe_prompt_nodes WHERE id = ?").bind(node_id).execute(&mut **conn).await?;
        Ok(())
    }

    pub async fn list_prompt_nodes(&self, pipe_id: &str) -> Result<Vec<PromptNode>, Box<dyn std::error::Error>> {
        let mut conn = self.get_conn().await?;
        let rows: Vec<PromptNodeDbRow> = sqlx::query_as(
            "SELECT id, pipe_id, parent_id, tag, value, frame_start, frame_end, enabled, created_at, updated_at
             FROM pipe_prompt_nodes WHERE pipe_id = ? ORDER BY created_at ASC"
        )
        .bind(pipe_id).fetch_all(&mut **conn).await?;
        Ok(rows.into_iter().map(|r| PromptNode {
            id: r.id, pipe_id: r.pipe_id, parent_id: r.parent_id,
            tag: match r.tag.as_str() {
                "segment" => PromptTag::Segment,
                "movement" => PromptTag::Movement,
                "rotation" => PromptTag::Rotation,
                "focal_point" => PromptTag::FocalPoint,
                "lighting" => PromptTag::Lighting,
                "exposure" => PromptTag::Exposure,
                "lens_effect" => PromptTag::LensEffect,
                "global_style" => PromptTag::GlobalStyle,
                _ => PromptTag::Segment,
            },
            value: r.value,
            frame_start: r.frame_start,
            frame_end: r.frame_end,
            enabled: r.enabled,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }).collect())
    }

    // ── Session Settings ─────────────────────────────────────────────────────

    pub async fn get_or_create_session_settings(
        &self, session_id: &str,
    ) -> Result<SessionSettings, Box<dyn std::error::Error>> {
        let mut conn = self.get_conn().await?;
        use sqlx::query_as;

        match query_as::<_, SessionSettingsDbRow>(
            "SELECT id, session_id, resolution, aspect_ratio, total_frames, fps, created_at, updated_at
             FROM session_settings WHERE session_id = ?"
        )
        .bind(session_id)
        .fetch_optional(&mut **conn).await? {
            Some(row) => Ok(Self::session_settings_from_db(row)),
            None => {
                let settings = SessionSettings::new(session_id);
                self.save_session_settings(&settings).await?;
                Ok(settings)
            }
        }
    }

    pub async fn save_session_settings(&self, settings: &SessionSettings) -> Result<(), Box<dyn std::error::Error>> {
        let mut conn = self.get_conn().await?;
        sqlx::query(
            "INSERT INTO session_settings
             (id, session_id, resolution, aspect_ratio, total_frames, fps, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(session_id) DO UPDATE SET
                resolution = excluded.resolution, aspect_ratio = excluded.aspect_ratio,
                total_frames = excluded.total_frames, fps = excluded.fps,
                updated_at = excluded.updated_at"
        )
        .bind(&settings.id).bind(&settings.session_id)
        .bind(format!("{:?}", settings.resolution))
        .bind(format!("{:?}", settings.aspect_ratio))
        .bind(settings.total_frames).bind(settings.fps)
        .bind(settings.created_at.as_ref().map(|dt| dt.to_rfc3339()))
        .bind(Utc::now().to_rfc3339())
        .execute(&mut **conn).await?;
        Ok(())
    }

    fn session_settings_from_db(row: SessionSettingsDbRow) -> SessionSettings {
        let resolution = match row.resolution.as_str() { "P480" => Resolution::P480, "P1080" => Resolution::P1080, _ => Resolution::P720 };
        let aspect_ratio = match row.aspect_ratio.as_str() { "R9x16" => AspectRatio::R9x16, "R1x1" => AspectRatio::R1x1, _ => AspectRatio::R16x9 };
        SessionSettings { id: row.id, session_id: row.session_id, resolution, aspect_ratio,
            total_frames: row.total_frames, fps: row.fps, created_at: row.created_at, updated_at: row.updated_at }
    }
}
