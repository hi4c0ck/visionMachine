use log::{LevelFilter, Record};
use std::fs::OpenOptions;
use std::io::Write;
use std::sync::Mutex;
use once_cell::sync::Lazy;

static LOG_FILE: Lazy<Mutex<Option<std::fs::File>>> = Lazy::new(|| {
    Mutex::new(None)
});

pub struct FileLogger;

impl FileLogger {
    pub fn new() -> Self {
        FileLogger
    }
    
    fn ensure_file() -> Option<std::fs::File> {
        let mut file = LOG_FILE.lock().unwrap();
        if file.is_none() {
            let mut path = dirs::cache_dir()
                .unwrap_or_else(|| std::env::current_exe().unwrap().parent().unwrap().to_path_buf());
            path.push("VisionMachine");
            path.push("logs");
            std::fs::create_dir_all(&path).ok();
            path.push(format!("visionmachine_{}.log", chrono::Local::now().format("%Y%m%d")));
            
            *file = OpenOptions::new()
                .create(true)
                .append(true)
                .open(path)
                .ok();
        }
        file.clone()
    }
    
    fn log_to_file(level: log::Level, msg: &str) {
        if let Some(mut file) = Self::ensure_file() {
            let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
            let line = format!("[{}] [{}] {}\n", timestamp, level, msg);
            let _ = file.write_all(line.as_bytes());
            let _ = file.flush();
        }
    }
}

impl log::Log for FileLogger {
    fn enabled(&self, _metadata: &log::Metadata) -> bool {
        true
    }

    fn log(&self, record: &Record) {
        Self::log_to_file(record.level(), &format!("{}", record.args()));
    }

    fn flush(&self) {}
}

/// Initialize logging with custom panic handler (file-only, no stdout)
pub fn init() {
    // Set custom panic hook that writes to file
    std::panic::set_hook(Box::new(|info| {
        FileLogger::log_to_file(log::Level::Error, "PANIC occurred");
        if let Some(loc) = info.location() {
            FileLogger::log_to_file(log::Level::Error, &format!("at {}:{}", loc.file(), loc.line()));
        }
        if let Some(s) = info.payload().downcast_ref::<&str>() {
            FileLogger::log_to_file(log::Level::Error, s);
        } else if let Some(s) = info.payload().downcast_ref::<String>() {
            FileLogger::log_to_file(log::Level::Error, s);
        }
    }));
    
    // Initialize logging system
    if log::set_boxed_logger(Box::new(FileLogger::new())).is_ok() {
        log::set_max_level(LevelFilter::Info);
    }
}

#[macro_export]
macro_rules! log_error {
    ($expr:expr) => {
        match $expr {
            Ok(v) => v,
            Err(e) => {
                error!("{}: {}", line!(), e);
                return Err(e.to_string());
            }
        }
    };
}

#[macro_export]
macro_rules! log_info {
    ($($arg:tt)*) => {
        info!($($arg)*);
    };
}
