/// Production Error Handling & Validation Module
/// Validates all inputs, handles errors gracefully, ensures data integrity

use std::path::PathBuf;
use uuid::Uuid;
use chrono::Utc;

#[derive(Debug)]
pub enum AppError {
    Database(String),
    ValidationError(String),
    PathSecurity(String),
    NotFound(String),
    Conflict(String),
    Internal(String),
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AppError::Database(e) => write!(f, "Database error: {}", e),
            AppError::ValidationError(e) => write!(f, "Validation error: {}", e),
            AppError::PathSecurity(e) => write!(f, "Path security error: {}", e),
            AppError::NotFound(e) => write!(f, "Not found: {}", e),
            AppError::Conflict(e) => write!(f, "Conflict: {}", e),
            AppError::Internal(e) => write!(f, "Internal error: {}", e),
        }
    }
}

impl From<sqlx::Error> for AppError {
    fn from(err: sqlx::Error) -> Self {
        match err {
            sqlx::Error::Database(db_err) => {
                AppError::Database(db_err.message().to_string())
            }
            sqlx::Error::PoolTimedOut => AppError::Database("Connection pool timeout".to_string()),
            _ => AppError::Database(err.to_string()),
        }
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::Internal(err.to_string())
    }
}

/// Validate profile name (alphanumeric, spaces, hyphens only)
pub fn validate_profile_name(name: &str) -> Result<(), AppError> {
    if name.len() < 1 || name.len() > 100 {
        return Err(AppError::ValidationError("Profile name must be 1-100 characters".into()));
    }
    
    if !name.chars().all(|c| c.is_alphanumeric() || c == ' ' || c == '-' || c == '_') {
        return Err(AppError::ValidationError("Profile name contains invalid characters".into()));
    }
    
    Ok(())
}

/// Validate email format
pub fn validate_email(email: &str) -> Result<(), AppError> {
    if email.len() > 255 {
        return Err(AppError::ValidationError("Email too long".into()));
    }
    
    // Basic email validation
    let parts: Vec<&str> = email.split('@').collect();
    if parts.len() != 2 {
        return Err(AppError::ValidationError("Invalid email format".into()));
    }
    
    if parts[0].is_empty() || parts[1].is_empty() {
        return Err(AppError::ValidationError("Invalid email format".into()));
    }
    
    Ok(())
}

/// Validate project name
pub fn validate_project_name(name: &str) -> Result<(), AppError> {
    if name.is_empty() || name.len() > 200 {
        return Err(AppError::ValidationError("Project name must be 1-200 characters".into()));
    }
    Ok(())
}

/// Validate session name
pub fn validate_session_name(name: &str) -> Result<(), AppError> {
    if name.is_empty() || name.len() > 200 {
        return Err(AppError::ValidationError("Session name must be 1-200 characters".into()));
    }
    Ok(())
}

/// Validate storage path for security
pub fn validate_storage_path(path: &str) -> Result<PathBuf, AppError> {
    // Reject dangerous patterns
    if path.contains("..") {
        return Err(AppError::PathSecurity("Path contains directory traversal".into()));
    }
    
    if path.starts_with('/') && !path.starts_with("/tmp") && !path.starts_with("/home") {
        return Err(AppError::PathSecurity("Path not in user-writable directory".into()));
    }
    
    // Check if path is absolute or relative
    let p = PathBuf::from(path);
    
    // Try to canonicalize (resolve to absolute path)
    match p.canonicalize() {
        Ok(canonical) => Ok(canonical),
        Err(_) => {
            // If can't canonicalize, check if parent exists and path doesn't escape
            if !path.starts_with("/") && !path.contains("\\..") {
                Ok(p)
            } else {
                Err(AppError::PathSecurity("Invalid or unsafe path".into()))
            }
        }
    }
}

/// Ensure storage directory exists and is writable
pub async fn ensure_storage_dir(path: &str) -> Result<(), AppError> {
    let validated = validate_storage_path(path)?;
    
    std::fs::create_dir_all(&validated).map_err(|e| {
        AppError::PathSecurity(format!("Cannot create directory: {}", e))
    })?;
    
    // Test write permissions
    let test_file = validated.join(".write_test");
    std::fs::write(&test_file, "test").map_err(|e| {
        AppError::PathSecurity(format!("Directory not writable: {}", e))
    })?;
    
    std::fs::remove_file(test_file).ok();
    
    Ok(())
}

/// Generate safe filename from user input
pub fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect()
        .trim()
        .to_string()
}

/// UUID validation
pub fn validate_uuid(uuid: &str) -> Result<(), AppError> {
    Uuid::parse_str(uuid).map_err(|_| AppError::ValidationError("Invalid UUID format".into()))?;
    Ok(())
}

/// Timestamp validation
pub fn validate_timestamp(ts: &str) -> Result<(), AppError> {
    chrono::DateTime::parse_from_rfc3339(ts)
        .map(|_| ())
        .map_err(|_| AppError::ValidationError("Invalid timestamp format".into()))?;
    Ok(())
}

/// Check if path is within allowed base directories
pub fn is_path_safe(base: &str, path: &str) -> Result<(), AppError> {
    let base_path = PathBuf::from(base);
    let target_path = PathBuf::from(path);
    
    // Resolve both to canonical forms
    let base_canonical = base_path.canonicalize().unwrap_or(base_path.clone());
    let target_canonical = target_path.canonicalize().unwrap_or(target_path.clone());
    
    // Check if target starts with base
    if target_canonical.starts_with(&base_canonical) {
        Ok(())
    } else {
        Err(AppError::PathSecurity("Path escapes base directory".into()))
    }
}

/// Generate unique ID for entity
pub fn generate_id() -> String {
    Uuid::new_v4().to_string()
}

/// Get current timestamp
pub fn now_utc() -> String {
    Utc::now().to_rfc3339()
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_valid_profile_names() {
        assert!(validate_profile_name("John Doe").is_ok());
        assert!(validate_profile_name("Alice").is_ok());
        assert!(validate_profile_name("User-123").is_ok());
    }
    
    #[test]
    fn test_invalid_profile_names() {
        assert!(validate_profile_name("").is_err());
        assert!(validate_profile_name("John@Doe").is_err());
        assert!(validate_profile_name("A".repeat(101)).is_err());
    }
    
    #[test]
    fn test_valid_emails() {
        assert!(validate_email("user@example.com").is_ok());
        assert!(validate_email("test.user@domain.org").is_ok());
    }
    
    #[test]
    fn test_invalid_emails() {
        assert!(validate_email("invalid").is_err());
        assert!(validate_email("@example.com").is_err());
        assert!(validate_email("user@").is_err());
    }
    
    #[test]
    fn test_path_security() {
        assert!(validate_storage_path("../evil").is_err());
        assert!(validate_storage_path("/etc/passwd").is_err());
        assert!(validate_storage_path("./safe/path").is_ok());
    }
    
    #[test]
    fn test_sanitize_filename() {
        assert_eq!(sanitize_filename("Video Project!"), "Video_Project_");
        assert_eq!(sanitize_filename("Test@#$%"), "Test_____");
    }
    
    #[test]
    fn test_uuid_validation() {
        let valid_uuid = "550e8400-e29b-41d4-a716-446655440000";
        assert!(validate_uuid(valid_uuid).is_ok());
        
        let invalid_uuid = "not-a-uuid";
        assert!(validate_uuid(invalid_uuid).is_err());
    }
    
    #[test]
    fn test_generate_id() {
        let id1 = generate_id();
        let id2 = generate_id();
        assert_ne!(id1, id2);
        assert!(validate_uuid(&id1).is_ok());
    }
}
