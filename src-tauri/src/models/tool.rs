#[derive(Debug, Clone)]
pub struct ToolDefinition {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub enabled: bool,
    pub config: Option<serde_json::Value>,
}
