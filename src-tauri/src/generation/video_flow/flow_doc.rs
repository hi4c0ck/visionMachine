//! The *session-space* flow document — the single persisted artifact that
//! records every layer of a flow run, so the session is the domain and all
//! harness data lives *with it* (by demand, #5).
//!
//! One `FlowDocument` per flow run:
//! - `intent` — the ground-truth snapshot (what the user typed).
//! - `novel` — the layered narrative (primary + secondary + ambient).
//! - `structured` — the video-engine-language plan (sections + provenance).
//! - `scoretree` — the descendable critic output (overall = combinator(leaves)).
//! - `lowered` — the harness's own `FlowElement`s + element→section trace.
//! - `regen` — the destructive `RegenerationContract` (version triple + no
//!   fallback) that will replace the session's pipes.
//!
//! Persisted as `flow/flow.v{FLOW_VERSION}.json` under the session root
//! (reusing `media::write_json`). Because it carries the full version triple,
//! a later destructive regeneration is *replayable*: the same doc → the same
//! elements → the same pipes, bit-for-bit, whenever the versions match.

use crate::generation::video_flow::critic::ScoreTree;
use crate::generation::video_flow::intent::IntentSnapshot;
use crate::generation::video_flow::learn::ModelHandle;
use crate::generation::video_flow::novel::Novel;
use crate::generation::video_flow::plan::StructuredVideoPlan;
use crate::generation::video_flow::regen::{Lowered, RegenerationContract};
use serde::{Deserialize, Serialize};
use std::path::Path;

/// The complete, persisted, triple-versioned session-space flow document.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlowDocument {
    /// Which flow contract produced this doc (the outermost version).
    pub flow_version: u32,
    /// The intent snapshot (ground truth).
    pub intent: IntentSnapshot,
    /// The layered narrative (expand step output).
    pub novel: Novel,
    /// The structured plan (structure step output).
    pub structured: StructuredVideoPlan,
    /// The descendable score tree (critic step output).
    pub scoretree: ScoreTree,
    /// The lowered flow elements + trace (lowering step output).
    pub lowered: Lowered,
    /// The destructive regeneration contract (what will replace the pipes).
    pub regen: RegenerationContract,
    /// The critic model handle that produced the score tree (0/untrained in
    /// Phase 0; a trained build in later phases).
    #[serde(default)]
    pub critic_model: Option<ModelHandle>,
}

impl FlowDocument {
    /// The version triple this document was produced under (mirrors the
    /// `RegenerationContract.version` so the doc is self-describing).
    pub fn version_triple(&self) -> &crate::generation::video_flow::regen::VersionTriple {
        &self.regen.version
    }

    /// Write this document to a session-space path (creating parent dirs).
    /// Reuses the media module's `write_json` helper so the on-disk shape is
    /// identical to the rest of the session's media artifacts.
    pub fn save(&self, path: &Path) -> Result<(), std::io::Error> {
        let json = serde_json::to_vec_pretty(self)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(path, json)?;
        Ok(())
    }

    /// Load a flow document from a session-space path.
    pub fn load(path: &Path) -> Result<Self, std::io::Error> {
        let bytes = std::fs::read(path)?;
        serde_json::from_slice(&bytes)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))
    }

    /// The session-space filename for this document's flow version:
    /// `flow.v{N}.json` (so multiple flow versions coexist under a session).
    pub fn default_filename(flow_version: u32) -> String {
        format!("flow.v{flow_version}.json")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generation::video_flow::critic::{Critic, CriticInput, DefaultCritic};
    use crate::generation::video_flow::config::FlowConfig;
    use crate::generation::video_flow::intent::IntentSnapshot;
    use crate::generation::video_flow::learn::{ModelResolver, StubModelResolver};
    use crate::generation::video_flow::novel::{LayeredExpander, PassthroughLayeredExpander};
    use crate::generation::video_flow::regen::{lower_to_elements, RegenerationContract, VersionTriple};
    use crate::generation::video_flow::structure_plan;

    /// 45 words to clear the default expand floor.
    const LONG: &str = "a red fox darts through the tall pine forest at dusk as golden light \
                        spills across the meadow and a distant river catches the fading sun in \
                        long slow reflections while the wind moves the dry grass and the whole \
                        valley settles into quiet evening";

    fn build_doc() -> FlowDocument {
        let cfg = FlowConfig::default_flow();

        // Intent (ground truth).
        let intent = IntentSnapshot::new(LONG);

        // Expand (Passthrough stub).
        let novel = PassthroughLayeredExpander.expand(&intent, &cfg.expand).unwrap();

        // Structure (marker structurer over the flat novel text).
        // We pass a marker-structured text (the deterministic path):
        let marker_text = format!(
            "# A fox at dusk\n@@ cinematic, warm golden hour\n\
             @camera:0-24\nwide tracking shot across the meadow\n\
             @lighting:24-48\nlong shadows in the fading sun\n\
             @transition:48-60\nsoft dissolve into the river"
        );
        let structured = structure_plan(&marker_text, &cfg.structure, cfg.flow_version).unwrap();

        // Critic (DefaultCritic stub).
        let critic_input = CriticInput {
            sections: structured
                .primary()
                .sections
                .iter()
                .enumerate()
                .map(|(i, s)| crate::generation::video_flow::critic::CriticSectionView {
                    id: format!("s{i}"),
                    prompt: s.prompt.clone(),
                })
                .collect(),
            intent_clauses: intent.clauses.iter().map(|c| c.text.clone()).collect(),
        };
        let scoretree = DefaultCritic.score(&critic_input, &cfg.critic).unwrap();

        // Lower (into the harness's own elements).
        let lowered = lower_to_elements(&structured).unwrap();

        // Regeneration contract (destructive, version triple).
        let triple = VersionTriple {
            flow_version: cfg.flow_version,
            expand_version: cfg.expand.step_version,
            structure_version: cfg.structure.step_version,
            critic_version: cfg.critic.step_version,
            critic_model_version: 0,
        };
        let regen = RegenerationContract::new(triple, &lowered);

        // Critic model handle (stub = untrained in Phase 0).
        let critic_model =
            StubModelResolver.resolve(
                crate::generation::video_flow::learn::ModelRole::Critic,
                0,
                cfg.learn.model_root.as_deref(),
            );

        FlowDocument {
            flow_version: cfg.flow_version,
            intent,
            novel,
            structured,
            scoretree,
            lowered,
            regen,
            critic_model: Some(critic_model),
        }
    }

    #[test]
    fn flow_document_carries_all_layers() {
        let doc = build_doc();
        assert_eq!(doc.flow_version, 1);
        assert_eq!(doc.novel.primary.kind, crate::generation::video_flow::novel::LayerKind::Primary);
        assert_eq!(doc.structured.primary().sections.len(), 3, "3 marker sections");
        assert_eq!(doc.lowered.elements.len(), 3, "one element per section");
        assert!(doc.regen.is_destructive_no_fallback());
        assert!(doc.critic_model.as_ref().unwrap().untrained, "Phase 0: stub model");
        // The score tree is descendable (I2).
        assert!(doc.scoretree.verify_descendable().is_ok());
    }

    #[test]
    fn flow_document_round_trips_through_json() {
        let doc = build_doc();
        let json = serde_json::to_value(&doc).unwrap();
        let back: FlowDocument = serde_json::from_value(json).unwrap();
        assert_eq!(back.lowered.elements.len(), doc.lowered.elements.len());
        assert_eq!(back.regen.version.critic_model_version, 0);
        // The version triple survives.
        assert_eq!(back.version_triple(), doc.version_triple());
    }

    #[test]
    fn default_filename_is_versioned() {
        assert_eq!(FlowDocument::default_filename(1), "flow.v1.json");
        assert_eq!(FlowDocument::default_filename(3), "flow.v3.json");
    }

    #[test]
    fn save_and_load_round_trip_on_temp_path() {
        let doc = build_doc();
        let dir = std::env::temp_dir().join("vm_flow_doc_test");
        let path = dir.join(FlowDocument::default_filename(1));
        doc.save(&path).unwrap();
        let loaded = FlowDocument::load(&path).unwrap();
        assert_eq!(loaded.lowered.elements.len(), doc.lowered.elements.len());
        assert!(loaded.regen.is_destructive_no_fallback());
        // Cleanup.
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn intent_clauses_are_decomposed() {
        let doc = build_doc();
        // The LONG text has no sentence terminators in the test string →
        // it's one clause. The marker text's title "A fox at dusk" is a
        // separate intent.
        assert!(!doc.intent.clauses.is_empty());
        assert!(doc.intent.refs.is_empty(), "no refs in the deterministic test");
        // The doc's intent clauses are the ones from the entry text, not the
        // marker title (the marker is a structure-step detail).
        assert_eq!(doc.intent.clauses.len(), 1, "the LONG text has no .?! → 1 clause");
    }
}
