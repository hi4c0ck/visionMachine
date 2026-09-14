//! Tiny cache-folder archiver: preserves (or removes) an account's generated
//! data when the account is deleted.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Cache root in user space: `<home>/.visionmachine/cache`.
pub fn cache_root() -> Result<PathBuf, String> {
    let home =
        dirs::home_dir().ok_or_else(|| "could not resolve the user home directory".to_string())?;
    let root = home.join(".visionmachine").join("cache");
    std::fs::create_dir_all(&root).map_err(|e| format!("failed to create cache dir: {e}"))?;
    Ok(root)
}

/// Copy the account's files + write a `data.json` snapshot into
/// `<cache_root>/<name>_<timestamp>/`. Returns the created folder.
pub fn archive_to_cache(
    name: &str,
    paths: &[String],
    data_dump: &serde_json::Value,
) -> Result<PathBuf, String> {
    let folder = cache_root()?.join(format!(
        "{}_{}",
        sanitize_name(name),
        chrono::Utc::now().format("%Y%m%d_%H%M%S")
    ));
    copy_files(&folder, paths)?;
    let json = serde_json::to_string_pretty(data_dump).map_err(|e| e.to_string())?;
    std::fs::write(folder.join("data.json"), json)
        .map_err(|e| format!("failed to write data.json: {e}"))?;
    Ok(folder)
}

/// Best-effort copy of every existing file into `<folder>/files/`.
fn copy_files(folder: &Path, paths: &[String]) -> Result<(), String> {
    let files_dir = folder.join("files");
    std::fs::create_dir_all(&files_dir).map_err(|e| format!("failed to create files dir: {e}"))?;

    let mut used: HashMap<String, u32> = HashMap::new();
    for path in paths {
        let src = Path::new(path);
        if !src.is_file() {
            continue; // stale reference — nothing to save.
        }
        let file_name = src
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("file")
            .to_string();
        let count = used.entry(file_name.clone()).or_insert(0);
        *count += 1;
        let dest_name = if *count == 1 {
            file_name.clone()
        } else {
            let stem = src
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or(&file_name);
            let ext = src.extension().and_then(|e| e.to_str()).unwrap_or_default();
            if ext.is_empty() {
                format!("{stem}_{count}")
            } else {
                format!("{stem}_{count}.{ext}")
            }
        };
        let _ = std::fs::copy(src, files_dir.join(dest_name)); // best effort
    }
    Ok(())
}

/// Best-effort removal of on-disk files ("delete all data" mode).
pub fn remove_files(paths: &[String]) {
    for path in paths {
        let _ = std::fs::remove_file(path);
    }
}

/// Account name → filesystem-safe folder component.
pub fn sanitize_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();
    if cleaned.is_empty() {
        "account".to_string()
    } else {
        cleaned
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitizes_names() {
        assert_eq!(sanitize_name("Alice Smith"), "Alice_Smith");
        assert_eq!(sanitize_name(""), "account");
        assert_eq!(sanitize_name("a-b_c"), "a-b_c");
    }
}
