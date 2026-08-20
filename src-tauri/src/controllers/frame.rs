use crate::models::FrameViewModel;

/// Frame section controller - manages the 2-layer view with GPU rendering
pub struct FrameController {
    pub vm: FrameViewModel,
    pub overlay_visible: bool,
}

impl FrameController {
    pub fn new() -> Self {
        Self {
            vm: FrameViewModel::new(),
            overlay_visible: true,
        }
    }

    /// Toggle overlay control panel visibility
    pub async fn toggle_overlay(&mut self) {
        self.overlay_visible = !self.overlay_visible;
        if self.overlay_visible {
            self.vm.show().await;
        } else {
            self.vm.hide().await;
        }
    }

    /// Set resolution info
    pub async fn set_resolution(&mut self, width: u32, height: u32) {
        self.vm.set_resolution(width, height).await;
    }

    /// Play video if attached to session
    pub async fn set_video_playing(&mut self, playing: bool) {
        self.vm.set_video_playing(playing).await;
    }

    /// Navigate to a specific frame
    pub async fn set_current_frame(&mut self, index: usize) {
        self.vm.set_current_frame(index).await;
    }

    /// Set video duration info
    pub async fn set_video_duration(&mut self, duration: f64) {
        self.vm.set_video_duration(duration).await;
    }

    /// Resize control panel
    pub async fn resize_panel(&mut self, width: f64, height: f64) {
        self.vm.set_container_size(width, height).await;
    }
}
