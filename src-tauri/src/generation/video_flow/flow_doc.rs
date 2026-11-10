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
use crate::generation::video_flow::engine::seed::EngineRun;
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
    /// The S0→S5 engine run (absorbed from `harness/`). `None` for docs
    /// produced before the engine landed, or when the run was entry-less.
    /// `#[serde(default)]` keeps old `flow.v{N}.json` files loading verbatim.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub engine: Option<EngineRun>,
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

    /// DIAGNOSTIC (local only, `#[ignore]`): run the real `FlowDocument`
    /// deserializer against the real on-disk `flow.v*.json` files under a
    /// session flow dir and print the EXACT serde error for any that fail.
    /// This is the definitive probe for the "generated data disappears after
    /// restart" bug: if a persisted doc fails to deserialize under the
    /// current reader, `director_list_flows` skips it (now logged WARN),
    /// and when EVERY doc in a session fails, the panel falls back to the
    /// G0 draft ("initial prompt again").
    ///
    /// Run locally against your own session dirs:
    ///   set VM_PROBE_ROOTS=C:\...\Session 3\flow;C:\...\twist sw\flow
    ///   cargo test probe_real_flow_files -- --ignored --nocapture
    /// With no env set, the test is a no-op success.
    #[test]
    #[ignore]
    fn probe_real_flow_files() {
        let roots: Vec<String> = std::env::var("VM_PROBE_ROOTS")
            .map(|s| s.split(';').map(|r| r.trim().to_string()).filter(|r| !r.is_empty()).collect())
            .unwrap_or_default();
        if roots.is_empty() {
            println!("[probe] VM_PROBE_ROOTS unset — no-op pass");
            return;
        }
        for root in &roots {
            let dir = std::path::Path::new(root);
            if !dir.is_dir() {
                println!("[probe] skip (missing dir): {}", root);
                continue;
            }
            let is_flow = |p: &std::path::Path| -> bool {
                p.file_name()
                    .and_then(|n| n.to_str())
                    .map_or(false, |n| {
                        n.starts_with("flow.v")
                            && n.ends_with(".json")
                            && n != "flow.v0.json"
                    })
            };
            let mut files: Vec<std::path::PathBuf> = std::fs::read_dir(dir)
                .map(|rd| rd.flatten().map(|e| e.path()).collect::<Vec<_>>())
                .unwrap_or_default()
                .into_iter()
                .filter(|p| is_flow(p))
                .collect();
            files.sort();
            println!("[probe] {} → {} flow files", root, files.len());
            for p in &files {
                let name = p.file_name().unwrap().to_string_lossy().into_owned();
                match FlowDocument::load(p) {
                    Ok(doc) => {
                        println!(
                            "[probe]   OK   {} (engine={})",
                            name,
                            doc.engine.is_some()
                        );
                    }
                    Err(e) => {
                        let raw = std::fs::read(p).unwrap_or_default();
                        let err: String = match serde_json::from_slice::<FlowDocument>(&raw) {
                            Ok(_) => "load io error, not serde".to_string(),
                            Err(se) => se.to_string(),
                        };
                        let _ = e; // the io error is superseded by the exact serde error
                        println!("[probe]   FAIL {} → {}", name, err);
                    }
                }
            }
        }
    }
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
            engine: None,
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
