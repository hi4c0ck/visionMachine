use crate::models::ProjectViewModel;

/// Projects section controller - manages project/session list navigation
pub struct ProjectsController {
    pub vm: ProjectViewModel,
}

impl ProjectsController {
    pub fn new() -> Self {
        Self {
            vm: ProjectViewModel::new(),
        }
    }

    /// Select a project by ID
    pub async fn select_project(&mut self, id: Option<&str>) {
        self.vm.select_project(id).await;
    }

    /// Select a session within a project
    pub async fn select_session(&mut self, id: Option<&str>) {
        self.vm.select_session(id).await;
    }

    /// Toggle expand/collapse for a project in the tree view
    pub async fn toggle_expand(&mut self, project_id: &str) {
        self.vm.toggle_expand(project_id).await;
    }

    /// Lock input during loading/progress state
    pub async fn lock_input(&mut self, locked: bool) {
        if locked {
            self.vm.hide().await;
        } else {
            self.vm.show().await;
        }
    }
}
