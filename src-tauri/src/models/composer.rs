use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use chrono::{DateTime, Utc};

/// Base parameter configuration from OpenAI config
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BaseConfig {
    pub model: String,
    pub temperature: f32,
    pub max_tokens: Option<i32>,
    pub top_p: f32,
    pub frequency_penalty: f32,
    pub presence_penalty: f32,
}

impl Default for BaseConfig {
    fn default() -> Self {
        Self {
            model: "stable-video-diffusion".to_string(),
            temperature: 0.5,
            max_tokens: Some(1024),
            top_p: 1.0,
            frequency_penalty: 0.0,
            presence_penalty: 0.0,
        }
    }
}

/// Keyframe image source (up to 3 keyframes)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyframeImage {
    pub index: usize, // 1, 2, or 3
    pub file_path: String,
    pub description: Option<String>,
}

/// PromptRow with XML-like tag structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptRow {
    pub id: String,
    pub tag: String, // e.g., "<subject>", "<style>", "<camera>"
    pub value: String,
    pub parent_id: Option<String>,
    pub children: Vec<String>,
    pub weight: f32, // importance weight
}

/// Pipe - a named segment in the composition chain
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pipe {
    pub id: String,
    pub name: String,
    pub order: usize,
    pub config: BaseConfig,
    pub keyframes: Vec<KeyframeImage>,
    pub prompt_rows: Vec<PromptRow>,
    pub task_id: Option<String>, // taskId for chain method
    pub status: PipeStatus,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum PipeStatus {
    Idle,
    Generating,
    Generated,
    Failed(String),
}

/// Composer - top-level container for all pipes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Composer {
    pub id: String,
    pub session_id: String,
    pub name: String,
    pub description: Option<String>,
    pub pipes: Vec<Pipe>,
    pub state: ComposerState,
    pub version: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ComposerState {
    Empty,
    Loading,
    Ready,
    Generating,
    Paused,
    Completed,
}

impl Composer {
    pub fn new(session_id: &str, name: &str) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            session_id: session_id.to_string(),
            name: name.to_string(),
            description: None,
            pipes: Vec::new(),
            state: ComposerState::Empty,
            version: 1,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    pub fn add_pipe(&mut self, pipe: Pipe) {
        self.pipes.push(pipe);
        self.updated_at = Utc::now();
        self.version += 1;
    }

    pub fn remove_pipe(&mut self, pipe_id: &str) -> Option<Pipe> {
        if let Some(pos) = self.pipes.iter().position(|p| p.id == pipe_id) {
            self.updated_at = Utc::now();
            self.version += 1;
            Some(self.pipes.remove(pos))
        } else {
            None
        }
    }

    pub fn get_pipe(&self, pipe_id: &str) -> Option<&Pipe> {
        self.pipes.iter().find(|p| p.id == pipe_id)
    }

    pub fn update_state(&mut self, state: ComposerState) {
        self.state = state;
        self.updated_at = Utc::now();
    }
}

/// PromptTree - hierarchical representation of prompt rows
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptTree {
    pub root: Option<String>,
    pub nodes: HashMap<String, PromptRow>,
}

impl PromptTree {
    pub fn new() -> Self {
        Self {
            root: None,
            nodes: HashMap::new(),
        }
    }

    pub fn add_node(&mut self, row: PromptRow) {
        self.nodes.insert(row.id.clone(), row);
        if self.root.is_none() {
            self.root = Some("root".to_string());
        }
    }

    pub fn get_node(&self, id: &str) -> Option<&PromptRow> {
        self.nodes.get(id)
    }

    pub fn get_children(&self, parent_id: &str) -> Vec<&PromptRow> {
        self.nodes
            .values()
            .filter(|n| n.parent_id.as_deref() == Some(parent_id))
            .collect()
    }

    /// Generate flat prompt string from tree
    pub fn to_prompt_string(&self) -> String {
        let mut result = String::new();
        
        if let Some(root_id) = &self.root {
            self.append_prompt_recursive(root_id, &mut result);
        }
        
        result.trim().to_string()
    }

    fn append_prompt_recursive(&self, node_id: &str, output: &mut String) {
        if let Some(node) = self.nodes.get(node_id) {
            // Add weight prefix if needed
            if node.weight != 1.0 {
                output.push_str(&format!("({}:{:.1}) ", node.tag, node.weight));
            }
            
            output.push_str(&format!("<{}>{}</{}>", node.tag, node.value, node.tag));
            
            // Process children
            for child_id in &node.children {
                self.append_prompt_recursive(child_id, output);
            }
        }
    }
}

// YAML serialization helpers
pub mod yaml {
    use super::*;
    use std::fs;

    pub fn save_composer(composer: &Composer, path: &str) -> Result<(), String> {
        let yaml = serde_yaml::to_string(composer)
            .map_err(|e| e.to_string())?;
        fs::write(path, yaml)
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn load_composer(path: &str) -> Result<Composer, String> {
        let content = fs::read_to_string(path)
            .map_err(|e| e.to_string())?;
        let composer: Composer = serde_yaml::from_str(&content)
            .map_err(|e| e.to_string())?;
        Ok(composer)
    }
}

// JSON serialization helpers (faster for async writes)
pub mod json {
    use super::*;
    use std::fs;

    pub fn save_composer(composer: &Composer, path: &str) -> Result<(), String> {
        let json = serde_json::to_string_pretty(composer)
            .map_err(|e| e.to_string())?;
        fs::write(path, json)
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn load_composer(path: &str) -> Result<Composer, String> {
        let content = fs::read_to_string(path)
            .map_err(|e| e.to_string())?;
        let composer: Composer = serde_json::from_str(&content)
            .map_err(|e| e.to_string())?;
        Ok(composer)
    }
}
