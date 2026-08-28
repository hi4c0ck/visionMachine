use super::db::Database;
use crate::models::{
    ComposerConfig, PipeRow, KeyframeSlot, SessionSettings, Resolution, AspectRatio, PromptNode,
    PromptTag, pipe_status_from_db,
};
use chrono::Utc;

impl Database {
    // ── Composer CRUD ────────────────────────────────────────────────────────

    pub async fn get_composer(&self, session_id: &str) -> Result<ComposerConfig, String> {
        use sqlx::Row;
        
        let row = sqlx::query("SELECT id, session_id, name, description, config_json, version, created_at, updated_at FROM composers WHERE session_id = ?")
            .bind(session_id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| e.to_string())?;

        match row {
            Some(row) => {
                let config: ComposerConfig = serde_json::from_str(&row.get::<String, _>("config_json"))
                    .map_err(|e| format!("Failed to parse composer config: {}", e))?;
                Ok(config)
            }
            None => {
                let id = uuid::Uuid::new_v4().to_string();
                let composer = ComposerConfig::new(session_id, "Untitled Composer");
                let config_json = serde_json::to_string(&composer)
                    .map_err(|e| format!("Failed to serialize composer: {}", e))?;
                
                sqlx::query(
                    "INSERT INTO composers (id, session_id, name, config_json, version) VALUES (?, ?, ?, ?, 1)",
                )
                .bind(&id)
                .bind(session_id)
                .bind("Untitled Composer")
                .bind(&config_json)
                .execute(&self.pool)
                .await
                .map_err(|e| e.to_string())?;
                
                Ok(composer)
            }
        }
    }

    pub async fn save_composer(&self, composer: &ComposerConfig) -> Result<(), String> {
        // First, try to get existing composer by session_id
        let existing = sqlx::query("SELECT id FROM composers WHERE session_id = ?")
            .bind(&composer.session_id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| e.to_string())?;

        let config_json = serde_json::to_string(composer)
            .map_err(|e| format!("Failed to serialize composer: {}", e))?;

        if let Some(row) = existing {
            // Update existing
            sqlx::query(
                "UPDATE composers SET config_json = ?, version = version + 1, updated_at = ? WHERE id = ?",
            )
            .bind(&config_json)
            .bind(Utc::now().to_rfc3339())
            .bind(row.get::<String, _>(0))
            .execute(&self.pool)
            .await
            .map_err(|e| e.to_string())?;
        } else {
            // Create new composer
            let id = uuid::Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO composers (id, session_id, name, config_json, version, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)",
            )
            .bind(&id)
            .bind(&composer.session_id)
            .bind(&composer.name)
            .bind(&config_json)
            .bind(Utc::now().to_rfc3339())
            .bind(Utc::now().to_rfc3339())
            .execute(&self.pool)
            .await
            .map_err(|e| e.to_string())?;
        }

        Ok(())
    }

    // ── Pipes ────────────────────────────────────────────────────────────────

    pub async fn add_pipe(
        &self,
        composer_id: &str,
        session_id: &str,
        name: &str,
        order_index: usize,
    ) -> Result<PipeRow, String> {
        let pipe_id = uuid::Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        
        sqlx::query(
            "INSERT INTO pipes (id, session_id, composer_id, name, order_index, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, 'idle', ?, ?)",
        )
        .bind(&pipe_id)
        .bind(session_id)
        .bind(composer_id)
        .bind(name)
        .bind(order_index as i64)
        .bind(&now)
        .bind(&now)
        .execute(&self.pool)
        .await
        .map_err(|e| e.to_string())?;
        
        Ok(PipeRow::new(session_id, composer_id, name, order_index))
    }

    pub async fn update_pipe(
        &self,
        pipe_id: &str,
        updates: &serde_json::Value,
    ) -> Result<(), String> {
        sqlx::query(
            "UPDATE pipes SET num_inference_steps = ?, cfg_scale = ?, target_frames = ?,
             status = ?, last_error = ?, updated_at = ? WHERE id = ?",
        )
        .bind(updates["num_inference_steps"].as_u64().unwrap_or(20) as i64)
        .bind(updates["cfg_scale"].as_f64().unwrap_or(7.5))
        .bind(updates["target_frames"].as_i64())
        .bind(updates["status"].as_str().unwrap_or("idle"))
        .bind(updates["last_error"].as_str())
        .bind(Utc::now().to_rfc3339())
        .bind(pipe_id)
        .execute(&self.pool)
        .await
        .map_err(|e| e.to_string())?;
        
        Ok(())
    }

    pub async fn delete_pipe(&self, pipe_id: &str) -> Result<(), String> {
        sqlx::query("DELETE FROM pipe_prompt_nodes WHERE pipe_id = ?")
            .bind(pipe_id)
            .execute(&self.pool)
            .await
            .map_err(|e| e.to_string())?;
        
        sqlx::query("DELETE FROM pipe_keyframes WHERE pipe_id = ?")
            .bind(pipe_id)
            .execute(&self.pool)
            .await
            .map_err(|e| e.to_string())?;
        
        sqlx::query("DELETE FROM pipes WHERE id = ?")
            .bind(pipe_id)
            .execute(&self.pool)
            .await
            .map_err(|e| e.to_string())?;
        
        Ok(())
    }

    pub async fn list_pipes(&self, composer_id: &str) -> Result<Vec<PipeRow>, String> {
        use sqlx::Row;
        
        let rows = sqlx::query(
            "SELECT id, session_id, composer_id, name, order_index,
                    num_inference_steps, cfg_scale, target_frames, task_id,
                    status, last_error, created_at, updated_at
             FROM pipes WHERE composer_id = ? ORDER BY order_index ASC",
        )
        .bind(composer_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| e.to_string())?;

        let mut result = Vec::new();
        for row in &rows {
            let pipe = self.pipe_row_from_db(row).await?;
            result.push(pipe);
        }
        Ok(result)
    }

    async fn pipe_row_from_db(&self, row: &sqlx::sqlite::SqliteRow) -> Result<PipeRow, String> {
        use sqlx::Row;
        
        let id = row.get::<String, _>("id");
        let session_id = row.get::<String, _>("session_id");
        let composer_id = row.get::<String, _>("composer_id");
        let name = row.get::<String, _>("name");
        let order_index: i64 = row.get("order_index");
        let num_inference_steps: i64 = row.get("num_inference_steps");
        let cfg_scale: f64 = row.get("cfg_scale");
        let target_frames: Option<i64> = row.get("target_frames");
        let task_id: Option<String> = row.get("task_id");
        let status = row.get::<String, _>("status");
        let last_error: Option<String> = row.get("last_error");
        let created_at: Option<String> = row.get("created_at");
        let updated_at: Option<String> = row.get("updated_at");
        
        let mut pipe = PipeRow {
            id,
            session_id,
            composer_id,
            name,
            order_index: order_index as usize,
            num_inference_steps: num_inference_steps as u32,
            cfg_scale: cfg_scale as f32,
            target_frames: target_frames.map(|v| v as u32),
            task_id,
            status: pipe_status_from_db(&status),
            last_error,
            keyframes: Vec::new(),
            prompt_nodes: Vec::new(),
            created_at: created_at.and_then(|s| chrono::DateTime::parse_from_rfc3339(&s).ok().map(|dt| dt.with_timezone(&Utc))),
            updated_at: updated_at.and_then(|s| chrono::DateTime::parse_from_rfc3339(&s).ok().map(|dt| dt.with_timezone(&Utc))),
        };
        
        pipe.keyframes = self.list_keyframes(&pipe.id).await.unwrap_or_default();
        pipe.prompt_nodes = self.list_prompt_nodes(&pipe.id).await.unwrap_or_default();
        
        Ok(pipe)
    }

    // ── Keyframes ────────────────────────────────────────────────────────────

    pub async fn add_keyframe(
        &self,
        pipe_id: &str,
        slot_index: u8,
        source_type: &str,
        source_value: &str,
        description: Option<&str>,
    ) -> Result<KeyframeSlot, String> {
        let kf_id = uuid::Uuid::new_v4().to_string();
        
        sqlx::query(
            "INSERT OR REPLACE INTO pipe_keyframes
             (id, pipe_id, slot_index, source_type, source_value, description, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&kf_id)
        .bind(pipe_id)
        .bind(slot_index as i32)
        .bind(source_type)
        .bind(source_value)
        .bind(description)
        .bind(Utc::now().to_rfc3339())
        .execute(&self.pool)
        .await
        .map_err(|e| e.to_string())?;
        
        Ok(KeyframeSlot::new(pipe_id, slot_index))
    }

    pub async fn remove_keyframe(&self, pipe_id: &str, slot_index: u8) -> Result<(), String> {
        sqlx::query(
            "UPDATE pipe_keyframes SET source_type='none', source_value='', description=NULL, created_at=?
             WHERE pipe_id=? AND slot_index=?",
        )
        .bind(Utc::now().to_rfc3339())
        .bind(pipe_id)
        .bind(slot_index as i32)
        .execute(&self.pool)
        .await
        .map_err(|e| e.to_string())?;
        
        Ok(())
    }

    pub async fn list_keyframes(&self, pipe_id: &str) -> Result<Vec<KeyframeSlot>, String> {
        use sqlx::Row;
        
        let rows = sqlx::query(
            "SELECT id, pipe_id, slot_index, source_type, source_value,
                    description, width, height, ratio, created_at
             FROM pipe_keyframes WHERE pipe_id = ? ORDER BY slot_index ASC",
        )
        .bind(pipe_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| e.to_string())?;
        
        Ok(rows.iter().map(|row| {
            use sqlx::Row;
            KeyframeSlot {
                id: row.get("id"),
                pipe_id: row.get("pipe_id"),
                slot_index: row.get::<i64, _>("slot_index") as u8,
                source_type: row.get("source_type"),
                source_value: row.get("source_value"),
                description: row.get("description"),
                width: row.get::<Option<i64>, _>("width").map(|v| v as u32),
                height: row.get::<Option<i64>, _>("height").map(|v| v as u32),
                ratio: row.get("ratio"),
                created_at: row.get::<Option<String>, _>("created_at").and_then(|s| chrono::DateTime::parse_from_rfc3339(&s).ok().map(|dt| dt.with_timezone(&Utc))),
            }
        }).collect())
    }

    // ── Prompt Nodes ─────────────────────────────────────────────────────────

    pub async fn add_prompt_node(
        &self,
        pipe_id: &str,
        parent_id: Option<&str>,
        tag_label: &str,
        value: &str,
        frame_start: Option<u32>,
        frame_end: Option<u32>,
    ) -> Result<String, String> {
        let node_id = uuid::Uuid::new_v4().to_string();
        
        sqlx::query(
            "INSERT INTO pipe_prompt_nodes
             (id, pipe_id, parent_id, tag, value, frame_start, frame_end, enabled, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
        )
        .bind(&node_id)
        .bind(pipe_id)
        .bind(parent_id)
        .bind(tag_label)
        .bind(value)
        .bind(frame_start.map(|v| v as i64))
        .bind(frame_end.map(|v| v as i64))
        .bind(Utc::now().to_rfc3339())
        .bind(Utc::now().to_rfc3339())
        .execute(&self.pool)
        .await
        .map_err(|e| e.to_string())?;
        
        Ok(node_id)
    }

    pub async fn update_prompt_node(
        &self,
        node_id: &str,
        value: Option<&str>,
        frame_start: Option<u32>,
        frame_end: Option<u32>,
    ) -> Result<(), String> {
        sqlx::query(
            "UPDATE pipe_prompt_nodes SET value=COALESCE(?,value), frame_start=COALESCE(?,frame_start),
             frame_end=COALESCE(?,frame_end), updated_at=? WHERE id=?",
        )
        .bind(value)
        .bind(frame_start.map(|v| v as i64))
        .bind(frame_end.map(|v| v as i64))
        .bind(Utc::now().to_rfc3339())
        .bind(node_id)
        .execute(&self.pool)
        .await
        .map_err(|e| e.to_string())?;
        
        Ok(())
    }

    pub async fn toggle_prompt_node(&self, node_id: &str, enabled: bool) -> Result<(), String> {
        sqlx::query("UPDATE pipe_prompt_nodes SET enabled=?, updated_at=? WHERE id=?")
            .bind(enabled as i32)
            .bind(Utc::now().to_rfc3339())
            .bind(node_id)
            .execute(&self.pool)
            .await
            .map_err(|e| e.to_string())?;
        
        Ok(())
    }

    pub async fn remove_prompt_node(&self, node_id: &str) -> Result<(), String> {
        // Remove children first
        sqlx::query("DELETE FROM pipe_prompt_nodes WHERE parent_id = ?")
            .bind(node_id)
            .execute(&self.pool)
            .await
            .map_err(|e| e.to_string())?;
        
        sqlx::query("DELETE FROM pipe_prompt_nodes WHERE id = ?")
            .bind(node_id)
            .execute(&self.pool)
            .await
            .map_err(|e| e.to_string())?;
        
        Ok(())
    }

    pub async fn list_prompt_nodes(&self, pipe_id: &str) -> Result<Vec<PromptNode>, String> {
        use sqlx::Row;
        
        let rows = sqlx::query(
            "SELECT id, pipe_id, parent_id, tag, value, frame_start, frame_end, enabled, created_at, updated_at
             FROM pipe_prompt_nodes WHERE pipe_id = ? ORDER BY created_at ASC",
        )
        .bind(pipe_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| e.to_string())?;
        
        Ok(rows.iter().map(|row| {
            use sqlx::Row;
            let tag_str = row.get::<String, _>("tag");
            let tag = match tag_str.as_str() {
                "segment" => PromptTag::Segment,
                "movement" => PromptTag::Movement,
                "rotation" => PromptTag::Rotation,
                "focal_point" => PromptTag::FocalPoint,
                "lighting" => PromptTag::Lighting,
                "exposure" => PromptTag::Exposure,
                "lens_effect" => PromptTag::LensEffect,
                "global_style" => PromptTag::GlobalStyle,
                _ => PromptTag::Segment,
            };
            
            PromptNode {
                id: row.get("id"),
                pipe_id: row.get("pipe_id"),
                parent_id: row.get("parent_id"),
                tag,
                value: row.get("value"),
                frame_start: row.get::<Option<i64>, _>("frame_start").map(|v| v as u32),
                frame_end: row.get::<Option<i64>, _>("frame_end").map(|v| v as u32),
                enabled: row.get::<i64, _>("enabled") != 0,
                created_at: row.get::<Option<String>, _>("created_at").and_then(|s| chrono::DateTime::parse_from_rfc3339(&s).ok().map(|dt| dt.with_timezone(&Utc))),
                updated_at: row.get::<Option<String>, _>("updated_at").and_then(|s| chrono::DateTime::parse_from_rfc3339(&s).ok().map(|dt| dt.with_timezone(&Utc))),
            }
        }).collect())
    }

    // ── Session Settings ─────────────────────────────────────────────────────

    pub async fn get_or_create_session_settings(
        &self,
        session_id: &str,
    ) -> Result<SessionSettings, String> {
        use sqlx::Row;
        
        let row = sqlx::query(
            "SELECT id, session_id, resolution, aspect_ratio, total_frames, fps, created_at, updated_at
             FROM session_settings WHERE session_id = ?",
        )
        .bind(session_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| e.to_string())?;

        match row {
            Some(row) => Ok(Self::session_settings_from_db(&row)),
            None => {
                let settings = SessionSettings::new(session_id);
                self.save_session_settings(&settings).await?;
                Ok(settings)
            }
        }
    }

    pub async fn save_session_settings(&self, settings: &SessionSettings) -> Result<(), String> {
        sqlx::query(
            "INSERT INTO session_settings
             (id, session_id, resolution, aspect_ratio, total_frames, fps, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(session_id) DO UPDATE SET
                resolution = excluded.resolution, aspect_ratio = excluded.aspect_ratio,
                total_frames = excluded.total_frames, fps = excluded.fps,
                updated_at = excluded.updated_at",
        )
        .bind(&settings.id)
        .bind(&settings.session_id)
        .bind(format!("{:?}", settings.resolution))
        .bind(format!("{:?}", settings.aspect_ratio))
        .bind(settings.total_frames as i64)
        .bind(settings.fps)
        .bind(settings.created_at.as_ref().map(|dt| dt.to_rfc3339()))
        .bind(Utc::now().to_rfc3339())
        .execute(&self.pool)
        .await
        .map_err(|e| e.to_string())?;
        
        Ok(())
    }

    fn session_settings_from_db(row: &sqlx::sqlite::SqliteRow) -> SessionSettings {
        use sqlx::Row;
        
        let resolution = match row.get::<String, _>("resolution").as_str() {
            "P480" => Resolution::P480,
            "P1080" => Resolution::P1080,
            _ => Resolution::P720,
        };
        let aspect_ratio = match row.get::<String, _>("aspect_ratio").as_str() {
            "R9x16" => AspectRatio::R9x16,
            "R1x1" => AspectRatio::R1x1,
            _ => AspectRatio::R16x9,
        };
        
        SessionSettings {
            id: row.get("id"),
            session_id: row.get("session_id"),
            resolution,
            aspect_ratio,
            total_frames: row.get::<i64, _>("total_frames") as u32,
            fps: row.get("fps"),
            created_at: row.get::<Option<String>, _>("created_at").and_then(|s| chrono::DateTime::parse_from_rfc3339(&s).ok().map(|dt| dt.with_timezone(&Utc))),
            updated_at: row.get::<Option<String>, _>("updated_at").and_then(|s| chrono::DateTime::parse_from_rfc3339(&s).ok().map(|dt| dt.with_timezone(&Utc))),
        }
    }
}
