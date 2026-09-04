use super::db::Database;
use crate::models::{ComposerConfig, Pipe, TagElement, TagType};
use chrono::Utc;

impl Database {
    // ── Composer CRUD (JSON blob storage) ────────────────────────────────────────

    pub async fn get_composer(&self, session_id: &str) -> Result<ComposerConfig, String> {
        use sqlx::Row;

        let row = sqlx::query(
            "SELECT id, session_id, name, config_json, created_at, updated_at FROM composers WHERE session_id = ?",
        )
        .bind(session_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| e.to_string())?;

        match row {
            Some(row) => {
                let config_json: String = row.get("config_json");
                let config: ComposerConfig = serde_json::from_str(&config_json)
                    .map_err(|e| format!("Failed to parse composer config: {}", e))?;
                Ok(config)
            }
            None => {
                // Read from sessions.pipes_json without creating a composer entry
                use sqlx::Row;
                match sqlx::query(
                    "SELECT name, pipes_json FROM sessions WHERE id = ?",
                )
                .bind(session_id)
                .fetch_optional(&self.pool)
                .await
                .map_err(|e| e.to_string())?
                {
                    Some(row) => {
                        let session_name: String = row.get("name");
                        let pipes_json: Option<String> = row.get("pipes_json");

                        let pipes = if let Some(pj) = pipes_json {
                            serde_json::from_str::<Vec<serde_json::Value>>(&pj)
                                .ok()
                                .unwrap_or_default()
                                .into_iter()
                                .map(|v| {
                                    serde_json::from_value::<Pipe>(v).unwrap_or(Pipe::new("unknown", 121))
                                })
                                .collect()
                        } else {
                            vec![Pipe::new("Pipe 1", 121)]
                        };

                        // Return composer WITHOUT saving - just read-only fallback
                        Ok(ComposerConfig {
                            id: session_id.to_string(),
                            session_id: session_id.to_string(),
                            name: session_name,
                            pipes,
                            created_at: None,
                            updated_at: None,
                        })
                    }
                    None => {
                        // No session found, return empty composer
                        Ok(ComposerConfig::new(session_id, "Untitled Composer"))
                    }
                }
            }
        }
    }

    pub async fn save_composer(&self, composer: &ComposerConfig) -> Result<(), String> {
        use sqlx::Row;

        // First check if exists
        let existing = sqlx::query("SELECT id FROM composers WHERE session_id = ?")
            .bind(&composer.session_id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| e.to_string())?;

        let config_json = serde_json::to_string(composer)
            .map_err(|e| format!("Failed to serialize composer: {}", e))?;
        let now = Utc::now();

        if let Some(row) = existing {
            let id: String = row.get(0);
            sqlx::query(
                "UPDATE composers SET config_json = ?, updated_at = ? WHERE id = ?",
            )
            .bind(&config_json)
            .bind(&now)
            .bind(&id)
            .execute(&self.pool)
            .await
            .map_err(|e| e.to_string())?;
        } else {
            let id = uuid::Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO composers (id, session_id, name, config_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            )
            .bind(&id)
            .bind(&composer.session_id)
            .bind(&composer.name)
            .bind(&config_json)
            .bind(&now)
            .bind(&now)
            .execute(&self.pool)
            .await
            .map_err(|e| e.to_string())?;
        }

        Ok(())
    }

    // ── Helper functions ─────────────────────────────────────────────────────────

    pub async fn get_pipe(&self, session_id: &str, pipe_id: &str) -> Result<Option<Pipe>, String> {
        let composer = self.get_composer(session_id).await?;
        Ok(composer.pipes.iter().find(|p| p.id == pipe_id).cloned())
    }

    pub async fn list_pipes(&self, session_id: &str) -> Result<Vec<Pipe>, String> {
        let composer = self.get_composer(session_id).await?;
        Ok(composer.pipes)
    }

    /// Find a composer that contains the given pipe_id by searching all sessions.
    /// Note: This is a simplified lookup. In production, pass session_id directly.
    pub async fn find_composer_by_pipe_id(&self, pipe_id: &str) -> Result<ComposerConfig, String> {
        // We need to search through all composers to find one containing this pipe
        // Since we don't have a list_all_composers method, we return an error
        // and let the caller handle it appropriately.
        // For now, we'll use an empty session_id which will create a new composer if not exists.
        // The actual lookup should be done by the frontend passing session_id.
        use sqlx::Row;

        let rows = sqlx::query("SELECT session_id FROM composers")
            .fetch_all(&self.pool)
            .await
            .map_err(|e| e.to_string())?;

        for row in rows {
            let session_id: String = row.get("session_id");
            if let Ok(composer) = self.get_composer(&session_id).await {
                if composer.pipes.iter().any(|p| p.id == pipe_id) {
                    return Ok(composer);
                }
            }
        }

        Err(format!("Pipe {} not found in any composer", pipe_id))
    }
}
