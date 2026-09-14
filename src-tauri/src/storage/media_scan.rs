//! Tiny scanner: finds local media-file references inside JSON blobs
//! (keyframe images, generated frame paths, etc.) so account archival can
//! copy them to the cache folder before an account is deleted.

/// Recursively collect strings that look like local media files from a JSON
/// blob. Malformed JSON is ignored (treated as having no references).
pub fn collect_from_json(json: &str, out: &mut Vec<String>) {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(json) else {
        return;
    };
    walk(&value, out);
}

fn walk(value: &serde_json::Value, out: &mut Vec<String>) {
    match value {
        serde_json::Value::String(s) => {
            if is_media_ref(s) {
                out.push(s.clone());
            }
        }
        serde_json::Value::Array(items) => {
            for item in items {
                walk(item, out);
            }
        }
        serde_json::Value::Object(map) => {
            for value in map.values() {
                walk(value, out);
            }
        }
        _ => {}
    }
}

/// A string counts as a local media reference when it ends in a known media
/// extension and is not a remote or data URI.
pub fn is_media_ref(s: &str) -> bool {
    let trimmed = s.trim();
    if trimmed.is_empty() {
        return false;
    }
    let lower = trimmed.to_ascii_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") || lower.starts_with("data:") {
        return false;
    }
    const MEDIA_EXTS: &[&str] = &[
        ".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif", ".tif", ".tiff", ".mp4", ".mov", ".webm",
        ".mkv", ".avi", ".m4v",
    ];
    MEDIA_EXTS.iter().any(|ext| lower.ends_with(ext))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_media_in_nested_json() {
        let json = r#"{"keyframes":[{"image_path":"/data/a.png","prompt":"x"}],"pipes":[]}"#;
        let mut out = Vec::new();
        collect_from_json(json, &mut out);
        assert!(out.iter().any(|p| p.ends_with("a.png")));
    }

    #[test]
    fn ignores_urls_and_plain_strings() {
        let json = r#"{"a":"https://x.com/pic.png","b":"plain text","c":"/data/ref.png"}"#;
        let mut out = Vec::new();
        collect_from_json(json, &mut out);
        assert_eq!(out, vec!["/data/ref.png".to_string()]);
    }

    #[test]
    fn invalid_json_is_noop() {
        let mut out = Vec::new();
        collect_from_json("not json {", &mut out);
        assert!(out.is_empty());
    }
}
