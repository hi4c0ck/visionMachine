use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;
use std::path::PathBuf;
use std::time::Duration;

/// Async write mode for Composer data
/// Prevents UI lock on file operations by using a separate thread with channel-based updates
#[derive(Clone)]
pub struct AsyncWriter {
    tx: tokio::sync::mpsc::Sender<WriteTask>,
    path: PathBuf,
    format: WriteFormat,
}

#[derive(Debug, Clone, PartialEq)]
pub enum WriteFormat {
    Json,
    YAML,
}

pub enum WriteTask {
    Save {
        content: String,
        reply: tokio::sync::oneshot::Sender<Result<(), String>>,
    },
    AppendPipe {
        pipe_json: String,
        reply: tokio::sync::oneshot::Sender<Result<(), String>>,
    },
    UpdatePipe {
        pipe_id: String,
        new_content: String,
        reply: tokio::sync::oneshot::Sender<Result<(), String>>,
    },
}

impl AsyncWriter {
    pub fn new(path: &str, format: WriteFormat) -> (Self, tokio::task::JoinHandle<()>) {
        let (tx, rx) = tokio::sync::mpsc::channel(32);
        let handle = Self::spawn_writer(path.to_string(), format.clone(), rx);
        
        (
            Self {
                tx,
                path: PathBuf::from(path),
                format,
            },
            handle,
        )
    }

    async fn spawn_writer(
        path: String,
        format: WriteFormat,
        mut rx: mpsc::Receiver<WriteTask>,
    ) -> tokio::task::JoinHandle<()> {
        tokio::spawn(async move {
            while let Some(task) = rx.recv().await {
                match task {
                    WriteTask::Save { content, reply } => {
                        let result = Self::write_file(&path, &content, &format).await;
                        let _ = reply.send(result);
                    }
                    WriteTask::AppendPipe { pipe_json, reply } => {
                        let result = Self::append_to_composer(&path, &pipe_json, &format).await;
                        let _ = reply.send(result);
                    }
                    WriteTask::UpdatePipe { pipe_id, new_content, reply } => {
                        let result = Self::update_pipe_in_composer(&path, &pipe_id, &new_content, &format).await;
                        let _ = reply.send(result);
                    }
                }
            }
        })
    }

    async fn write_file(path: &str, content: &str, format: &WriteFormat) -> Result<(), String> {
        // Write to temp file first, then rename (atomic on most systems)
        let tmp_path = format!("{}.tmp", path);
        tokio::fs::write(&tmp_path, content).await.map_err(|e| e.to_string())?;
        tokio::fs::rename(&tmp_path, path).await.map_err(|e| e.to_string())?;
        Ok(())
    }

    async fn append_to_composer(path: &str, pipe_json: &str, format: &WriteFormat) -> Result<(), String> {
        let content = tokio::fs::read_to_string(path).await.unwrap_or_default();
        
        let mut composer: serde_json::Value = serde_json::from_str(&content)
            .map_err(|e| e.to_string())?;
        
        if let Some(pipes) = composer.get_mut("pipes").and_then(|p| p.as_array_mut()) {
            let pipe: serde_json::Value = serde_json::from_str(pipe_json)
                .map_err(|e| e.to_string())?;
            pipes.push(pipe);
        }
        
        let new_content = match format {
            WriteFormat::Json => serde_json::to_string_pretty(&composer)
                .map_err(|e| e.to_string())?,
            WriteFormat::YAML => serde_yaml::to_string(&composer)
                .map_err(|e| e.to_string())?,
        };
        
        Self::write_file(path, &new_content, format).await
    }

    async fn update_pipe_in_composer(
        path: &str,
        pipe_id: &str,
        new_content: &str,
        format: &WriteFormat,
    ) -> Result<(), String> {
        let content = tokio::fs::read_to_string(path).await.unwrap_or_default();
        
        let mut composer: serde_json::Value = serde_json::from_str(&content)
            .map_err(|e| e.to_string())?;
        
        if let Some(pipes) = composer.get_mut("pipes").and_then(|p| p.as_array_mut()) {
            if let Some(pipe) = pipes.iter_mut().find(|p| {
                p.get("id").and_then(|id| id.as_str()) == Some(pipe_id)
            }) {
                *pipe = serde_json::from_str(new_content)
                    .map_err(|e| e.to_string())?;
            }
        }
        
        let new_content = match format {
            WriteFormat::Json => serde_json::to_string_pretty(&composer)
                .map_err(|e| e.to_string())?,
            WriteFormat::YAML => serde_yaml::to_string(&composer)
                .map_err(|e| e.to_string())?,
        };
        
        Self::write_file(path, &new_content, format).await
    }

    /// Save entire composer
    pub async fn save(&self, content: &str) -> Result<(), String> {
        let (tx, rx) = tokio::sync::oneshot::channel();
        self.tx.send(WriteTask::Save {
            content: content.to_string(),
            reply: tx,
        }).await.map_err(|e| e.to_string())?;
        rx.await.map_err(|e| e.to_string())?
    }

    /// Add a pipe to composer
    pub async fn append_pipe(&self, pipe_json: &str) -> Result<(), String> {
        let (tx, rx) = tokio::sync::oneshot::channel();
        self.tx.send(WriteTask::AppendPipe {
            pipe_json: pipe_json.to_string(),
            reply: tx,
        }).await.map_err(|e| e.to_string())?;
        rx.await.map_err(|e| e.to_string())?
    }

    /// Update an existing pipe
    pub async fn update_pipe(&self, pipe_id: &str, new_content: &str) -> Result<(), String> {
        let (tx, rx) = tokio::sync::oneshot::channel();
        self.tx.send(WriteTask::UpdatePipe {
            pipe_id: pipe_id.to_string(),
            new_content: new_content.to_string(),
            reply: tx,
        }).await.map_err(|e| e.to_string())?;
        rx.await.map_err(|e| e.to_string())?
    }
}

// Debounced writer for rapid UI changes
#[derive(Clone)]
pub struct DebouncedWriter {
    writer: AsyncWriter,
    debounce_ms: u64,
    timer: Option<tokio::time::Interval>,
}

impl DebouncedWriter {
    pub fn new(writer: AsyncWriter, debounce_ms: u64) -> Self {
        Self {
            writer,
            debounce_ms,
            timer: None,
        }
    }

    pub async fn save(&mut self, content: &str) -> Result<(), String> {
        // Simple debounce: just call the writer directly for now
        // A more sophisticated version would use a timer
        self.writer.save(content).await
    }
}
