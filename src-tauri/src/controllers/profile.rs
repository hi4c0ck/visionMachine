use crate::models::ProfileViewModel;

/// Profile section controller - manages user profile display and selection
pub struct ProfileController {
    pub vm: ProfileViewModel,
}

impl ProfileController {
    pub fn new() -> Self {
        Self {
            vm: ProfileViewModel::new(),
        }
    }

    /// Select a profile by ID
    pub async fn select_profile(&mut self, id: Option<&str>) {
        self.vm.select_profile(id).await;
    }

    /// Update the list of available profiles
    pub async fn set_profiles(&mut self, profiles: Vec<serde_json::Value>) {
        self.vm.set_profiles(profiles).await;
    }

    /// Show/hide the profile overlay
    pub async fn show_overlay(&mut self, show: bool) {
        if show {
            self.vm.show().await;
        } else {
            self.vm.hide().await;
        }
    }
}
