use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use chrono::Local;

pub struct FileLogger {
    log_file: Option<std::fs::File>,
}

impl FileLogger {
    pub fn new() -> Self {
        let mut logger = FileLogger { log_file: None };
        logger.init();
        logger
    }
    
    fn init(&mut self) {
        if let Ok(app_data) = std::env::var("LOCALAPPDATA") {
            let log_dir = PathBuf::from(app_data).join("com.visionmachine.desktop").join("logs");
            let log_file = log_dir.join(format!("visionmachine_{}.log", Local::now().format("%Y%m%d")));
            
            if let Some(parent) = log_file.parent() {
                if let Err(e) = std::fs::create_dir_all(parent) {
                    eprintln!("[Logger] Failed to create log dir: {}", e);
                }
            }
            
            if let Ok(file) = OpenOptions::new().create(true).append(true).open(&log_file) {
                self.log_file = Some(file);
                eprintln!("[Logger] Logging to: {:?}", log_file);
            } else {
                eprintln!("[Logger] Failed to open log file");
            }
        }
    }
    
    pub fn log(&mut self, level: &str, message: &str) {
        let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
        let line = format!("[{}] [{}] {}\n", timestamp, level, message);
        
        // Always print to stderr
        eprintln!("{}", line.trim());
        
        // Also write to file if available
        if let Some(ref mut file) = self.log_file {
            let _ = file.write_all(line.as_bytes());
            let _ = file.flush();
        }
    }
}
