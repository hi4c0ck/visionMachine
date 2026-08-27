// Convert frontend elements structure to backend prompt_nodes format
#[derive(serde::Deserialize, Clone)]
pub struct FrontendGlobalElement {
    pub id: String,
    pub tag: String,
    pub value: String,
    pub enabled: bool,
}

#[derive(serde::Deserialize, Clone)]
pub struct FrontendTagElement {
    pub id: String,
    pub tag: String,
    pub frameStart: u32,
    pub frameEnd: u32,
    pub value: f64,
    #[serde(default)]
    pub prompt: Option<String>,
}

#[derive(serde::Deserialize, Clone)]
pub struct FrontendSegment {
    pub id: String,
    pub frameStart: u32,
    pub frameEnd: u32,
    pub tags: Vec<FrontendTagElement>,
}

#[derive(serde::Deserialize, Clone)]
pub struct FrontendTimelineElement {
    pub id: String,
    pub segments: Vec<FrontendSegment>,
}

#[derive(serde::Deserialize, Clone)]
#[serde(untagged)]
pub enum FrontendPipeElement {
    Global(FrontendGlobalElement),
    Timeline(FrontendTimelineElement),
}

#[derive(serde::Deserialize, Clone)]
pub struct FrontendPipeRow {
    pub id: String,
    pub lengthFrames: u32,
    pub keyframes: Vec<serde_json::Value>,
    pub qValue: u32,
    pub cValue: f32,
    pub elements: Vec<FrontendPipeElement>,
}

#[derive(serde::Deserialize, Clone)]
pub struct FrontendComposerConfig {
    pub id: String,
    pub session_id: String,
    pub name: String,
    pub pipes: Vec<FrontendPipeRow>,
}

impl FrontendComposerConfig {
    /// Convert frontend elements format to backend prompt_nodes format
    pub fn to_backend(self) -> crate::models::ComposerConfig {
        let now = chrono::Utc::now();
        
        // Create base composer config
        let mut composer = crate::models::ComposerConfig {
            id: self.id,
            session_id: self.session_id.clone(),
            name: self.name,
            description: None,
            pipes: Vec::new(),
            session_settings: None,
            state: crate::models::ComposerState::Ready,
            version: 1,
            task_id: None,
            created_at: Some(now),
            updated_at: Some(now),
        };
        
        // Convert each pipe
        for frontend_pipe in self.pipes {
            let pipe_id = frontend_pipe.id.clone();
            
            // Convert elements to prompt_nodes
            let mut prompt_nodes: Vec<crate::models::PromptNode> = Vec::new();
            
            for element in frontend_pipe.elements {
                match element {
                    FrontendPipeElement::Global(global) => {
                        // Global style node
                        prompt_nodes.push(crate::models::PromptNode {
                            id: format!("global-{}", global.id),
                            pipe_id: pipe_id.clone(),
                            parent_id: None,
                            tag: crate::models::PromptTag::GlobalStyle,
                            value: global.value.clone(),
                            frame_start: None,
                            frame_end: None,
                            enabled: global.enabled,
                            created_at: Some(now),
                            updated_at: Some(now),
                        });
                    }
                    FrontendPipeElement::Timeline(timeline) => {
                        // Convert timeline segments to nodes
                        for segment in timeline.segments {
                            // Segment boundary marker
                            prompt_nodes.push(crate::models::PromptNode {
                                id: format!("seg-{}", segment.id),
                                pipe_id: pipe_id.clone(),
                                parent_id: None,
                                tag: crate::models::PromptTag::Segment,
                                value: format!("{},{}", segment.frameStart, segment.frameEnd),
                                frame_start: Some(segment.frameStart),
                                frame_end: Some(segment.frameEnd),
                                enabled: true,
                                created_at: Some(now),
                                updated_at: Some(now),
                            });
                            
                            // Convert tags within segment
                            for tag in segment.tags {
                                let prompt_tag = match tag.tag.as_str() {
                                    "scene" => crate::models::PromptTag::Segment,
                                    "camera" => crate::models::PromptTag::Movement,
                                    "rotation" => crate::models::PromptTag::Rotation,
                                    "lighting" => crate::models::PromptTag::Lighting,
                                    "effect" => crate::models::PromptTag::LensEffect,
                                    "zoom" => crate::models::PromptTag::Exposure,
                                    "transition" => crate::models::PromptTag::Segment,
                                    _ => crate::models::PromptTag::Segment,
                                };
                                
                                prompt_nodes.push(crate::models::PromptNode {
                                    id: tag.id,
                                    pipe_id: pipe_id.clone(),
                                    parent_id: Some(format!("seg-{}", segment.id)),
                                    tag: prompt_tag,
                                    value: if let Some(prompt) = tag.prompt {
                                        prompt
                                    } else {
                                        format!("{}", tag.value as u32)
                                    },
                                    frame_start: Some(tag.frameStart),
                                    frame_end: Some(tag.frameEnd),
                                    enabled: true,
                                    created_at: Some(now),
                                    updated_at: Some(now),
                                });
                            }
                        }
                    }
                }
            }
            
            // Create backend pipe row
            let pipe = crate::models::PipeRow {
                id: pipe_id,
                session_id: self.session_id.clone(),
                composer_id: composer.id.clone(),
                name: format!("Pipe {}", frontend_pipe.id.chars().take(8).collect::<String>()),
                order_index: 0,
                num_inference_steps: frontend_pipe.qValue,
                cfg_scale: frontend_pipe.cValue,
                target_frames: Some(frontend_pipe.lengthFrames),
                task_id: None,
                status: crate::models::PipeStatus::Idle,
                last_error: None,
                keyframes: Vec::new(),
                prompt_nodes,
                created_at: Some(now),
                updated_at: Some(now),
            };
            
            composer.pipes.push(pipe);
        }
        
        composer
    }
}
