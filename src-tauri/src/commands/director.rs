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

use crate::generation::video_flow::engine::types::Genre;
use crate::generation::video_flow::{
    append_signal_jsonl, materialize_pipes, validate_plan, FlowDocument, SignalKind, SignalRecord,
    StructuredVideoPlan, VideoFlow, VideoTag,
};
use crate::AppState;
use serde::{Deserialize, Serialize};
use log::{debug, info};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, State};

/// One run-progress event emitted by `director_run_flow` at each phase
/// boundary (UI subscribes via `listen("director_run_progress", …)` in
/// runProgress.ts). Exactly 6 events per run, in this order:
/// intent → structure → critic → lower → verify (5 phase names; structure
/// merges the expand+structure steps that happen inside `run_full_with_entry`).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunProgress {
    /// 'intent' | 'structure' | 'critic' | 'lower' | 'verify'
    pub phase: String,
    /// Human-readable detail, e.g. "3 scenes × 2 shots = 6 shots".
    pub detail: String,
    /// Wall-clock ms since the run started.
    pub ms: u64,
}

/// Resolve `<session media root>/<safe-session-name>/flow`, creating it.
/// Precedence mirrors `resolve_media_root` in generation.rs exactly
/// (session dir → project dir → user catalog default), so flow artifacts
/// sit next to the session's other media.
async fn flow_dir(db: &crate::storage::db::Database, session_id: &str) -> Result<PathBuf, String> {
    use sqlx::Row;

    // 1. session's own directory (0009).
    let session_dir: Option<String> =
        sqlx::query("SELECT directory_path FROM sessions WHERE id = ?")
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
async fn project_dir(db: &crate::storage::db::Database, session_id: &str) -> String {
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
        .map(|home| {
            home.join("VisionMachine")
                .join("default")
                .join("Projects")
                .to_string_lossy()
                .into_owned()
        })
        .unwrap_or_else(|| ".".into())
}

/// Parse an optional engine S0 entry from JSON. `None`/empty → `None`.
/// A malformed entry is a named error (the UI's G0 form is well-formed, so
/// this is a wire guard, not a silent fallback).
fn parse_entry(
    entry: &Option<String>,
) -> Result<Option<crate::generation::video_flow::engine::seed::EngineEntry>, String> {
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
    // sessions → projects → profiles. The profile_settings blobs are keyed
    // by profile **id** (storage/db.rs schema: profile_settings.profile_id
    // references profiles.id), so resolve pr.id — NOT pr.name. (A name-based
    // resolve returns None for every user-created profile whose id ≠ name,
    // which silently kept every LLM run on the template path.)
    let profile_id: Option<String> = sqlx::query(
        "SELECT pr.id FROM sessions s \
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
    let profile_id = profile_id.unwrap_or_else(|| "default".into());

    let raw = db.get_profile_settings(&profile_id).await.ok().flatten()?;
    let value: serde_json::Value = serde_json::from_str(&raw).unwrap_or(serde_json::Value::Null);
    let settings = crate::commands::settings::normalize_settings(&value);
    let slot = settings.providers.text;
    let base_url = slot.base_url.trim().to_string();
    let model = slot.model.trim().to_string();
    if base_url.is_empty() || model.is_empty() {
        return None;
    }
    Some(crate::generation::video_flow::engine::llm::TextProvider {
        base_url,
        api_key: slot.api_key,
        model,
    })
}

/// The newest flow version on disk (0 when no flow has been saved yet).
fn next_flow_version(flow: &PathBuf) -> u32 {
    let mut best: u32 = 0;
    if let Ok(entries) = std::fs::read_dir(flow) {
        for entry in entries.flatten() {
            if let Some(stem) = entry.file_name().to_str() {
                if let Some(v) = stem
                    .strip_prefix("flow.v")
                    .and_then(|s| s.strip_suffix(".json"))
                {
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
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let t0 = std::time::Instant::now();

    // Phase 1: intent — the raw entry text, truncated to 60 chars
    // (char-based so non-ASCII input can never split a UTF-8 codepoint).
    let intent_detail: String = {
        let t = text.trim();
        if t.chars().count() <= 60 {
            t.to_string()
        } else {
            format!("…{}", t.chars().take(60).collect::<String>())
        }
    };
    app.emit(
        "director_run_progress",
        RunProgress {
            phase: "intent".into(),
            detail: intent_detail,
            ms: t0.elapsed().as_millis() as u64,
        },
    )
    .ok();

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

    // Phase 2: expand — run_full_with_entry returned; report the engine
    // novel scene/shot counts.
    let structure_detail = match doc.engine.as_ref() {
        Some(run) => {
            let scenes = run.novel.scenes.len();
            let shots: usize = run.novel.scenes.iter().map(|s| s.shots.len()).sum();
            let per_scene = if scenes > 0 { shots / scenes } else { 0 };
            // Phase 2: surface the S0.5 structural tree (the "brain" layer) —
            // the driver + target runtime + per-branch roles — so the run log
            // shows the shape the film is told in, not just the raw counts.
            let tree_note = match run.tree.as_ref() {
                Some(t) => {
                    let roles: Vec<&str> = t.branches.iter().map(|b| b.role.as_str()).collect();
                    format!(
                        " · tree v{} · driver {} · ~{}s · [{}]",
                        t.v,
                        t.root.driver.as_str(),
                        t.root.target_duration_s,
                        roles.join("/")
                    )
                }
                None => String::new(),
            };
            format!(
                "{} scenes × {} shots = {} shots{tree_note}",
                scenes, per_scene, shots
            )
        }
        None => "template · no engine run".to_string(),
    };
    app.emit(
        "director_run_progress",
        RunProgress {
            phase: "expand".into(),
            detail: structure_detail.clone(),
            ms: t0.elapsed().as_millis() as u64,
        },
    )
    .ok();
    // Phase 3: structure — the structure step happens inside
    // run_full_with_entry, not separately; merged into one extra event
    // with the same detail as expand.
    app.emit(
        "director_run_progress",
        RunProgress {
            phase: "structure".into(),
            detail: structure_detail,
            ms: t0.elapsed().as_millis() as u64,
        },
    )
    .ok();

    // Node A LLM expansion (Phase 1a, harness llm.json contract). When the
    // session has a usable text provider, the LLM writes the S1 novel and
    // the run is rebuilt around it (S2–S5 stay deterministic from that
    // novel). Any failure keeps the deterministic template run already in
    // `doc.engine` and names WHY the LLM didn't produce — never a silent
    // fallback. A missing/unconfigured provider simply stays on template
    // (nothing was attempted, so no note).
    let critic_detail: String = {
        use crate::generation::video_flow::engine::llm::{self, TextProvider};
        use crate::generation::video_flow::engine::seed::{EngineRun, ExpansionSource};

        let effective_entry = match entry {
            Some(e) => e,
            None => crate::generation::video_flow::default_engine_entry(&text, &doc.intent),
        };

        let provider: Option<TextProvider> = {
            let db = state.db.lock().await;
            node_a_provider_for_session(&db, &session_id).await
        };

        match provider {
            Some(ref prov) => {
                let t_llm = std::time::Instant::now();
                // Phase 2: build the S0.5 structural tree BEFORE the LLM call
                // so its brief (the "brief, not a cage") is injected into the
                // Node A prompt — the model sees the fixed shape (driver,
                // energy curve, branch transitions, chained temp arc,
                // continuity thread, target runtime) and invents the prose /
                // environment / character / beats within it. The same tree is
                // then threaded into the S2/S3 production (Phase 1b) and
                // stored on the run (Phase 1a).
                let tree = crate::generation::video_flow::engine::tree::build_structural_tree(
                    &doc.intent,
                    &effective_entry,
                    &effective_entry.overrides,
                );
                // LLM window: Node A can take up to 2×60s (retry budget).
                // Emit a live progress line at the start so the run log
                // never looks frozen ("stuck" perception) while the model
                // writes the novel.
                app.emit(
                    "director_run_progress",
                    RunProgress {
                        phase: "expand".into(),
                        detail: format!("LLM · {} · writing the novel (up to 2 min)…", prov.model),
                        ms: t_llm.elapsed().as_millis() as u64,
                    },
                )
                .ok();
                match llm::expand_node_a(prov, &effective_entry, Some(&tree)).await {
                    Ok(novel) => {
                        let tod = effective_entry.time_of_day.clone();
                        let weather = effective_entry.weather.clone();
                        let seed = effective_entry.to_seed();
                        // Phase 1b: thread the tree into the S2/S3 production
                        // (scene color-temperature arc, branch-boundary
                        // transitions, leaf-resolved base camera/lens/motion).
                        // Mood stays None here by design — M4 mood shapes the
                        // Node A PROMPT, not this bridge's S2/S3 structure.
                        let mut llm_run = EngineRun::build_with_novel_mood(
                            seed,
                            novel,
                            &tod,
                            &weather,
                            ExpansionSource::Llm,
                            Some(prov.model.clone()),
                            None,
                            Some(&tree),
                        );
                        // The low-level builder leaves the run's tree field
                        // None; the caller stores it (Phase 1a).
                        llm_run.tree = Some(tree);
                        doc.engine = Some(llm_run);
                        format!("LLM · {} · {}ms", prov.model, t_llm.elapsed().as_millis())
                    }
                    Err(reason) => {
                        if let Some(run) = doc.engine.as_mut() {
                            run.expansion = ExpansionSource::Template;
                            run.expansion_note = Some(format!(
                                "template · LLM ({}) failed: {}",
                                prov.model, reason
                            ));
                        }
                        format!(
                            "LLM · {} failed · {}ms",
                            prov.model,
                            t_llm.elapsed().as_millis()
                        )
                    }
                }
            }
            None => "template · LLM skipped".to_string(),
        }
    };
    // Phase 4: critic — after the LLM Node A block.
    app.emit(
        "director_run_progress",
        RunProgress {
            phase: "critic".into(),
            detail: critic_detail,
            ms: t0.elapsed().as_millis() as u64,
        },
    )
    .ok();

    let version = next_flow_version(&dir).saturating_add(1);
    let path = dir.join(FlowDocument::default_filename(version));
    doc.save(&path).map_err(|e| e.to_string())?;

    // Phase 5: lower — total frames from the engine verify report.
    let total_frames: u32 = doc
        .engine
        .as_ref()
        .map(|e| e.verify.total_frames)
        .unwrap_or(0);
    app.emit(
        "director_run_progress",
        RunProgress {
            phase: "lower".into(),
            detail: format!("{} frames verified", total_frames),
            ms: t0.elapsed().as_millis() as u64,
        },
    )
    .ok();

    // Phase 6: verify — at the very end, after saving to disk.
    let verify_detail = match doc.engine.as_ref() {
        Some(run) => {
            if run.verify.verified {
                format!("saved as flow.v{}.json · verified", version)
            } else {
                format!(
                    "saved as flow.v{}.json · {} issue(s)",
                    version,
                    run.verify.issues.len()
                )
            }
        }
        None => format!("saved as flow.v{}.json · no engine run", version),
    };
    app.emit(
        "director_run_progress",
        RunProgress {
            phase: "verify".into(),
            detail: verify_detail,
            ms: t0.elapsed().as_millis() as u64,
        },
    )
    .ok();

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
    // Persisted (was eprintln → stderr, invisible in VisionMachine.log): a
    // session-select freeze shows up here as repeated `list_flows start/done`
    // for the SAME session id. Info-level so a loop is unmissable in the log.
    info!("[DIRECTOR] list_flows start: {}", session_id);
    let dir = {
        let db = &state.db.lock().await;
        flow_dir(db, &session_id).await?
    };

    let mut out: Vec<FlowSummary> = Vec::new();
    for entry in std::fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .flatten()
    {
        let name = entry.file_name().to_string_lossy().into_owned();
        let Some((_, v_str)) = name.strip_prefix("flow.v").zip(name.strip_suffix(".json")) else {
            continue;
        };
        let Ok(version) = v_str.parse::<u32>() else {
            continue;
        };
        let Ok(doc) = FlowDocument::load(&entry.path()) else {
            continue;
        };
        out.push(FlowSummary {
            flow_version: version,
            overall: doc.scoretree.overall(),
            critic_model_version: doc.regen.version.critic_model_version,
            section_count: doc.structured.primary().sections.len(),
            entry_text: doc.intent.entry_text.clone(),
            verified: doc
                .engine
                .as_ref()
                .map(|e| e.verify.verified)
                .unwrap_or(false),
        });
    }
    out.sort_by(|a, b| b.flow_version.cmp(&a.flow_version));
    info!("[DIRECTOR] list_flows done: {} flows", out.len());
    Ok(out)
}

/// Load one persisted flow document (Extract / Scoreboard drill-in).
#[tauri::command]
pub async fn director_load_flow(
    session_id: String,
    flow_version: u32,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    debug!(
        "[DIRECTOR] load_flow start: {} v{}",
        session_id, flow_version
    );
    let dir = {
        let db = &state.db.lock().await;
        flow_dir(db, &session_id).await?
    };
    let path = dir.join(FlowDocument::default_filename(flow_version));
    debug!("[DIRECTOR] load_flow reading: {}", path.display());
    let doc = FlowDocument::load(&path).map_err(|e| e.to_string())?;
    debug!("[DIRECTOR] load_flow loaded, serializing");
    let val = serde_json::to_value(&doc).map_err(|e| e.to_string())?;
    info!("[DIRECTOR] load_flow done: {} v{}", session_id, flow_version);
    Ok(val)
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

// ── Golden set (design §5.2 / §7.3, the "additive golden.json" data gap) ──
//
// The user-facing golden set is NOT the `engine/golden.rs` module (those are
// deterministic test fixtures pinning `harness/golden/*.json` against the
// Rust model — a different thing). This is the *quality baseline* the
// Scoreboard's Golden-set card shows: a run flagged as "golden" freezes its
// entry text + per-section scores, so a later critic version can be diffed
// against the same text (Q2 "did the update drift quality?" and Q3 "should I
// keep critic head vN?"). It is stored as ONE small `golden.json` per session
// (the same flow dir as `flow.v{N}.json` + `flow_signals.jsonl`), coexisting
// baselines, never a new field on existing types.
//
// One-copy-at-a-time: a golden baseline is keyed by `flow_version`; re-flagging
// the SAME version REPLACES its entry (no duplicate), so the file holds at
// most one snapshot per run.

/// One frozen quality baseline (a flagged run).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoldenRun {
    /// The flow version this baseline was captured from (`flow.v{N}.json`).
    pub flow_version: u32,
    /// The entry text the run was built from (the golden direction, Q2/Q3 key).
    pub entry_text: String,
    /// The overall score at capture time (the frozen baseline, I2-derived).
    pub baseline_overall: f64,
    /// Per-section baseline scores, in `plan.primary().sections` order. The
    /// section ordinal is the join key (critic leaf `s{i}` ↔ section i,
    /// verified 1:1 in `mod.rs`). `tag` + frame range carry the label.
    pub sections: Vec<GoldenSectionBaseline>,
    /// The critic model version that produced the baseline (the "which critic
    /// did this with" tag; Q3 compares differing critic_model_version).
    pub critic_model_version: u32,
    /// Unix-seconds the baseline was flagged (0 in tests).
    #[serde(default)]
    pub starred_at: u64,
}

/// One section's frozen baseline label + score.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoldenSectionBaseline {
    pub section_index: u32,
    pub tag: String,
    pub frame_start: u32,
    pub frame_end: u32,
    pub score: f64,
}

/// The session's golden set (a JSON array of baselines, coexisting).
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoldenSet {
    pub runs: Vec<GoldenRun>,
}

/// Collapse one section's critic leaf into its baseline score, mirroring the
/// TS `tagBars` join exactly: leaf `s{i}` = `scoretree.root.children[i]`,
/// collapsed via the tree's combinator; a missing leaf scores neutral 0.5.
fn section_leaf_score(doc: &FlowDocument, section_index: usize) -> f64 {
    use crate::generation::video_flow::collapse;
    let tree = &doc.scoretree;
    let leaves = &tree.root.children;
    let comb = &tree.combinator;
    match leaves.get(section_index) {
        Some(leaf) => collapse(leaf, comb),
        None => 0.5,
    }
}

/// Capture the current golden baseline for `flow_version` from the persisted
/// doc, returning the `GoldenRun` the command upserts.
fn golden_run_from_doc(doc: &FlowDocument, starred_at: u64) -> GoldenRun {
    let sections = doc.structured.primary().sections.clone();
    let section_baselines: Vec<GoldenSectionBaseline> = sections
        .iter()
        .enumerate()
        .map(|(i, s)| GoldenSectionBaseline {
            section_index: i as u32,
            tag: s.tag.keyword().to_string(),
            frame_start: s.frame_start,
            frame_end: s.frame_end,
            score: section_leaf_score(doc, i),
        })
        .collect();
    GoldenRun {
        flow_version: doc.flow_version,
        entry_text: doc.intent.entry_text.clone(),
        baseline_overall: doc.scoretree.overall(),
        sections: section_baselines,
        critic_model_version: doc.regen.version.critic_model_version,
        starred_at,
    }
}

fn golden_path(dir: &std::path::Path) -> std::path::PathBuf {
    dir.join("golden.json")
}

/// Read the session's golden set (empty when the file is absent or corrupt —
/// a missing baseline is a legitimate state, never an error).
fn load_golden_set(dir: &std::path::Path) -> GoldenSet {
    let p = golden_path(dir);
    std::fs::read_to_string(&p)
        .ok()
        .and_then(|s| serde_json::from_str::<GoldenSet>(&s).ok())
        .unwrap_or_default()
}

/// Flag the current `flow_version` as a quality baseline. Upsert by version:
/// re-flagging the same run REPLACES its baseline (one-copy-at-a-time), a
/// different version is appended. Returns the stored baseline count.
#[tauri::command]
pub async fn director_flag_golden(
    session_id: String,
    flow_version: u32,
    state: State<'_, AppState>,
) -> Result<u32, String> {
    let dir = {
        let db = &state.db.lock().await;
        flow_dir(db, &session_id).await?
    };
    let path = dir.join(FlowDocument::default_filename(flow_version));
    let doc = FlowDocument::load(&path).map_err(|e| e.to_string())?;
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let run = golden_run_from_doc(&doc, ts);
    let mut set = load_golden_set(&dir);
    // One baseline per flow_version: replace if present, else append.
    if let Some(slot) = set.runs.iter_mut().find(|r| r.flow_version == flow_version) {
        *slot = run;
    } else {
        set.runs.push(run);
    }
    let pretty = serde_json::to_string_pretty(&set).map_err(|e| e.to_string())?;
    std::fs::write(golden_path(&dir), pretty).map_err(|e| e.to_string())?;
    Ok(set.runs.len() as u32)
}

/// List the session's golden baselines (oldest → newest), the Scoreboard's
/// Golden-set card data source. Empty when none flagged.
#[tauri::command]
pub async fn director_list_golden(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<GoldenRun>, String> {
    let dir = {
        let db = &state.db.lock().await;
        flow_dir(db, &session_id).await?
    };
    let set = load_golden_set(&dir);
    let mut runs = set.runs;
    runs.sort_by_key(|r| r.flow_version);
    Ok(runs)
}

// ── Director scratch persistence (G0 entry draft + unapplied extract edits) ──
//
// The two in-memory-only pieces of the Director flow — the in-progress G0
// entry (idea + look params) and the unapplied Extract-tab section edits —
// must survive an app restart AND a session switch, not just a tab remount.
// The committed flow runs / signals / golden set are already on disk; this
// closes the last gap so the WHOLE dataset is durable. It is stored as one
// small `director_scratch.json` in the session flow dir (lazy: written on
// change, read on tab open — no hot path, so parse-time is fine). The
// frontend owns the JSON shape; Rust persists an opaque string, so a shape
// change never needs a Rust migration.

fn scratch_path(dir: &std::path::Path) -> std::path::PathBuf {
    dir.join("director_scratch.json")
}

/// Persist the session's Director scratch (opaque JSON the UI built). Empty
/// string = clear the file. One small lazy write.
#[tauri::command]
pub async fn director_save_scratch(
    session_id: String,
    scratch_json: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let dir = {
        let db = &state.db.lock().await;
        flow_dir(db, &session_id).await?
    };
    let p = scratch_path(&dir);
    if scratch_json.trim().is_empty() {
        // Clear: delete so a stale draft never resurfaces.
        if p.exists() {
            std::fs::remove_file(&p).map_err(|e| e.to_string())?;
        }
        Ok(())
    } else {
        // Validate it is a well-formed JSON object/array before writing —
        // we never persist corrupt scratch that a later load would choke on.
        serde_json::from_str::<serde_json::Value>(&scratch_json)
            .map_err(|e| format!("scratch: invalid JSON ({e})"))?;
        std::fs::write(&p, &scratch_json).map_err(|e| e.to_string())
    }
}

/// Load the session's Director scratch. Empty string = nothing persisted yet
/// (a fresh session), which the UI treats as "fall back to defaults."
#[tauri::command]
pub async fn director_load_scratch(
    session_id: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let dir = {
        let db = &state.db.lock().await;
        flow_dir(db, &session_id).await?
    };
    let p = scratch_path(&dir);
    match std::fs::read_to_string(&p) {
        Ok(s) if !s.trim().is_empty() => Ok(s),
        Ok(_) => Ok(String::new()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(e.to_string()),
    }
}

/// Destructive apply (I9): materialize the persisted flow's structured plan
/// into composer pipes and save it to the session's composer. This is the
/// "Regenerate pipes" action — it replaces/appends real composer pipes, so
/// it is only ever called from an explicit user confirm (the UI gates it
/// behind a confirm() dialog), never from a batch run.
///
/// `replace`: true = the flow's pipes replace the session's composer pipes;
/// false = append after the existing ones. Returns the resulting pipe count.
#[tauri::command]
pub async fn director_apply_flow(
    session_id: String,
    flow_version: u32,
    replace: bool,
    state: State<'_, AppState>,
) -> Result<u32, String> {
    let dir = {
        let db = &state.db.lock().await;
        flow_dir(db, &session_id).await?
    };
    let path = dir.join(FlowDocument::default_filename(flow_version));
    let doc = FlowDocument::load(&path).map_err(|e| e.to_string())?;

    // Prefer the CONCRETE engine plan (S4 molecules → per-scene pipes, each
    // shot a Scene section carrying its derived image prompt). Fall back to
    // the coarse marker-bridge `doc.structured` only for pre-engine docs that
    // have no engine run. Materialize into composer pipes; validate first so
    // a hand-edited or out-of-bounds doc can't slip past.
    let plan = build_apply_plan(&doc, flow_version);
    let cfg = crate::generation::video_flow::FlowConfig::default_flow();
    validate_plan(&plan, &cfg.structure).map_err(|e| e.to_string())?;
    let pipes = materialize_pipes(&plan, &cfg.materialize).map_err(|e| e.to_string())?;
    if pipes.is_empty() {
        return Err("plan carries no materializable pipes".into());
    }

    // Merge into the session's composer and persist.
    let count = merge_and_save_composer(&state, &session_id, replace, &pipes).await?;

    Ok(count)
}

// ── Phase 3: edited-section apply (in-memory, no new flow version) ─────────

/// One concrete section-prompt override from the UI.
///
/// Sections are addressed by **tag**, not by vector index: the concrete
/// engine plan skips empty concern sections, so a shot's lighting section
/// does NOT always sit at a fixed index. Tag is the closed vocabulary both
/// sides share (`VideoTag::from_keyword`), so the addressing is stable no
/// matter how sections are ordered/skipped.
///
/// A pipe can carry several sections of the SAME tag (the three story
/// arcs are all `scene`); `occurrence` picks the Nth one (0-based, in
/// plan order). `None` = apply to every section of that tag (legacy
/// behaviour). Out-of-bounds pipe, unknown tag, or no matching section =
/// silently ignored (never panic).
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditedSection {
    /// 0-based index into the materialized plan's pipes.
    pub pipe_index: u32,
    /// Concrete section tag (`scene`/`camera`/`motion`/`lighting`/
    /// `transition`/`effect`); closed vocabulary, parsed via
    /// `VideoTag::from_keyword`.
    pub tag: String,
    /// The Nth section of this tag in the pipe (0-based). `None` = all.
    #[serde(default)]
    pub occurrence: Option<u32>,
    /// The new prompt text.
    pub prompt: String,
}

/// The single source for which plan a run materializes from: prefer the
/// CONCRETE engine plan when `doc.engine` is present, fall back to the
/// coarse marker-bridge `doc.structured` for pre-engine docs.
pub fn build_apply_plan(doc: &FlowDocument, flow_version: u32) -> StructuredVideoPlan {
    doc.engine
        .as_ref()
        .map(|run| run.plan_from_engine(flow_version))
        .unwrap_or_else(|| doc.structured.clone())
}

/// Overwrite section prompts in-place from a list of `EditedSection` entries.
///
/// Each edit targets sections of the given closed-vocab tag within
/// `pipe_index`: when `occurrence` is `Some(n)` it replaces the Nth
/// section of that tag (in plan order); when `None` it replaces **every**
/// section of that tag (legacy behaviour, safe for the single-section
/// meta tags). Unknown tags and out-of-bounds `pipe_index` are ignored —
/// never panic. The tag is case-insensitive and trims surrounding
/// whitespace, matching `VideoTag::from_keyword`.
pub fn apply_section_edits(plan: &mut StructuredVideoPlan, edited: &[EditedSection]) {
    for e in edited {
        let Some(tag) = VideoTag::from_keyword(&e.tag) else {
            continue;
        };
        let Some(pipe) = plan.pipes.get_mut(e.pipe_index as usize) else {
            continue;
        };
        let mut seen = 0u32;
        for section in pipe.sections.iter_mut() {
            if section.tag != tag {
                continue;
            }
            match e.occurrence {
                Some(n) if seen == n => section.prompt = e.prompt.clone(),
                None => section.prompt = e.prompt.clone(),
                _ => {}
            }
            seen += 1;
        }
    }
}

/// Shared composer merge + save used by both apply commands.
/// Returns the resulting total pipe count.
async fn merge_and_save_composer(
    state: &crate::AppState,
    session_id: &str,
    replace: bool,
    pipes: &[crate::models::composer::Pipe],
) -> Result<u32, String> {
    let db = &state.db.lock().await;
    let existing = db
        .get_composer(session_id)
        .await
        .map_err(|e| format!("load composer: {e}"))?;
    let composer = if replace {
        crate::models::ComposerConfig {
            id: existing.id.clone(),
            session_id: existing.session_id.clone(),
            name: existing.name.clone(),
            pipes: pipes.to_vec(),
            fps: existing.fps,
            resolution: existing.resolution.clone(),
            orientation: existing.orientation.clone(),
            crop_mode: existing.crop_mode.clone(),
            custom_width: existing.custom_width,
            custom_height: existing.custom_height,
            video_ratio: existing.video_ratio.clone(),
            total_generated_frames: existing.total_generated_frames,
            session_video_path: existing.session_video_path.clone(),
            created_at: None,
            updated_at: None,
        }
    } else {
        let mut c = existing.clone();
        for p in pipes {
            c.pipes.push(p.clone());
        }
        c
    };
    db.save_composer(&composer)
        .await
        .map_err(|e| format!("save composer: {e}"))?;
    Ok(composer.pipes.len() as u32)
}

/// Apply a persisted flow's plan **with in-memory section-prompt overrides**,
/// materialize into composer pipes, and merge/save to the session composer.
/// No new flow version is persisted — the edits live only in the pipes.
///
/// `edited`: optional concrete section-prompt overrides, each addressing
/// `(pipe_index, tag, prompt)` — the tag is the closed section vocabulary
/// (`scene`/`camera`/`motion`/`lighting`/`transition`/`effect`), so the
/// target is stable even when the concrete plan skips empty concern
/// sections. When empty the behaviour is identical to `director_apply_flow`
/// (the "no overrides = plain apply" equivalence).
///
/// `replace`: true = the flow's pipes replace the session's composer pipes;
/// false = append after the existing ones. Returns the resulting pipe count.
#[tauri::command]
pub async fn director_apply_flow_edited(
    session_id: String,
    flow_version: u32,
    replace: bool,
    edited: Vec<EditedSection>,
    state: State<'_, AppState>,
) -> Result<u32, String> {
    let dir = {
        let db = &state.db.lock().await;
        flow_dir(db, &session_id).await?
    };
    let path = dir.join(FlowDocument::default_filename(flow_version));
    let doc = FlowDocument::load(&path).map_err(|e| e.to_string())?;

    let mut plan = build_apply_plan(&doc, flow_version);
    apply_section_edits(&mut plan, &edited);

    let cfg = crate::generation::video_flow::FlowConfig::default_flow();
    validate_plan(&plan, &cfg.structure).map_err(|e| e.to_string())?;
    let pipes = materialize_pipes(&plan, &cfg.materialize).map_err(|e| e.to_string())?;
    if pipes.is_empty() {
        return Err("plan carries no materializable pipes".into());
    }

    let count = merge_and_save_composer(&state, &session_id, replace, &pipes).await?;
    Ok(count)
}

// ── M3: scoped apply (in-place replace of the first N session pipes) ─────

/// Pure splice core of the scoped merge: the first `n` session pipes are
/// replaced in-place by the `pipes` plan's first `n` pipes; session pipes
/// at index `n` and beyond are kept untouched. Empty existing pipes is a
/// named error (a scoped apply is meaningless without a prior full apply).
fn splice_scoped_pipes(
    existing: &mut crate::models::ComposerConfig,
    pipes: &[crate::models::composer::Pipe],
) -> Result<u32, String> {
    if existing.pipes.is_empty() {
        return Err("session has no composer pipes — run a full apply first".to_string());
    }
    let n = pipes.len();
    let mut new_pipes = pipes.to_vec();
    // Pipes at index n and beyond in the session's composer stay untouched.
    if existing.pipes.len() > n {
        new_pipes.extend(existing.pipes[n..].iter().cloned());
    }
    existing.pipes = new_pipes;
    Ok(n as u32)
}

/// Splice the materialized scoped plan into the session's composer: replace
/// the first `pipes.len()` session pipes in-place; pipes at index N and
/// beyond remain untouched. Returns the number of replaced pipes.
async fn merge_scoped_composer(
    state: &crate::AppState,
    session_id: &str,
    pipes: &[crate::models::composer::Pipe],
) -> Result<u32, String> {
    let db = &state.db.lock().await;
    let mut existing = db
        .get_composer(session_id)
        .await
        .map_err(|e| format!("load composer: {e}"))?;

    let n = splice_scoped_pipes(&mut existing, pipes)?;

    db.save_composer(&existing)
        .await
        .map_err(|e| format!("save composer: {e}"))?;
    Ok(n)
}

/// Apply a persisted flow's plan with in-memory section-prompt overrides,
/// then splice the result into the session's composer as a **scoped**
/// in-place replace: the first N session pipes are replaced by the
/// materialized plan's N pipes; all remaining session pipes are untouched.
///
/// `pipe_scope`: the UI's `pipeScope` array (0-based indices into the
/// materialized plan). Every index must be < `pipes.len()`; any
/// out-of-range index is a hard error.
///
/// `edited`: optional concrete section-prompt overrides (same shape as
/// `director_apply_flow_edited`). When empty the behaviour is a plain
/// scoped apply.
///
/// Returns the number of replaced pipes (== `pipes.len()`).
#[tauri::command]
pub async fn director_apply_flow_scoped(
    session_id: String,
    flow_version: u32,
    pipe_scope: Vec<u32>,
    edited: Vec<EditedSection>,
    state: State<'_, AppState>,
) -> Result<u32, String> {
    let dir = {
        let db = &state.db.lock().await;
        flow_dir(db, &session_id).await?
    };
    let path = dir.join(FlowDocument::default_filename(flow_version));
    let doc = FlowDocument::load(&path).map_err(|e| e.to_string())?;

    let mut plan = build_apply_plan(&doc, flow_version);
    apply_section_edits(&mut plan, &edited);

    let cfg = crate::generation::video_flow::FlowConfig::default_flow();
    validate_plan(&plan, &cfg.structure).map_err(|e| e.to_string())?;
    let pipes = materialize_pipes(&plan, &cfg.materialize).map_err(|e| e.to_string())?;
    if pipes.is_empty() {
        return Err("plan carries no materializable pipes".into());
    }

    // Guard: every pipe_scope index must be a valid index into the
    // materialized plan's pipe vector.
    for &i in &pipe_scope {
        if i >= pipes.len() as u32 {
            return Err(format!(
                "pipe_scope index {} out of range ({} pipes in plan)",
                i,
                pipes.len()
            ));
        }
    }

    let count = merge_scoped_composer(&state, &session_id, &pipes).await?;
    Ok(count)
}

// ── M2: seed card (shareable one-file film-plan snapshot) ──────────────────

/// The card's expansion scale (mirror of the G0 grid: scenes 1..24,
/// shots/scene 1..5, clip seconds 4..12).
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SeedCardScale {
    pub scenes: u32,
    pub shots_per_scene: u32,
    /// [min, max] clip seconds (schema: exactly 2, each 4..=12).
    pub clip_s: [u32; 2],
}

/// One shareable G0 film-plan snapshot (mirror of the TS `SeedCard` in
/// src/lib/directorStore/seedCard.ts; field-for-field, camelCase wire).
/// No session keying, no versioning — the fixed `v: 1` discriminator only.
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SeedCard {
    /// Fixed wire discriminator (v1).
    pub v: u32,
    pub title: String,
    /// The creative idea the LLM reads (required — a card without it is
    /// useless, and the TS side rejects missing `idea`).
    pub idea: String,
    /// The G0 look axes (S1/S2 seeding).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mood: Option<u8>,
    pub genre: Genre,
    pub ratio: String,
    pub scale: SeedCardScale,
    pub time_of_day: String,
    pub weather: String,
    /// First novel scene prose (<= 280 chars), when the UI supplied one.
    #[serde(default)]
    pub preview: Option<String>,
}

/// `SeedCard` reuses the engine's closed genre shape (name + style).
/// Absent optionals (`mood`, `preview`) are OMITTED from the wire JSON
/// (`skip_serializing_if`), mirroring the TS card which drops them when
/// unset — a shareable file stays minimal; deserialization `#[default]`
/// restores them to `None`.

/// Cap on a loadable seed card file — the card is a small JSON snapshot,
/// never a blob, so the read path bounds its size up front.
const SEED_CARD_MAX_BYTES: usize = 16 * 1024;

/// Shared path guard for seed-card files: non-empty, no NUL byte, and no
/// `..` traversal component. Tauri's dialog picker always yields absolute
/// paths, so an absolute-ish check is sufficient here (the storage
/// validator is base-dir bound and does not fit a free-choice dialog path).
fn validate_seed_card_path(path: &str) -> Result<std::path::PathBuf, String> {
    let p = std::path::PathBuf::from(path);
    if path.trim().is_empty() {
        return Err("seed card path is empty".to_string());
    }
    if path.contains('\0') {
        return Err("seed card path contains a NUL byte".to_string());
    }
    for component in p.components() {
        if let std::path::Component::ParentDir = component {
            return Err("seed card path contains '..' traversal".to_string());
        }
    }
    Ok(p)
}

/// Pure write half: validate + parse the card JSON (shape check), then
/// write it PRETTY to `path`. Factored so the round-trip test needs no
/// `AppState` (the async command is a thin wrapper over this).
pub fn write_seed_card(path: &str, card_json: &str) -> Result<String, String> {
    let target = validate_seed_card_path(path)?;
    // Shape-validate before touching the disk: a card that can't be parsed
    // must never be written even half-file.
    let card: SeedCard =
        serde_json::from_str(card_json).map_err(|e| format!("seed card: invalid JSON ({e})"))?;
    // Ensure the parent dir exists (a dialog path points at a fresh file).
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    // Pretty-print for shareability (one file humans can diff/read).
    let pretty = serde_json::to_string_pretty(&card).map_err(|e| e.to_string())?;
    std::fs::write(&target, pretty).map_err(|e| e.to_string())?;
    Ok(path.to_string())
}

/// Pure read half: size-guard (16 KB), then shape-validate via
/// `serde_json::from_str::<SeedCard>` and return the RAW JSON string — the
/// UI owns parsing through `parseSeedCard` (Rust never re-serializes).
pub fn read_seed_card(path: &str) -> Result<String, String> {
    let target = validate_seed_card_path(path)?;
    let bytes = std::fs::read(&target).map_err(|e| e.to_string())?;
    if bytes.len() > SEED_CARD_MAX_BYTES {
        return Err(format!(
            "seed card too large ({} bytes > {})",
            bytes.len(),
            SEED_CARD_MAX_BYTES
        ));
    }
    let text = String::from_utf8(bytes).map_err(|_| "seed card is not valid UTF-8".to_string())?;
    // Shape check: must parse into the card struct (field-presence/shape
    // guard; the UI re-parses the same raw text via parseSeedCard).
    let _card: SeedCard =
        serde_json::from_str(&text).map_err(|e| format!("seed card: invalid JSON ({e})"))?;
    Ok(text)
}

/// Save a seed-card JSON string to a user-picked path (path-in dialog).
/// Writes PRETTY JSON; returns the path string echoed back.
#[tauri::command]
pub async fn director_save_seed_card(
    path: String,
    card_json: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    // `state` is accepted for the uniform command signature (the save is
    // path-driven, not session-keyed — no DB window needed at all).
    let _ = state;
    write_seed_card(&path, &card_json)
}

/// Load a seed card from a user-picked path (path-out dialog) and return
/// the RAW JSON string so the UI owns parsing via `parseSeedCard`.
#[tauri::command]
pub async fn director_load_seed_card(path: String) -> Result<String, String> {
    read_seed_card(&path)
}

// ── Unit tests (pure helpers, no DB access) ───────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generation::video_flow::engine::seed::EngineEntry;
    use crate::generation::video_flow::engine::types::{Genre, SeedScale};
    use crate::generation::video_flow::{
        lower_to_elements, structure_plan, Critic, CriticInput, CriticSectionView, DefaultCritic,
        FlowConfig, IntentSnapshot, LayeredExpander, ModelResolver, ModelRole,
        PassthroughLayeredExpander, RegenerationContract, StubModelResolver, VersionTriple,
    };

    fn test_entry() -> EngineEntry {
        EngineEntry {
            title: String::new(),
            idea: "a red fox darts through the tall pine forest at dusk as golden light spills across the meadow".into(),
            input_text: Some("a red fox darts through the tall pine forest at dusk as golden light spills across the meadow".into()),
            genre: Genre {
                name: "Cinematic".into(),
                style: "cinematic natural light".into(),
            },
            ratio: "16:9".into(),
            scale: SeedScale { scenes: 1, shots_per_scene: 2, clip_s: [8, 10] },
            time_of_day: "midday".into(),
            weather: "clear".into(),
            mood: 50,
            overrides: Default::default(),
        }
    }

    /// Build a minimal `FlowDocument` with a known `structured` plan and an
    /// `engine` run, mirroring how the flow_doc / mod tests construct fixtures.
    fn test_doc(with_engine: bool) -> FlowDocument {
        let cfg = FlowConfig::default_flow();
        let long = "a red fox darts through the tall pine forest at dusk as golden light \
                     spills across the meadow and a distant river catches the fading sun in \
                     long slow reflections while the wind moves the dry grass and the whole \
                     valley settles into quiet evening";
        let intent = IntentSnapshot::new(long);
        let novel = PassthroughLayeredExpander
            .expand(&intent, &cfg.expand)
            .unwrap();
        let marker_text = format!(
            "# A fox at dusk\n@@ cinematic, warm golden hour\n\
             @camera:0-24\nwide tracking shot across the meadow\n\
             @lighting:24-48\nlong shadows in the fading sun\n\
             @transition:48-60\nsoft dissolve into the river"
        );
        let structured = structure_plan(&marker_text, &cfg.structure, cfg.flow_version).unwrap();
        let critic_input = CriticInput {
            sections: structured
                .primary()
                .sections
                .iter()
                .enumerate()
                .map(|(i, s)| CriticSectionView {
                    id: format!("s{i}"),
                    prompt: s.prompt.clone(),
                })
                .collect(),
            intent_clauses: intent.clauses.iter().map(|c| c.text.clone()).collect(),
        };
        let scoretree = DefaultCritic.score(&critic_input, &cfg.critic).unwrap();
        let lowered = lower_to_elements(&structured).unwrap();
        let triple = VersionTriple {
            flow_version: cfg.flow_version,
            expand_version: cfg.expand.step_version,
            structure_version: cfg.structure.step_version,
            critic_version: cfg.critic.step_version,
            critic_model_version: 0,
        };
        let regen = RegenerationContract::new(triple, &lowered);
        let critic_model =
            StubModelResolver.resolve(ModelRole::Critic, 0, cfg.learn.model_root.as_deref());
        let engine = if with_engine {
            Some(test_entry().build_run())
        } else {
            None
        };
        FlowDocument {
            flow_version: cfg.flow_version,
            intent,
            novel,
            structured,
            scoretree,
            lowered,
            regen,
            critic_model: Some(critic_model),
            engine,
        }
    }

    // (a) build_apply_plan picks the engine concrete plan when doc.engine
    //     is present, and falls back to doc.structured otherwise.
    #[test]
    fn build_apply_plan_prefers_engine_when_present() {
        let doc = test_doc(true);
        let plan = build_apply_plan(&doc, 1);
        // The engine plan has one pipe per shot; with 2 shots_per_scene it
        // should have >= 2 pipes (the structured plan has exactly 1 pipe).
        assert!(
            plan.pipes.len() >= 2,
            "engine plan should have >= 2 pipes, got {}",
            plan.pipes.len()
        );
        // The structured fallback has exactly 1 pipe.
        let doc_no_engine = test_doc(false);
        let fallback = build_apply_plan(&doc_no_engine, 1);
        assert_eq!(fallback.pipes.len(), 1, "structured fallback has 1 pipe");
    }

    // (b) apply_section_edits overwrites by TAG and ignores unknown tags /
    //     out-of-bounds pipes without panicking.
    #[test]
    fn apply_section_edits_overwrites_and_ignores_oob() {
        let doc = test_doc(false); // structured fallback: 1 pipe, 3 sections
        let mut plan = build_apply_plan(&doc, 1);
        let original = plan.clone();
        let pipe = &original.pipes[0];
        let original_prompt = pipe.sections[0].prompt.clone();
        assert_ne!(original_prompt, "MY OVERRIDE");

        // Valid edit: pipe 0, the first section's tag.
        let scene_tag = original.pipes[0].sections[0].tag.keyword().to_string();
        apply_section_edits(
            &mut plan,
            &[EditedSection {
                pipe_index: 0,
                tag: scene_tag.clone(),
                occurrence: None,
                prompt: "MY OVERRIDE".into(),
            }],
        );
        let edited_scene = plan.pipes[0]
            .sections
            .iter()
            .find(|s| s.tag.keyword() == scene_tag.as_str())
            .expect("scene section present");
        assert_eq!(edited_scene.prompt, "MY OVERRIDE");

        // Unknown tag + out-of-bounds pipe — must not panic or touch anything.
        apply_section_edits(
            &mut plan,
            &[
                EditedSection {
                    pipe_index: 0,
                    tag: "nope".into(),
                    occurrence: None,
                    prompt: "x".into(),
                },
                EditedSection {
                    pipe_index: 99,
                    tag: scene_tag.clone(),
                    occurrence: None,
                    prompt: "y".into(),
                },
            ],
        );
        // The scene section still holds the override; no unknown-tag section
        // was created, no other section changed.
        let still_edited = plan.pipes[0]
            .sections
            .iter()
            .find(|s| s.tag.keyword() == scene_tag.as_str())
            .expect("scene section still present");
        assert_eq!(still_edited.prompt, "MY OVERRIDE");
        assert_eq!(
            plan.pipes.len(),
            original.pipes.len(),
            "no pipes added/removed"
        );
    }

    // (c) empty `edited` vec leaves the plan byte-identical to
    //     build_apply_plan's output (the "no overrides = plain apply"
    //     equivalence).
    #[test]
    fn apply_section_edits_empty_vec_is_noop() {
        let doc = test_doc(false);
        let plan = build_apply_plan(&doc, 1);
        let mut plan_edited = plan.clone();
        apply_section_edits(&mut plan_edited, &[]);
        assert_eq!(plan, plan_edited, "empty edits must leave plan unchanged");
    }

    // (d) The edited command's target: on the CONCRETE engine plan, an edit
    //     aimed at the `camera` tag lands on the camera section even when
    //     the plan SKIPS empty concern sections (shot 0's motion is empty,
    //     so its vector index would have shifted). This is exactly what
    //     `director_apply_flow_edited` runs.
    #[test]
    fn apply_section_edits_targets_tag_on_concrete_plan() {
        let doc = test_doc(true);
        let mut plan = build_apply_plan(&doc, 1);
        assert!(plan.pipes.len() >= 2, "concrete plan = one pipe per shot");
        let camera_tag = VideoTag::Camera.keyword().to_string();
        apply_section_edits(
            &mut plan,
            &[EditedSection {
                pipe_index: 0,
                tag: camera_tag.clone(),
                occurrence: None,
                prompt: "CAMERA OVERRIDDEN".into(),
            }],
        );
        let hit = plan.pipes[0]
            .sections
            .iter()
            .find(|s| s.tag.keyword() == camera_tag.as_str())
            .expect("camera section present in the concrete plan");
        assert_eq!(hit.prompt, "CAMERA OVERRIDDEN");
        // A non-camera section of pipe 0 is untouched.
        let other = plan.pipes[0]
            .sections
            .iter()
            .find(|s| s.tag.keyword() != camera_tag.as_str())
            .expect("a non-camera section exists");
        assert_ne!(other.prompt, "CAMERA OVERRIDDEN");
    }

    // (e) OCCURRENCING tag edits: the concrete plan carries three `scene`
    //     story arcs per pipe. `occurrence: Some(1)` must replace ONLY the
    //     middle arc; the other two keep their prompts. `None` still
    //     applies to every arc (legacy).
    #[test]
    fn apply_section_edits_occurrence_targets_single_arc() {
        let doc = test_doc(true);
        let mut plan = build_apply_plan(&doc, 1);
        let pipe0 = &plan.pipes[0];
        let scene_arcs: Vec<_> = pipe0
            .sections
            .iter()
            .enumerate()
            .filter(|(_, s)| s.tag == VideoTag::Scene)
            .collect();
        assert!(
            scene_arcs.len() >= 2,
            "concrete plan carries multiple story arcs per pipe, got {}",
            scene_arcs.len()
        );
        let scene_tag = VideoTag::Scene.keyword().to_string();
        apply_section_edits(
            &mut plan,
            &[EditedSection {
                pipe_index: 0,
                tag: scene_tag.clone(),
                occurrence: Some(1),
                prompt: "MIDDLE ARC OVERRIDDEN".into(),
            }],
        );
        let scenes: Vec<&crate::generation::video_flow::PlanSection> = plan.pipes[0]
            .sections
            .iter()
            .filter(|s| s.tag == VideoTag::Scene)
            .collect();
        assert_eq!(scenes[1].prompt, "MIDDLE ARC OVERRIDDEN");
        assert_ne!(scenes[0].prompt, "MIDDLE ARC OVERRIDDEN", "arc 0 untouched");
        // `occurrence: None` applies to EVERY arc of the tag.
        apply_section_edits(
            &mut plan,
            &[EditedSection {
                pipe_index: 0,
                tag: scene_tag,
                occurrence: None,
                prompt: "ALL ARCS".into(),
            }],
        );
        let all: Vec<&str> = plan.pipes[0]
            .sections
            .iter()
            .filter(|s| s.tag == VideoTag::Scene)
            .map(|s| s.prompt.as_str())
            .collect();
        assert!(
            all.iter().all(|p| *p == "ALL ARCS"),
            "None occurrence hits every arc"
        );
        // An out-of-range occurrence is ignored (never panics, no change).
        let before = plan.clone();
        apply_section_edits(
            &mut plan,
            &[EditedSection {
                pipe_index: 0,
                tag: VideoTag::Scene.keyword().to_string(),
                occurrence: Some(99),
                prompt: "NOPE".into(),
            }],
        );
        assert_eq!(plan, before, "out-of-range occurrence is a no-op");
    }

    // (f) M2 seed card: a shareable one-file film-plan snapshot round-trips
    //     through write_seed_card / read_seed_card in a temp dir, and the
    //     16 KB load guard rejects an oversized file. Pure helpers — no DB.
    #[test]
    fn seed_card_round_trips_and_rejects_oversized() {
        use super::{read_seed_card, write_seed_card, SeedCard, SeedCardScale};

        let dir = std::env::temp_dir().join(format!("seed-card-{}", uuid::Uuid::new_v4()));
        let file = dir.join("card.json");

        let card = SeedCard {
            v: 1,
            title: "Untitled".into(),
            idea: "a red fox darts through the tall pine forest at dusk".into(),
            mood: Some(72),
            genre: crate::generation::video_flow::engine::types::Genre {
                name: "Cinematic".into(),
                style: "cinematic natural light".into(),
            },
            ratio: "16:9".into(),
            scale: SeedCardScale {
                scenes: 2,
                shots_per_scene: 3,
                clip_s: [8, 10],
            },
            time_of_day: "midday".into(),
            weather: "clear".into(),
            preview: Some("The fox darts through the pines as golden light spills...".into()),
        };
        let json = serde_json::to_string(&card).unwrap();

        // Write (path echo returned) → the file holds PRETTY json of the card.
        let echoed = write_seed_card(file.to_str().unwrap(), &json).unwrap();
        assert_eq!(echoed, file.to_str().unwrap());
        let on_disk = std::fs::read_to_string(&file).unwrap();
        assert_eq!(
            serde_json::from_str::<SeedCard>(&on_disk).unwrap(),
            card,
            "written card must round-trip field-for-field"
        );

        // Read → the raw JSON string is returned (UI owns parseSeedCard),
        // and it re-parses to the same struct.
        let raw = read_seed_card(file.to_str().unwrap()).unwrap();
        assert_eq!(serde_json::from_str::<SeedCard>(&raw).unwrap(), card);

        // A card without mood/preview also parses (the Option fields default).
        let bare = SeedCard {
            mood: None,
            preview: None,
            ..card.clone()
        };
        let bare_json = serde_json::to_string(&bare).unwrap();
        assert!(bare_json.contains("\"idea\""), "idea must serialize");
        assert!(
            !bare_json.contains("\"mood\""),
            "absent mood must be dropped"
        );
        let bare_path = dir.join("bare.json");
        write_seed_card(bare_path.to_str().unwrap(), &bare_json).unwrap();
        let bare_raw = read_seed_card(bare_path.to_str().unwrap()).unwrap();
        assert_eq!(serde_json::from_str::<SeedCard>(&bare_raw).unwrap(), bare);

        // The 16 KB guard: an oversized file is rejected on read.
        let big = dir.join("big.json");
        std::fs::write(&big, "0".repeat(SEED_CARD_MAX_BYTES + 1)).unwrap();
        let err = read_seed_card(big.to_str().unwrap()).unwrap_err();
        assert!(
            err.contains("seed card too large"),
            "oversized file must be rejected, got: {err}"
        );

        // A non-JSON / oversized-but-valid-JSON file fails the shape check.
        let bad = dir.join("bad.json");
        std::fs::write(&bad, "not json at all".as_bytes()).unwrap();
        assert!(read_seed_card(bad.to_str().unwrap()).is_err());

        // Best-effort cleanup (temp dir may be shared across test runs).
        let _ = std::fs::remove_dir_all(&dir);
    }

    // (g) M3 scoped splice: replacing the first n session pipes in place
    //     leaves the trailing pipes untouched; an empty composer is a named
    //     error (the UI's `pipeCount === 0` guard, server-side).
    #[test]
    fn splice_scoped_pipes_replaces_first_n_in_place() {
        use crate::models::composer::{ComposerConfig, Pipe};

        let mut pipe_named = |name: &str, frames: u32| {
            let mut p = Pipe::new(name, frames);
            p.id = name.to_string();
            p
        };

        let mut cfg = ComposerConfig::new("sess", "c");
        cfg.pipes = (0..4)
            .map(|i| pipe_named(&format!("old-{i}"), 24))
            .collect();

        // n < existing count: the first 2 session pipes are replaced in
        // place; pipes at index 2 and beyond stay untouched.
        let new_pipes: Vec<Pipe> = (0..2)
            .map(|i| pipe_named(&format!("new-{i}"), 48))
            .collect();
        let replaced = splice_scoped_pipes(&mut cfg, &new_pipes).unwrap();
        assert_eq!(replaced, 2);
        assert_eq!(cfg.pipes.len(), 4, "the two trailing pipes are kept");
        assert_eq!(cfg.pipes[0].name, "new-0");
        assert_eq!(cfg.pipes[1].name, "new-1");
        assert_eq!(cfg.pipes[2].name, "old-2", "trailing pipes untouched");
        assert_eq!(cfg.pipes[3].name, "old-3");

        // n >= existing count: every session pipe is replaced.
        let all: Vec<Pipe> = (0..5)
            .map(|i| pipe_named(&format!("full-{i}"), 24))
            .collect();
        let replaced = splice_scoped_pipes(&mut cfg, &all).unwrap();
        assert_eq!(replaced, 5);
        assert_eq!(cfg.pipes.len(), 5);
        assert_eq!(cfg.pipes[4].name, "full-4");

        // An empty existing composer is a named error, not a silent no-op.
        let mut empty = ComposerConfig::new("s", "e");
        empty.pipes.clear();
        let err = splice_scoped_pipes(&mut empty, &new_pipes).unwrap_err();
        assert!(err.contains("run a full apply first"), "{err}");
    }
}
