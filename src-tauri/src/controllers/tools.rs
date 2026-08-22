use crate::models::ToolsViewModel;

/// Tools section controller - reserved for future tool integration
pub struct ToolsController {
    pub vm: ToolsViewModel,
}

impl ToolsController {
    pub fn new() -> Self {
        Self {
            vm: ToolsViewModel::new(),
        }
    }

    /// Register a tool for use in the composer
    pub async fn register_tool(&mut self, tool_id: &str, name: &str, description: &str) {
        let tool = crate::models::ToolDefinition {
            id: tool_id.to_string(),
            name: name.to_string(),
            description: description.to_string(),
            icon: "tool".to_string(),
            enabled: true,
            config: None,
        };
        
        let mut tools = self.vm.available_tools.lock().await;
        tools.push(tool);
    }

    /// Activate a tool
    pub async fn activate_tool(&mut self, tool_id: &str) {
        self.vm.set_active_tool(Some(tool_id)).await;
    }

    /// Deactivate current tool
    pub async fn deactivate_tool(&mut self) {
        self.vm.set_active_tool(None).await;
    }
}
