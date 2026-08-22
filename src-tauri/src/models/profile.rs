use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub email: Option<String>,
    pub created_at: DateTime<Utc>,
    pub active: bool,
}
