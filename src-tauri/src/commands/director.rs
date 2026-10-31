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
    append_signal_jsonl, materialize_pipes, validate_plan, FlowDocument, SignalKind,
    SignalRecord, StructuredVideoPlan, VideoFlow, VideoTag,
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
    db.save_composer(&composer).await.map_err(|e| format!("save composer: {e}"))?;
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

// ── Unit tests (pure helpers, no DB access) ───────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generation::video_flow::engine::seed::EngineEntry;
    use crate::generation::video_flow::engine::types::{Genre, SeedScale};
    use crate::generation::video_flow::{
        Critic, CriticInput, CriticSectionView, DefaultCritic, FlowConfig,
        IntentSnapshot, LayeredExpander, ModelResolver, ModelRole,
        PassthroughLayeredExpander, RegenerationContract, StubModelResolver,
        lower_to_elements, structure_plan, VersionTriple,
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
        let novel = PassthroughLayeredExpander.expand(&intent, &cfg.expand).unwrap();
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
        let critic_model = StubModelResolver.resolve(
            ModelRole::Critic,
            0,
            cfg.learn.model_root.as_deref(),
        );
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
        let edited_scene = plan
            .pipes[0]
            .sections
            .iter()
            .find(|s| s.tag.keyword() == scene_tag.as_str())
            .expect("scene section present");
        assert_eq!(edited_scene.prompt, "MY OVERRIDE");

        // Unknown tag + out-of-bounds pipe — must not panic or touch anything.
        apply_section_edits(
            &mut plan,
            &[
                EditedSection { pipe_index: 0, tag: "nope".into(), occurrence: None, prompt: "x".into() },
                EditedSection { pipe_index: 99, tag: scene_tag.clone(), occurrence: None, prompt: "y".into() },
            ],
        );
        // The scene section still holds the override; no unknown-tag section
        // was created, no other section changed.
        let still_edited = plan
            .pipes[0]
            .sections
            .iter()
            .find(|s| s.tag.keyword() == scene_tag.as_str())
            .expect("scene section still present");
        assert_eq!(still_edited.prompt, "MY OVERRIDE");
        assert_eq!(plan.pipes.len(), original.pipes.len(), "no pipes added/removed");
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
        let other = plan
            .pipes[0]
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
        assert_ne!(
            scenes[0].prompt,
            "MIDDLE ARC OVERRIDDEN",
            "arc 0 untouched"
        );
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
        assert!(all.iter().all(|p| *p == "ALL ARCS"), "None occurrence hits every arc");
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
}
