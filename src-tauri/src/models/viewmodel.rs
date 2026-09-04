use super::tool::ToolDefinition;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{watch, Mutex};

/// Base ViewModel class implementing MVI (Model-View-Intent) pattern
#[derive(Clone)]
pub struct ViewModel {
    pub state: Arc<Mutex<ViewState>>,
    pub loading: Arc<watch::Sender<bool>>,
    pub error: Arc<Mutex<Option<String>>>,
    pub opacity: Arc<watch::Sender<f32>>,
    pub visible: Arc<watch::Sender<bool>>,
    pub container_size: Arc<Mutex<ContainerSize>>,
}

#[derive(Debug, Clone, Default)]
pub struct ViewState {
    pub data: HashMap<String, serde_json::Value>,
    pub intents: Vec<Intent>,
}

#[derive(Debug, Clone)]
pub enum Intent {
    LoadData,
    UpdateData(String),
    DeleteData(String),
    SwitchState(StateTransition),
    Refresh,
    Custom(String),
}

#[derive(Debug, Clone)]
pub enum StateTransition {
    Loading,
    Loaded,
    Error(String),
    Hidden,
    Shown,
    Idle,
}

#[derive(Debug, Clone, Default)]
pub struct ContainerSize {
    pub width: f64,
    pub height: f64,
    pub resizable: bool,
}

impl ViewModel {
    pub fn new() -> Self {
        let (loading_tx, _) = watch::channel(false);
        let (opacity_tx, _) = watch::channel(1.0);
        let (visible_tx, _) = watch::channel(true);

        Self {
            state: Arc::new(Mutex::new(ViewState::default())),
            loading: Arc::new(loading_tx),
            error: Arc::new(Mutex::new(None)),
            opacity: Arc::new(opacity_tx),
            visible: Arc::new(visible_tx),
            container_size: Arc::new(Mutex::new(ContainerSize::default())),
        }
    }

    pub async fn set_loading(&self, loading: bool) {
        let _ = self.loading.send(loading);
    }

    pub async fn set_opacity(&self, opacity: f32) {
        let _ = self.opacity.send(opacity);
    }

    pub async fn set_visible(&self, visible: bool) {
        let _ = self.visible.send(visible);
    }

    pub async fn hide(&self) {
        self.set_visible(false).await;
        self.set_opacity(0.0).await;
    }

    pub async fn show(&self) {
        self.set_visible(true).await;
        self.set_opacity(1.0).await;
    }

    pub async fn set_container_size(&self, width: f64, height: f64) {
        let mut size = self.container_size.lock().await;
        size.width = width;
        size.height = height;
    }

    pub async fn set_error(&self, error: Option<&str>) {
        let mut err = self.error.lock().await;
        *err = error.map(|e| e.to_string());
    }

    pub async fn clear_error(&self) {
        self.set_error(None).await;
    }

    pub async fn update_data(&self, key: &str, value: serde_json::Value) {
        let mut state = self.state.lock().await;
        state.data.insert(key.to_string(), value);
    }

    pub async fn get_data<T: serde::de::DeserializeOwned>(&self, key: &str) -> Option<T> {
        let state = self.state.lock().await;
        state
            .data
            .get(key)
            .and_then(|v| serde_json::from_value(v.clone()).ok())
    }
}

/// Frame ViewModel with GPU rendering context
#[derive(Clone)]
pub struct FrameViewModel {
    pub base: ViewModel,
    pub current_frame_index: Arc<watch::Sender<usize>>,
    pub video_playing: Arc<watch::Sender<bool>>,
    pub resolution: Arc<Mutex<(u32, u32)>>,
    pub video_duration: Arc<watch::Sender<f64>>,
}

impl FrameViewModel {
    pub fn new() -> Self {
        let (frame_tx, _) = watch::channel(0);
        let (video_tx, _) = watch::channel(false);
        let (duration_tx, _) = watch::channel(0.0);

        Self {
            base: ViewModel::new(),
            current_frame_index: Arc::new(frame_tx),
            video_playing: Arc::new(video_tx),
            resolution: Arc::new(Mutex::new((0, 0))),
            video_duration: Arc::new(duration_tx),
        }
    }

    pub async fn set_current_frame(&self, index: usize) {
        let _ = self.current_frame_index.send(index);
    }

    pub async fn set_video_playing(&self, playing: bool) {
        let _ = self.video_playing.send(playing);
    }

    pub async fn set_resolution(&self, width: u32, height: u32) {
        let mut res = self.resolution.lock().await;
        *res = (width, height);
    }

    pub async fn set_video_duration(&self, duration: f64) {
        let _ = self.video_duration.send(duration);
    }
}

/// Project ViewModel
#[derive(Clone)]
pub struct ProjectViewModel {
    pub base: ViewModel,
    pub selected_project_id: Arc<watch::Sender<Option<String>>>,
    pub selected_session_id: Arc<watch::Sender<Option<String>>>,
    pub expanded_projects: Arc<Mutex<Vec<String>>>,
}

impl ProjectViewModel {
    pub fn new() -> Self {
        let (project_tx, _) = watch::channel(None);
        let (session_tx, _) = watch::channel(None);

        Self {
            base: ViewModel::new(),
            selected_project_id: Arc::new(project_tx),
            selected_session_id: Arc::new(session_tx),
            expanded_projects: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub async fn select_project(&self, id: Option<&str>) {
        let _ = self.selected_project_id.send(id.map(|s| s.to_string()));
    }

    pub async fn select_session(&self, id: Option<&str>) {
        let _ = self.selected_session_id.send(id.map(|s| s.to_string()));
    }

    pub async fn toggle_expand(&self, project_id: &str) {
        let mut expanded = self.expanded_projects.lock().await;
        if expanded.contains(&project_id.to_string()) {
            expanded.retain(|x| x != project_id);
        } else {
            expanded.push(project_id.to_string());
        }
    }
}

/// Profile ViewModel
#[derive(Clone)]
pub struct ProfileViewModel {
    pub base: ViewModel,
    pub selected_profile_id: Arc<watch::Sender<Option<String>>>,
    pub profiles: Arc<Mutex<Vec<serde_json::Value>>>,
}

impl ProfileViewModel {
    pub fn new() -> Self {
        let (profile_tx, _) = watch::channel(None);

        Self {
            base: ViewModel::new(),
            selected_profile_id: Arc::new(profile_tx),
            profiles: Arc::new(Mutex::new(Vec::new())),
        }
    }

    pub async fn select_profile(&self, id: Option<&str>) {
        let _ = self.selected_profile_id.send(id.map(|s| s.to_string()));
    }

    pub async fn set_profiles(&self, profiles: Vec<serde_json::Value>) {
        let mut profile_list = self.profiles.lock().await;
        *profile_list = profiles;
    }
}

/// Composer ViewModel with dual-instance support
#[derive(Clone)]
pub struct ComposerViewModel {
    pub base: ViewModel,
    pub primary_instance: Option<Arc<ComposerInstance>>,
    pub secondary_instance: Option<Arc<ComposerInstance>>,
    pub active_instance: Arc<watch::Sender<usize>>,
}

#[derive(Clone)]
pub struct ComposerInstance {
    pub session_id: String,
    pub composer_data: Arc<Mutex<serde_json::Value>>,
    pub pipes: Arc<Mutex<Vec<PipeState>>>,
    pub generation_queue: Arc<Mutex<Vec<GenerationTask>>>,
}

#[derive(Debug, Clone)]
pub struct PipeState {
    pub id: String,
    pub name: String,
    pub order: usize,
    pub prompt_rows: Vec<PromptRow>,
    pub status: PipeStatus,
}

#[derive(Debug, Clone)]
pub enum PipeStatus {
    Idle,
    Generating,
    Generated,
    Error(String),
}

#[derive(Debug, Clone)]
pub struct PromptRow {
    pub id: String,
    pub tag: String,
    pub value: String,
    pub parent_id: Option<String>,
    pub children: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct GenerationTask {
    pub task_id: String,
    pub pipe_id: String,
    pub prompt_rows: Vec<PromptRow>,
    pub status: TaskStatus,
    pub progress: f32,
}

#[derive(Debug, Clone)]
pub enum TaskStatus {
    Queued,
    Running,
    Completed,
    Failed(String),
}

impl ComposerViewModel {
    pub fn new() -> Self {
        let (active_tx, _) = watch::channel(0);

        Self {
            base: ViewModel::new(),
            primary_instance: None,
            secondary_instance: None,
            active_instance: Arc::new(active_tx),
        }
    }

    pub async fn set_active_instance(&self, index: usize) {
        let _ = self.active_instance.send(index);
    }

    pub async fn switch_instances(&self) {
        let current = self.active_instance.borrow().clone();
        let next = if current == 0 { 1 } else { 0 };
        let _ = self.active_instance.send(next);
    }

    pub fn get_active_instance(&self) -> Option<Arc<ComposerInstance>> {
        let active = self.active_instance.borrow().clone();
        match active {
            0 => self.primary_instance.clone(),
            1 => self.secondary_instance.clone(),
            _ => None,
        }
    }
}

/// Tools ViewModel
#[derive(Clone)]
pub struct ToolsViewModel {
    pub base: ViewModel,
    pub available_tools: Arc<Mutex<Vec<ToolDefinition>>>,
    pub active_tool: Arc<watch::Sender<Option<String>>>,
}

impl ToolsViewModel {
    pub fn new() -> Self {
        let (tool_tx, _) = watch::channel(None);

        Self {
            base: ViewModel::new(),
            available_tools: Arc::new(Mutex::new(Vec::new())),
            active_tool: Arc::new(tool_tx),
        }
    }

    pub async fn set_active_tool(&self, tool_id: Option<&str>) {
        let _ = self.active_tool.send(tool_id.map(|s| s.to_string()));
    }

    pub async fn register_tool(&self, tool: ToolDefinition) {
        let mut tools = self.available_tools.lock().await;
        tools.push(tool);
    }
}
