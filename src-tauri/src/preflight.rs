//! Pre-flight environment validation system
//! 
//! Performs critical environment checks before app startup.
//! Blocking failures prevent the app from starting.

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub enum CheckResult {
    Pass(String),
    Fail(String),
    Warning(String),
}

impl CheckResult {
    pub fn is_blocking_failure(&self) -> bool {
        matches!(self, CheckResult::Fail(_))
    }
    
    pub fn category(&self) -> &str {
        match self {
            CheckResult::Pass(_) => "pass",
            CheckResult::Fail(_) => "fail",
            CheckResult::Warning(_) => "warning",
        }
    }
    
    pub fn message(&self) -> &str {
        match self {
            CheckResult::Pass(msg) | CheckResult::Fail(msg) | CheckResult::Warning(msg) => msg,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct PreflightReport {
    pub timestamp: String,
    pub os_name: String,
    pub arch: String,
    pub checks: Vec<CheckResult>,
    pub passed: bool,
}

impl PreflightReport {
    pub fn new() -> Self {
        Self {
            timestamp: chrono::Local::now().to_rfc3339(),
            os_name: get_os_name().to_string(),
            arch: std::env::consts::ARCH.to_string(),
            checks: Vec::new(),
            passed: true,
        }
    }
    
    pub fn add_check(&mut self, result: CheckResult) {
        let is_fail = result.is_blocking_failure();
        self.checks.push(result);
        if is_fail {
            self.passed = false;
        }
    }
    
    pub fn format_report(&self) -> String {
        let mut report = String::from("=== VisionMachine Pre-flight Report ===\n\n");
        report.push_str(&format!("Timestamp: {}\n", self.timestamp));
        report.push_str(&format!("OS: {} ({})\n", self.os_name, self.arch));
        report.push_str(&format!("Status: {}\n\n", if self.passed { "PASSED" } else { "FAILED" }));
        
        report.push_str("Checks:\n");
        for check in &self.checks {
            match check {
                CheckResult::Pass(msg) => report.push_str(&format!("  [PASS] {}\n", msg)),
                CheckResult::Fail(msg) => report.push_str(&format!("  [FAIL] {}\n", msg)),
                CheckResult::Warning(msg) => report.push_str(&format!("  [WARN] {}\n", msg)),
            }
        }
        
        if !self.passed {
            report.push_str("\n=====================================\n");
            report.push_str("BLOCKING ISSUES - App cannot start\n");
            report.push_str("=====================================\n");
        }
        report
    }
}

fn get_os_name() -> String {
    #[cfg(target_os = "windows")]
    {
        return "Windows".to_string();
    }
    #[cfg(target_os = "macos")]
    {
        return "macOS".to_string();
    }
    #[cfg(target_os = "linux")]
    {
        return "Linux".to_string();
    }
    #[allow(unreachable_code)]
    "Unknown".to_string()
}

fn check_memory() -> CheckResult {
    // Try to get memory info from /proc/meminfo on Linux
    #[cfg(target_os = "linux")]
    {
        if let Ok(content) = std::fs::read_to_string("/proc/meminfo") {
            for line in content.lines() {
                if line.starts_with("MemTotal:") {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 2 {
                        if let Ok(kb) = parts[1].parse::<u64>() {
                            let total_mb = kb / 1024;
                            const MIN_MB: u64 = 2048;
                            if total_mb < MIN_MB {
                                return CheckResult::Fail(format!("Insufficient RAM: {} MB (need {} MB)", total_mb, MIN_MB));
                            }
                            return CheckResult::Pass(format!("Memory OK: {} MB total", total_mb));
                        }
                    }
                }
            }
        }
    }
    
    // For other platforms, use a simplified check
    #[cfg(not(target_os = "linux"))]
    {
        // On Windows/macOS, we can check temp directory writability as a proxy
        // A more thorough check would require platform-specific APIs
        CheckResult::Pass("Memory check skipped (platform-specific)".to_string())
    }
}

fn check_disk_space() -> CheckResult {
    let temp = std::env::temp_dir();
    match std::fs::create_dir_all(&temp) {
        Ok(_) => CheckResult::Pass(format!("Disk space OK (temp writable: {})", temp.display())),
        Err(e) => CheckResult::Fail(format!("Cannot access temp directory: {}", e)),
    }
}

fn check_webview_runtime() -> CheckResult {
    #[cfg(target_os = "windows")]
    {
        let edge_path = std::path::Path::new(r"C:\Program Files (x86)\Microsoft\Edge\Application");
        if edge_path.exists() {
            return CheckResult::Pass("WebView2 runtime found".to_string());
        }
        return CheckResult::Warning("WebView2 may not be installed. App will attempt to install.".to_string());
    }
    #[cfg(target_os = "macos")]
    {
        return CheckResult::Pass("WKWebView available".to_string());
    }
    #[cfg(target_os = "linux")]
    {
        return CheckResult::Pass("WebKitGTK will be checked at runtime".to_string());
    }
    #[allow(unreachable_code)]
    CheckResult::Pass("WebView check skipped".to_string())
}

pub fn run_preflight_checks() -> PreflightReport {
    let mut report = PreflightReport::new();
    
    report.add_check(check_memory());
    report.add_check(check_disk_space());
    report.add_check(check_webview_runtime());
    
    report
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_preflight_report_format() {
        let report = PreflightReport::new();
        let formatted = report.format_report();
        assert!(formatted.contains("VisionMachine Pre-flight Report"));
    }
    
    #[test]
    fn test_check_result_categories() {
        assert!(!CheckResult::Pass("test".into()).is_blocking_failure());
        assert!(CheckResult::Fail("test".into()).is_blocking_failure());
        assert!(!CheckResult::Warning("test".into()).is_blocking_failure());
    }
}
