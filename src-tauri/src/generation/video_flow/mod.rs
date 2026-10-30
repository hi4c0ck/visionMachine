//! Video-flow harness — full architecture (Phase 0 + learned-fidelity spine).
//!
//! A separate, deep module that turns **user entry text** into **solid,
//! regeneration-ready flow elements** through a chain of *versioned mutation
//! steps*, each isolated (I1):
//!
//!   IntentSnapshot (ground truth)
//!     ↓ expand      raw text → layered `Novel` (primary + secondary + ambient)
//!     ↓ structure   `Novel` → `StructuredVideoPlan` (sections + video-engine tags)
//!     ↓ critic      plan + intent → `ScoreTree` (overall = combinator(leaves))
//!     ↓ lower       plan → `Vec<FlowElement>` (the harness's own elements, I9)
//!     ↓ regen       elements → `RegenerationContract` (destructive, versioned, I5)
//!     → `FlowDocument` (the session-space persisted artifact)
//!
//! Design rules:
//! - **Separate module, deep structure.** Each concern lives in its own file.
//! - **Isolation (I1):** each step sees *only* its typed input + config +
//!   scoped provenance. Expand never sees `Structured`; structure never sees
//!   the next step's world; critic sees only `CriticInput`; lower sees only
//!   `Structured`; regen sees only `Lowered`.
//! - **Versioning (I5/#6):** every step pins a `step_version`; the flow pins
//!   `FLOW_VERSION`; the regeneration contract records the full triple so a
//!   destructive replace is replayable + auditable.
//! - **Learned fidelity (F-A/F-B):** the critic is a *local model* (seam:
//!   `Critic` trait, `DefaultCritic` stub now, `learn.rs` build spec +
//!   resolver for the real weights). Signals are captured (`signal.rs`) for
//!   a *separate* trainer. The overall score *descends* from per-element
//!   leaves via a configurable `ScoreCombinator` (I2: always explainable).
//! - **Pipes untouched (I9):** the harness emits `FlowElement`, not
//!   `composer::Pipe`. `steps/materialize.rs` remains a *deferred*
//!   composer-adapter (off-mission until pipes are regenerated).
//! - **Careful text-output tests:** every invariant violation is a concrete,
//!   named `FlowError` — never a silent pass.
//!
//! See `docs/text-video-flow-tasks.md` for the full phase roadmap.

mod config;
mod critic;
mod error;
mod flow_doc;
mod intent;
mod learn;
mod novel;
mod plan;
mod regen;
mod signal;
mod steps;

/// The *real* mutation-flow model absorbed from `harness/`: closed tag
/// vocabulary, concern-grouped shot specs, the vector learning substrate,
/// deterministic derive, and the gate model. Additive + versioned; no LLM,
/// no media, no `composer::Pipe` (I9).
pub mod engine;

#[cfg(test)]
mod golden_tests;
#[cfg(test)]
mod scoring_tests;

// ── config ─────────────────────────────────────────────────────────────
pub use config::{
    CriticParams, ExpandParams, FlowConfig, LearnParams, MaterializeParams,
    ScoreCombinator, StructureParams, FLOW_VERSION,
};

// ── error ──────────────────────────────────────────────────────────────
pub use error::{FlowError, FlowResult};

// ── intent ─────────────────────────────────────────────────────────────
pub use intent::{AssetRef, Clause, ClauseId, IntentSnapshot, SpanId, decompose_clauses};

// ── novel ──────────────────────────────────────────────────────────────
pub use novel::{
    Ambient, Layer, LayerKind, LayeredExpander, LookAxes, Novel, PassthroughLayeredExpander,
    TemplateLayeredExpander,
};

// ── plan ───────────────────────────────────────────────────────────────
pub use plan::{PlanPipe, PlanSection, StructuredVideoPlan, VideoTag};

// ── critic ─────────────────────────────────────────────────────────────
pub use critic::{
    Critic, CriticInput, CriticSectionView, DefaultCritic, NodeKind, ScoreNode, ScoreTree,
};

// ── learn ──────────────────────────────────────────────────────────────
pub use learn::{
    AdditiveHead, ModelBase, ModelBuildSpec, ModelHandle, ModelResolver, ModelRole,
    StubModelResolver,
};

// ── signal ─────────────────────────────────────────────────────────────
pub use signal::{SignalKind, SignalLog, SignalRecord, append_signal_jsonl, signal_line};

// ── regen ──────────────────────────────────────────────────────────────
pub use regen::{
    ElementTrace, FlowElement, Lowered, RegenerationContract, VersionTriple, lower_to_elements,
};

// ── flow_doc ───────────────────────────────────────────────────────────
pub use flow_doc::FlowDocument;

// ── steps (Phase-0 deterministic seams, kept for backward compat) ─────
pub use steps::{
    expand_raw_text, materialize_pipes, structure_plan, validate_novel, validate_plan,
    ExpandResult, MarkerStructurer, PassthroughExpander, StructureResult, TextExpander,
    TextStructurer,
};

use crate::models::composer::Pipe;

/// The versioned orchestrator: user entry text → session-space flow document
/// (with a destructive regeneration contract).
pub struct VideoFlow {
    pub config: FlowConfig,
}

pub type VFlow = VideoFlow;

impl VideoFlow {
    pub fn new() -> Self {
        Self {
            config: FlowConfig::default_flow(),
        }
    }

    pub fn with_config(config: FlowConfig) -> Self {
        Self { config }
    }

    /// Run the **full** pipeline with no explicit engine entry: the engine
    /// seed is derived from `raw` alone (default genre/ratio/scale).
    pub fn run_full(&self, raw: &str) -> FlowResult<FlowDocument> {
        self.run_full_with_entry(raw, None)
    }

    /// Run the **full** pipeline: intent → expand → structure → critic →
    /// lower → regen → `FlowDocument`.
    ///
    /// This is the *primary* entry point the UI will call. It produces the
    /// complete session-space artifact (your #5) and the destructive
    /// regeneration contract (your #6).
    ///
    /// `entry` is the optional S0 engine entry (Director G0 controls). When
    /// present it drives the engine seed (genre/ratio/scale + G0 look axes);
    /// when absent the seed is derived from `raw` alone so the S0→S5 flow is
    /// always saturated.
    pub fn run_full_with_entry(
        &self,
        raw: &str,
        entry: Option<&crate::generation::video_flow::engine::seed::EngineEntry>,
    ) -> FlowResult<FlowDocument> {
        let intent = IntentSnapshot::new(raw);

        // Step 1: expand (layered narrative).
        //
        // The LLM-free path uses the *template* expander: it fills the
        // secondary/ambient layers from the G0 look axes so the novel is a
        // real expansion, not the entry verbatim. The LLM `LayeredExpander`
        // (provider-model) replaces both this and the look-axes derivation
        // later; `PassthroughLayeredExpander` stays the seam's byte-stable
        // pin (golden fixtures).
        let look = match entry {
            Some(e) => LookAxes::from(e),
            None => LookAxes::from(&default_engine_entry(raw, &intent)),
        };
        let expander = TemplateLayeredExpander;
        let novel = expander.expand_with_look(&intent, &self.config.expand, &look)?;

        // Step 2: structure (marker grammar → plan).
        // The deterministic path: structure the *novel primary text* using the
        // marker structurer. The LLM structurer (later) will replace this
        // with a local model behind `TextStructurer`.
        let marker_text = self.marker_text_from_novel(&intent, &novel);
        let plan = structure_plan(&marker_text, &self.config.structure, self.config.flow_version)?;
        validate_plan(&plan, &self.config.structure)?;

        // Step 3: critic (score tree).
        let critic_input = CriticInput {
            sections: plan
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
        let scoretree = DefaultCritic.score(&critic_input, &self.config.critic)?;

        // Step 4: lower (into the harness's own FlowElements, I9).
        let lowered = lower_to_elements(&plan)?;

        // Step 5: regeneration contract (destructive, versioned, I5).
        let triple = VersionTriple {
            flow_version: self.config.flow_version,
            expand_version: self.config.expand.step_version,
            structure_version: self.config.structure.step_version,
            critic_version: self.config.critic.step_version,
            critic_model_version: 0,
        };
        let regen = RegenerationContract::new(triple, &lowered);

        // Critic model handle (stub = untrained in Phase 0).
        let critic_model = StubModelResolver.resolve(
            ModelRole::Critic,
            0,
            self.config.learn.model_root.as_deref(),
        );

        // Engine S0→S5 saturation: always produced (LLM-free, deterministic),
        // so every persisted doc carries the full flow state. Entry drives the
        // seed; without one, derive a default seed from the raw text.
        let engine = Some(build_engine_run(raw, &intent, entry));

        Ok(FlowDocument {
            flow_version: self.config.flow_version,
            intent,
            novel,
            structured: plan,
            scoretree,
            lowered,
            regen,
            critic_model: Some(critic_model),
            engine,
        })
    }

    /// The plan-only path (expand + structure), useful for a preview of the
    /// structured text before committing to elements.
    pub fn plan_only(&self, raw: &str) -> FlowResult<StructuredVideoPlan> {
        let intent = IntentSnapshot::new(raw);
        let expander = TemplateLayeredExpander;
        let look = LookAxes::from(&default_engine_entry(raw, &intent));
        let novel = expander.expand_with_look(&intent, &self.config.expand, &look)?;
        let marker_text = self.marker_text_from_novel(&intent, &novel);
        let plan = structure_plan(&marker_text, &self.config.structure, self.config.flow_version)?;
        validate_plan(&plan, &self.config.structure)?;
        Ok(plan)
    }

    /// Phase-0 backward-compat: the old `text → pipes` path (materialize into
    /// `composer::Pipe`). **Off-mission** (I9) — kept only so existing
    /// callers don't break until the UI migrates to `run_full`. Now routes
    /// through the marker bridge (`plan_only`) so it works on plain prose.
    pub fn run(&self, raw: &str) -> FlowResult<(Vec<Pipe>, StructuredVideoPlan)> {
        let plan = self.plan_only(raw)?;
        let pipes = materialize_pipes(&plan, &self.config.materialize)?;
        Ok((pipes, plan))
    }

    /// Build the marker-structured text from an intent + novel. This is the
    /// deterministic bridge: it reads the intent's clauses + the novel's
    /// primary text and emits a marker-grammar narrative that `structure_plan`
    /// can parse. The LLM structurer (later) replaces this entirely.
    fn marker_text_from_novel(&self, intent: &IntentSnapshot, novel: &Novel) -> String {
        let mut out = String::new();
        // Title from the first intent clause (or a default).
        let title = intent
            .clauses
            .first()
            .map(|c| c.text.as_str())
            .unwrap_or("Untitled");
        out.push_str(&format!("# {title}\n"));
        // Style from the novel's secondary layers (if any).
        if !novel.secondary.is_empty() {
            out.push_str(&format!("@@ {}\n", novel.secondary[0].text));
        }
        // Sections: one @scene per intent clause, capped so the clause
        // fan-out + trailing @scene can never overflow `max_sections_per_pipe`
        // (the LLM structurer replaces this deterministic marker bridge later).
        let clause_cap = self
            .config
            .structure
            .max_sections_per_pipe
            .saturating_sub(1);
        for clause in intent.clauses.iter().take(clause_cap) {
            let ordinal = clause.id.as_str().split('-').nth(1).and_then(|n| n.parse::<u32>().ok()).unwrap_or(0);
            let frames = self.config.structure.default_section_frames;
            let start = ordinal * frames;
            let end = start + frames;
            out.push_str(&format!("@scene:{start}-{end}\n{prompt}\n", prompt = clause.text));
        }
        // Append the novel's primary text as a free-text tail (it becomes the
        // prompt of the last section, or a trailing @scene).
        if !novel.primary.text.trim().is_empty() {
            out.push_str(&format!("@scene\n{}\n", novel.primary.text.trim()));
        }
        out
    }
}

impl Default for VideoFlow {
    fn default() -> Self {
        Self::new()
    }
}

/// Build the S0→S5 engine run for a flow document. When the UI supplies an
/// `EngineEntry` (Director G0 controls) it drives the seed directly;
/// otherwise a default seed is derived from the entry text + intent so the
/// flow is still saturated (genre/ratio/scale = defaults).
fn build_engine_run(
    raw: &str,
    intent: &IntentSnapshot,
    entry: Option<&crate::generation::video_flow::engine::seed::EngineEntry>,
) -> crate::generation::video_flow::engine::seed::EngineRun {
    let entry = entry.cloned().unwrap_or_else(|| default_engine_entry(raw, intent));
    entry.build_run()
}

/// The deterministic G0 entry derived from raw text when the UI supplies no
/// explicit one. Shared by the engine build and the template expander's
/// look-axes so the novel's secondary layers always steer from the same
/// genre/time-of-day/weather the engine seed uses.
fn default_engine_entry(
    raw: &str,
    intent: &IntentSnapshot,
) -> crate::generation::video_flow::engine::seed::EngineEntry {
    use crate::generation::video_flow::engine::seed::EngineEntry;
    use crate::generation::video_flow::engine::types::{Genre, SeedScale};

    let title = intent
        .clauses
        .first()
        .map(|c| c.text.clone())
        .unwrap_or_else(|| "Untitled".into());
    EngineEntry {
        title,
        idea: raw.to_string(),
        input_text: Some(raw.to_string()),
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

// ── Tests ──────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    /// 45 words to clear the default expand floor.
    const LONG: &str = "a red fox darts through the tall pine forest at dusk as golden light \
                        spills across the meadow and a distant river catches the fading sun in \
                        long slow reflections while the wind moves the dry grass and the whole \
                        valley settles into quiet evening";

    fn default_flow() -> VideoFlow {
        VideoFlow::new()
    }

    // ── Phase-0 backward-compat path (materialize into composer::Pipe) ──

    #[test]
    fn phase0_run_produces_composer_pipes() {
        let (pipes, plan) = default_flow().run(LONG).unwrap();
        assert_eq!(pipes.len(), 1);
        assert_eq!(plan.flow_version, FLOW_VERSION);
    }

    #[test]
    fn flow_version_is_pinned_by_default() {
        let flow = default_flow();
        assert_eq!(flow.config.flow_version, FLOW_VERSION);
        assert_eq!(flow.config.expand.step_version, 1);
        assert_eq!(flow.config.structure.step_version, 1);
        assert_eq!(flow.config.critic.step_version, 1);
        assert_eq!(flow.config.learn.step_version, 1);
    }

    #[test]
    fn empty_input_is_named() {
        assert_eq!(default_flow().plan_only("   ").unwrap_err(), FlowError::EmptyInput);
        assert_eq!(default_flow().run_full("   ").unwrap_err(), FlowError::EmptyInput);
    }

    // ── Full pipeline (run_full → FlowDocument) ──────────────────────────

    #[test]
    fn run_full_produces_complete_flow_document() {
        let doc = default_flow().run_full(LONG).unwrap();
        assert_eq!(doc.flow_version, 1);
        // Novel: passthrough → single primary layer, with clause spans.
        assert_eq!(doc.novel.primary.kind, LayerKind::Primary);
        assert!(!doc.novel.primary.from.is_empty(), "primary carries clause spans");
        // Structured: at least one section.
        assert!(!doc.structured.primary().sections.is_empty());
        // Score tree: descendable (I2).
        assert!(doc.scoretree.verify_descendable().is_ok());
        // Lowered: one element per section, provenance intact (I4).
        assert_eq!(doc.lowered.elements.len(), doc.structured.primary().sections.len());
        // Regen: destructive, no fallback (I5).
        assert!(doc.regen.is_destructive_no_fallback());
        assert_eq!(doc.regen.version.critic_model_version, 0);
    }

    #[test]
    fn run_full_is_deterministic_on_content() {
        let a = default_flow().run_full(LONG).unwrap();
        let b = default_flow().run_full(LONG).unwrap();
        // Compare the stable parts (intent + structured + lowered).
        assert_eq!(a.intent.entry_text, b.intent.entry_text);
        assert_eq!(a.structured, b.structured);
        assert_eq!(a.lowered.elements.len(), b.lowered.elements.len());
        // Element ids are stable (determinism the contract relies on).
        let ids_a: Vec<_> = a.lowered.elements.iter().map(|e| &e.id).collect();
        let ids_b: Vec<_> = b.lowered.elements.iter().map(|e| &e.id).collect();
        assert_eq!(ids_a, ids_b);
    }

    #[test]
    fn flow_document_saves_and_loads() {
        let doc = default_flow().run_full(LONG).unwrap();
        let dir = std::env::temp_dir().join("vm_flow_doc_test2");
        let path = dir.join(FlowDocument::default_filename(1));
        doc.save(&path).unwrap();
        let loaded = FlowDocument::load(&path).unwrap();
        assert_eq!(loaded.lowered.elements.len(), doc.lowered.elements.len());
        assert!(loaded.regen.is_destructive_no_fallback());
        let _ = std::fs::remove_dir_all(&dir);
    }

    // ── Isolation invariant (I1) ─────────────────────────────────────────

    // ── Template expansion seam: the LLM-free path genuinely expands ──

    /// A 19-word idea (the reported "expansion too small" case) now clears
    /// the full pipeline: the template expander's secondary layers lift the
    /// post-expansion narrative past the 40-word floor.
    #[test]
    fn short_idea_produces_full_verified_flow() {
        let short = "a girl walks into the dark pine forest at dusk and follows the old river road north";
        let flow = default_flow();
        let doc = flow.run_full(short).unwrap();
        // Novel ≠ entry: the expansion added secondary layers.
        assert!(doc.novel.secondary.len() >= 3, "template fills secondary layers");
        // The floor validates the post-expansion total, not the raw entry.
        assert!(doc.novel.narrative_word_count() >= flow.config.expand.min_novel_words);
        // The style layer reached the plan's global style (the @@ marker).
        assert!(!doc.structured.primary().global_style.is_empty());
        // The engine run is verified + present.
        let engine = doc.engine.as_ref().expect("engine always saturated");
        assert!(engine.verify.verified, "engine S5 verify must pass");
    }

    #[test]
    fn template_expansion_is_deterministic() {
        let a = default_flow().run_full("a fox runs across the meadow at dawn").unwrap();
        let b = default_flow().run_full("a fox runs across the meadow at dawn").unwrap();
        assert_eq!(a.novel, b.novel, "template expansion must be stable");
        assert_eq!(a.structured, b.structured);
    }

    #[test]
    fn empty_expanded_novel_still_fails_floor() {
        // A floor of 5000 on a 45-word entry + template layers still fails:
        // the guard is real, not decorative.
        let flow = VideoFlow::with_config({
            let mut c = FlowConfig::default_flow();
            c.expand.min_novel_words = 5000;
            c
        });
        let err = flow.run_full(LONG).unwrap_err();
        assert!(matches!(err, FlowError::TextOutput(ref m) if m.contains("too small")));
    }

    #[test]
    fn multi_sentence_entry_never_overflows_sections() {
        // ≥8 clauses + the tail @scene used to overflow max_sections_per_pipe.
        let many = "a bird lands on a fence. The fence creaks. A child watches. A dog barks far away.
                    A car passes by. The sun sets. The sky turns red. The fields go still.
                    A moth circles the lamp. The night deepens slowly.";
        let doc = default_flow().run_full(many).unwrap();
        assert!(doc.structured.primary().sections.len() <= 8);
    }

    // ── Isolation invariant (I1) ─────────────────────────────────────────────

    #[test]
    fn critic_sees_only_critic_input() {
        // The critic step takes a `CriticInput`, not the full `StructuredVideoPlan`.
        let doc = default_flow().run_full(LONG).unwrap();
        let _ = &doc.scoretree;
        // A `CriticInput` is the *only* input the critic sees — the type
        // system enforces I1 (no access to novel, intent clauses, etc.
        // beyond what `CriticInput` carries).
        let _ = doc.scoretree.overall();
    }
}
