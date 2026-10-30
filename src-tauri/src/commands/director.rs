// Director's-harness backend commands (tabbed composer — Director / Extract /
// Scoreboard tabs).
//
// Scope guard (design doc §8 / user directive): this module wires the
// READ + RUN + SIGNAL surfaces only. The destructive regenerate-pipes action
// is deliberately NOT implemented here — it belongs to the materialize
// adapter (steps/materialize.rs, I9 composer boundary) and is shipped in a
// later phase. The UI renders that control disabled with a "not wired yet"
// note instead of calling a command that always errors.
//
// All flow artifacts live under the session media root (the same resolution
// precedence as generation.rs): <root>/<session-name>/flow/
//   flow.v{N}.json        — versioned FlowDocument (coexist, never overwrite)
//   flow_signals.jsonl    — append-only SignalRecord log (I7)

use crate::AppState;
use crate::generation::video_flow::{
    append_signal_jsonl, FlowDocument, SignalKind, SignalRecord, VideoFlow,
};
use serde::Serialize;
use std::path::PathBuf;
use tauri::State;

/// Resolve `<session media root>/<safe-session-name>/flow`, creating it.
/// Precedence mirrors `resolve_media_root` in generation.rs exactly
/// (session dir → project dir → user catalog default), so flow artifacts
/// sit next to the session's other media.
async fn flow_dir(
    db: &crate::storage::db::Database,
    session_id: &str,
) -> Result<PathBuf, String> {
    use sqlx::Row;

    // 1. session's own directory (0009).
    let session_dir: Option<String> = sqlx::query("SELECT directory_path FROM sessions WHERE id = ?")
        .bind(session_id)
        .fetch_optional(&db.pool)
        .await
        .map_err(|e| e.to_string())?
        .and_then(|r| r.try_get::<Option<String>, _>(0).ok())
        .flatten();

    // Also fetch the session name (for the session folder layer).
    let session_name: String = match sqlx::query("SELECT name FROM sessions WHERE id = ?")
        .bind(session_id)
        .fetch_optional(&db.pool)
        .await
        .map_err(|e| e.to_string())?
    {
        Some(r) => r
            .try_get::<String, _>(0)
            .ok()
            .unwrap_or_else(|| "session".into()),
        None => return Err("session not found".to_string()),
    };

    let root: String = if let Some(dir) = session_dir {
        let trimmed = dir.trim().to_string();
        if !trimmed.is_empty() {
            trimmed
        } else {
            project_dir(db, session_id).await
        }
    } else {
        project_dir(db, session_id).await
    };

    // Sanitize the session-name layer the same way the rest of the media
    // tree does (generation.rs::sanitize_dir_name semantics).
    let safe_name = crate::commands::generation::safe_session_name(&session_name);
    let dir = PathBuf::from(root).join(safe_name).join("flow");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Project-level fallback for the flow dir (generation.rs step 2).
async fn project_dir(
    db: &crate::storage::db::Database,
    session_id: &str,
) -> String {
    use sqlx::Row;
    let row: Option<String> = sqlx::query(
        "SELECT p.directory_path FROM sessions s \
               JOIN projects p ON p.id = s.project_id WHERE s.id = ?",
    )
    .bind(session_id)
    .fetch_optional(&db.pool)
    .await
    .ok()
    .flatten()
    .and_then(|r| r.try_get::<Option<String>, _>(0).ok())
    .flatten();
    if let Some(dir) = row {
        let trimmed = dir.trim().to_string();
        if !trimmed.is_empty() {
            return trimmed;
        }
    }
    // Step 3 (generation.rs): user catalog default. The flow dir needs a
    // concrete path even for never-generated sessions, so fall back to the
    // app-data media tree the frontend already uses for that case.
    dirs::home_dir()
        .map(|home| home.join("VisionMachine").join("default").join("Projects").to_string_lossy().into_owned())
        .unwrap_or_else(|| ".".into())
}

/// Parse an optional engine S0 entry from JSON. `None`/empty → `None`.
/// A malformed entry is a named error (the UI's G0 form is well-formed, so
/// this is a wire guard, not a silent fallback).
fn parse_entry(entry: &Option<String>) -> Result<Option<crate::generation::video_flow::engine::seed::EngineEntry>, String> {
    match entry {
        None => Ok(None),
        Some(s) if s.trim().is_empty() => Ok(None),
        Some(s) => serde_json::from_str(s)
            .map(Some)
            .map_err(|e| format!("engine entry: {e}")),
    }
}

/// The session's Node A LLM provider (harness `llm.json`: production reads
/// the active profile's `providers.text` slot). `None` when the chain is
/// broken (legacy session) or the profile has no saved settings, or the
/// text slot has no base_url+model — then the run stays on the
/// deterministic template (no unconfigured network call, ever).
async fn node_a_provider_for_session(
    db: &crate::storage::db::Database,
    session_id: &str,
) -> Option<crate::generation::video_flow::engine::llm::TextProvider> {
    use sqlx::Row;
    // sessions → projects → profiles (generation.rs::profile_name_for_session
    // precedent; settings blobs are keyed by profile name, "default" seed).
    let profile_name: Option<String> = sqlx::query(
        "SELECT pr.name FROM sessions s \
              JOIN projects p ON p.id = s.project_id \
              JOIN profiles pr ON pr.id = p.profile_id \
              WHERE s.id = ?",
    )
    .bind(session_id)
    .fetch_optional(&db.pool)
    .await
    .ok()
    .flatten()
    .and_then(|r| r.try_get::<Option<String>, _>(0).ok())
    .flatten();
    let profile_name = profile_name.unwrap_or_else(|| "default".into());

    let raw = db.get_profile_settings(&profile_name).await.ok().flatten()?;
    let value: serde_json::Value = serde_json::from_str(&raw).unwrap_or(serde_json::Value::Null);
    let settings = crate::commands::settings::normalize_settings(&value);
    let slot = settings.providers.text;
    let base_url = slot.base_url.trim().to_string();
    let model = slot.model.trim().to_string();
    if base_url.is_empty() || model.is_empty() {
        return None;
    }
    Some(
        crate::generation::video_flow::engine::llm::TextProvider {
            base_url,
            api_key: slot.api_key,
            model,
        },
    )
}

/// The newest flow version on disk (0 when no flow has been saved yet).
fn next_flow_version(flow: &PathBuf) -> u32 {
    let mut best: u32 = 0;
    if let Ok(entries) = std::fs::read_dir(flow) {
        for entry in entries.flatten() {
            if let Some(stem) = entry.file_name().to_str() {
                if let Some(v) = stem.strip_prefix("flow.v").and_then(|s| s.strip_suffix(".json")) {
                    if let Ok(v) = v.parse::<u32>() {
                        best = best.max(v);
                    }
                }
            }
        }
    }
    best
}

// ── Commands ────────────────────────────────────────────────────────────────

/// Run the full deterministic flow on `text` and persist the document as
/// `flow.v{N}.json` (coexisting versions, never overwrite). Returns the
/// saved document + its version.
///
/// `entry` is the optional S0 engine entry (Director G0 controls: genre,
/// ratio, scale, time_of_day, weather). When supplied it drives the engine
/// seed; when absent a default seed is derived from `text`.
#[tauri::command]
pub async fn director_run_flow(
    session_id: String,
    text: String,
    entry: Option<String>,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    // Path resolution only needs the DB; keep the lock window small (the
    // flow run below will make LLM network calls in later phases and must
    // not hold the DB lock across them).
    let dir = {
        let db = &state.db.lock().await;
        flow_dir(db, &session_id).await?
    };

    let entry = parse_entry(&entry)?;
    let flow = VideoFlow::new();
    let mut doc = flow
        .run_full_with_entry(&text, entry.as_ref())
        .map_err(|e| e.to_string())?;

    // Node A LLM expansion (Phase 1a, harness llm.json contract). When the
    // session has a usable text provider, the LLM writes the S1 novel and
    // the run is rebuilt around it (S2–S5 stay deterministic from that
    // novel). Any failure keeps the deterministic template run already in
    // `doc.engine` and names WHY the LLM didn't produce — never a silent
    // fallback. A missing/unconfigured provider simply stays on template
    // (nothing was attempted, so no note).
    {
        use crate::generation::video_flow::engine::llm::{self, TextProvider};
        use crate::generation::video_flow::engine::seed::{ExpansionSource, EngineRun};

        // The effective G0 entry: the UI's when supplied, else the same
        // deterministic default the template path used — so the LLM and
        // the fallback seed/counts/look-axes are identical.
        let effective_entry = match entry {
            Some(e) => e,
            None => crate::generation::video_flow::default_engine_entry(&text, &doc.intent),
        };

        // Provider resolution is a short DB window; the LLM network call
        // itself must NOT hold that lock (the flow_dir comment above).
        let provider: Option<TextProvider> = {
            let db = state.db.lock().await;
            node_a_provider_for_session(&db, &session_id).await
        };

        if let Some(provider) = provider {
            match llm::expand_node_a(&provider, &effective_entry).await {
                Ok(novel) => {
                    let tod = effective_entry.time_of_day.clone();
                    let weather = effective_entry.weather.clone();
                    let seed = effective_entry.to_seed();
                    doc.engine = Some(EngineRun::build_with_novel(
                        seed,
                        novel,
                        &tod,
                        &weather,
                        ExpansionSource::Llm,
                        Some(provider.model.clone()),
                    ));
                }
                Err(reason) => {
                    if let Some(run) = doc.engine.as_mut() {
                        run.expansion = ExpansionSource::Template;
                        run.expansion_note = Some(format!(
                            "template · LLM ({}) failed: {}",
                            provider.model, reason
                        ));
                    }
                }
            }
        }
    }

    let version = next_flow_version(&dir).saturating_add(1);
    let path = dir.join(FlowDocument::default_filename(version));
    doc.save(&path).map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "document": serde_json::to_value(&doc).map_err(|e| e.to_string())?,
        "flowVersion": version,
    }))
}

/// One summary row for the Scoreboard run list.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlowSummary {
    pub flow_version: u32,
    pub overall: f64,
    pub critic_model_version: u32,
    pub section_count: usize,
    pub entry_text: String,
    /// S5 verify state for this run (false when no engine was produced).
    pub verified: bool,
}

/// Every persisted `flow.v{N}.json` under the session, newest first.
#[tauri::command]
pub async fn director_list_flows(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<FlowSummary>, String> {
    let dir = {
        let db = &state.db.lock().await;
        flow_dir(db, &session_id).await?
    };

    let mut out: Vec<FlowSummary> = Vec::new();
    for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        let Some((_, v_str)) = name.strip_prefix("flow.v").zip(name.strip_suffix(".json")) else {
            continue;
        };
        let Ok(version) = v_str.parse::<u32>() else { continue };
        let Ok(doc) = FlowDocument::load(&entry.path()) else { continue };
        out.push(FlowSummary {
            flow_version: version,
            overall: doc.scoretree.overall(),
            critic_model_version: doc.regen.version.critic_model_version,
            section_count: doc.structured.primary().sections.len(),
            entry_text: doc.intent.entry_text.clone(),
            verified: doc.engine.as_ref().map(|e| e.verify.verified).unwrap_or(false),
        });
    }
    out.sort_by(|a, b| b.flow_version.cmp(&a.flow_version));
    Ok(out)
}

/// Load one persisted flow document (Extract / Scoreboard drill-in).
#[tauri::command]
pub async fn director_load_flow(
    session_id: String,
    flow_version: u32,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let dir = {
        let db = &state.db.lock().await;
        flow_dir(db, &session_id).await?
    };
    let path = dir.join(FlowDocument::default_filename(flow_version));
    let doc = FlowDocument::load(&path).map_err(|e| e.to_string())?;
    Ok(serde_json::to_value(&doc).map_err(|e| e.to_string())?)
}

/// Append one preference signal (I7, append-only). `kind` must be one of
/// the four `SignalKind` wire names: edit_diff, accept, reject, rate.
#[tauri::command]
pub async fn director_log_signal(
    session_id: String,
    kind: String,
    target_span: String,
    note: Option<String>,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let kind = match kind.as_str() {
        "edit_diff" => SignalKind::EditDiff,
        "accept" => SignalKind::Accept,
        "reject" => SignalKind::Reject,
        "rate" => SignalKind::Rate,
        other => {
            return Err(format!(
                "unknown signal kind '{other}' (expected edit_diff|accept|reject|rate)"
            ))
        }
    };

    let dir = {
        let db = &state.db.lock().await;
        flow_dir(db, &session_id).await?
    };

    // Newest doc version the signal attaches to (0 when none exists yet —
    // signals may legitimately precede the first saved run).
    let flow_version = next_flow_version(&dir);
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let record = SignalRecord {
        record_id: uuid::Uuid::new_v4().to_string(),
        kind,
        flow_version,
        target_span: target_span.clone(),
        note,
        ts,
    };

    let path = dir.join("flow_signals.jsonl");
    append_signal_jsonl(&path, &record).map_err(|e| e.to_string())?;
    Ok(record.record_id)
}
