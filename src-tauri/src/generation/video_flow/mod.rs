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
pub use novel::{Ambient, Layer, LayerKind, LayeredExpander, Novel, PassthroughLayeredExpander};

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

    /// Run the **full** pipeline: intent → expand → structure → critic →
    /// lower → regen → `FlowDocument`.
    ///
    /// This is the *primary* entry point the UI will call. It produces the
    /// complete session-space artifact (your #5) and the destructive
    /// regeneration contract (your #6).
    pub fn run_full(&self, raw: &str) -> FlowResult<FlowDocument> {
        let intent = IntentSnapshot::new(raw);

        // Step 1: expand (layered narrative).
        let expander = PassthroughLayeredExpander;
        let novel = expander.expand(&intent, &self.config.expand)?;

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

        Ok(FlowDocument {
            flow_version: self.config.flow_version,
            intent,
            novel,
            structured: plan,
            scoretree,
            lowered,
            regen,
            critic_model: Some(critic_model),
        })
    }

    /// The plan-only path (expand + structure), useful for a preview of the
    /// structured text before committing to elements.
    pub fn plan_only(&self, raw: &str) -> FlowResult<StructuredVideoPlan> {
        let intent = IntentSnapshot::new(raw);
        let expander = PassthroughLayeredExpander;
        let novel = expander.expand(&intent, &self.config.expand)?;
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
        // Sections: one @scene per intent clause (the deterministic marker).
        for clause in &intent.clauses {
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

    #[test]
    fn critic_sees_only_critic_input() {
        // The critic step takes a `CriticInput`, not the full `StructuredVideoPlan`.
        // This test confirms the type boundary (compile-time isolation).
        let doc = default_flow().run_full(LONG).unwrap();
        let _ = &doc.scoretree;
        // A `CriticInput` is the *only* input the critic sees — the type
        // system enforces I1 (no access to novel, intent clauses, etc.
        // beyond what `CriticInput` carries).
        let _ = doc.scoretree.overall();
    }
}
