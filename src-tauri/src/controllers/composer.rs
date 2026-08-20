use crate::models::{ComposerViewModel, ComposerInstance, PipeState, PromptRow};

/// Composer section controller - manages async composer operations
pub struct ComposerController {
    pub vm: ComposerViewModel,
}

impl ComposerController {
    pub fn new() -> Self {
        Self {
            vm: ComposerViewModel::new(),
        }
    }

    /// Initialize a new composer instance for a session
    pub fn init_instance(&mut self, instance_index: usize, session_id: &str) {
        let instance = ComposerInstance {
            session_id: session_id.to_string(),
            composer_data: std::sync::Arc::new(tokio::sync::Mutex::new(
                serde_json::json!({})
            )),
            pipes: std::sync::Arc::new(tokio::sync::Mutex::new(Vec::new())),
            generation_queue: std::sync::Arc::new(tokio::sync::Mutex::new(Vec::new())),
        };
        
        match instance_index {
            0 => self.vm.primary_instance = Some(std::sync::Arc::new(instance)),
            1 => self.vm.secondary_instance = Some(std::sync::Arc::new(instance)),
            _ => {}
        }
    }

    /// Switch between primary and secondary instances
    pub async fn switch_instances(&mut self) {
        self.vm.switch_instances().await;
    }

    /// Get the currently active instance
    pub fn get_active_instance(&self) -> Option<std::sync::Arc<crate::models::ComposerInstance>> {
        self.vm.get_active_instance()
    }

    /// Add a pipe to the active composer
    pub async fn add_pipe(&mut self, pipe: PipeState) {
        if let Some(instance) = self.vm.get_active_instance() {
            let mut pipes = instance.pipes.lock().await;
            pipes.push(pipe);
        }
    }

    /// Remove a pipe from the active composer
    pub async fn remove_pipe(&mut self, pipe_id: &str) {
        if let Some(instance) = self.vm.get_active_instance() {
            let mut pipes = instance.pipes.lock().await;
            pipes.retain(|p| p.id != pipe_id);
        }
    }

    /// Add a prompt row to a pipe
    pub async fn add_prompt_row(&mut self, pipe_id: &str, row: PromptRow) {
        if let Some(instance) = self.vm.get_active_instance() {
            let mut pipes = instance.pipes.lock().await;
            if let Some(pipe) = pipes.iter_mut().find(|p| p.id == pipe_id) {
                pipe.prompt_rows.push(row);
            }
        }
    }
}
