//! The **last** step: lower the structured plan into the harness's own
//! *flow elements*, and the **regeneration contract** that says "these
//! elements destructively replace the session's pipes, and here's the exact
//! version triple that produced them."
//!
//! Locked decisions this module codifies:
//! - **I9 (pipes untouched):** the harness emits `FlowElement` — its *own*
//!   generation-ready element structure — NOT `composer::Pipe`. The current
//!   pipe schema is not touched here. (`steps/materialize.rs` remains a
//!   deferred composer-adapter; it is not the mission.)
//! - **I4 (self-sufficient):** every element is lowered *only* from the
//!   `Structured` plan + its `from` provenance. No reference to the current
//!   pipe state, so regeneration is a clean re-derive, not a patch.
//! - **I5 (destructive + versioned):** `RegenerationContract` records the
//!   `(flow_version, step_versions, model_version)` triple that produced the
//!   elements. Destructive replace, `fallback: None` by construction — because
//!   it's destructive, the triple is what makes a replay safe/auditable.
//!
//! Provenance (#8): a `FlowElement` keeps its `from: Vec<SpanId>` links, so
//! "is this element a faithful projection of the user's intent" is answerable
//! by tracing element → structured section → novel span → intent clause.

use crate::generation::video_flow::error::{FlowError, FlowResult};
use crate::generation::video_flow::intent::SpanId;
use crate::generation::video_flow::plan::{StructuredVideoPlan, VideoTag};
use serde::{Deserialize, Serialize};

/// The harness's own generation-ready element — the target of the lowering
/// step. This is "structured content that is viable to generation into
/// elements," decoupled from the composer pipe schema on purpose (I9).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FlowElement {
    /// Stable element id (a `SpanId`-style label).
    pub id: String,
    /// The video-engine tag this element is.
    pub tag: VideoTag,
    /// Frame range within the pipe (pipe-local units).
    pub frame_start: u32,
    pub frame_end: u32,
    /// The element's prompt text.
    pub prompt: String,
    /// Provenance: the structured sections / novel spans this element came from.
    pub from: Vec<SpanId>,
    /// The pipe index this element belongs to (0 in the single-pipe flow).
    pub pipe_index: usize,
}

/// Everything the lowering produced + the provenance trace, so the critic and
/// the regeneration contract can reason about the *result*.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Lowered {
    pub elements: Vec<FlowElement>,
    /// `FlowElement.id` → the structured section id it was lowered from.
    pub trace: Vec<ElementTrace>,
}

/// One element → structured-node provenance link.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementTrace {
    pub element_id: String,
    pub section_id: String,
}

/// Lower a structured plan into flow elements. The rule (I4): each
/// `PlanSection` → one `FlowElement`, carrying the section's `from` spans so
/// provenance survives the lowering. Empty plan / empty sections are named
/// `Lower` errors.
pub fn lower_to_elements(plan: &StructuredVideoPlan) -> FlowResult<Lowered> {
    let mut elements = Vec::new();
    let mut trace = Vec::new();

    for pipe in &plan.pipes {
        if pipe.sections.is_empty() {
            return Err(FlowError::lower(format!(
                "pipe {} has no sections to lower",
                pipe.index
            )));
        }
        for s in &pipe.sections {
            let section_id = section_id(pipe.index, s);
            let element = FlowElement {
                id: section_id.clone(),
                tag: s.tag,
                frame_start: s.frame_start,
                frame_end: s.frame_end,
                prompt: s.prompt.clone(),
                from: s.from.clone(),
                pipe_index: pipe.index,
            };
            trace.push(ElementTrace {
                element_id: element.id.clone(),
                section_id,
            });
            elements.push(element);
        }
    }

    if elements.is_empty() {
        return Err(FlowError::lower("plan lowered to zero elements".to_string()));
    }
    Ok(Lowered { elements, trace })
}

/// A stable, content-derived section id (pipe index + ordinal within pipe).
fn section_id(pipe_index: usize, s: &crate::generation::video_flow::plan::PlanSection) -> String {
    // A stable label keyed on the tag + range, so re-lowering the same plan
    // yields the same ids (the determinism the versioning contract relies on).
    format!(
        "p{}:{}:{}..{}",
        pipe_index,
        s.tag.keyword(),
        s.frame_start,
        s.frame_end
    )
}

/// The version triple a regeneration run records. This is "versioning on
/// early start" (#6): because regeneration is *destructive*, the record of
/// *what produced the result* is what makes replay safe + auditable.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionTriple {
    pub flow_version: u32,
    pub expand_version: u32,
    pub structure_version: u32,
    pub critic_version: u32,
    /// 0 = no local critic model yet (the deterministic `DefaultCritic`).
    pub critic_model_version: u32,
}

/// The regeneration contract: "replace the session's pipes with these
/// regenerated elements; there is no fallback." Carries the version triple so
/// a later replay knows exactly what to reproduce.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegenerationContract {
    pub version: VersionTriple,
    /// The elements that will *destructively replace* the session's pipes.
    pub elements: Vec<FlowElement>,
    /// I5: destructive by construction — there is no fallback path. A present
    /// `fallback` field (always `None` here) is the seam for a future
    /// "keep the old pipes on failure" mode, which the current flow forbids.
    #[serde(default)]
    pub fallback: Option<String>,
}

impl RegenerationContract {
    pub fn new(version: VersionTriple, lowered: &Lowered) -> Self {
        Self {
            version,
            elements: lowered.elements.clone(),
            fallback: None, // I5: destructive, no fallback.
        }
    }

    /// The I5 guarantee: the contract is destructive and never carries a
    /// fallback. Test-pinnable.
    pub fn is_destructive_no_fallback(&self) -> bool {
        self.fallback.is_none()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generation::video_flow::plan::{PlanPipe, PlanSection};
    use crate::generation::video_flow::plan::VideoTag as VT;

    fn plan() -> StructuredVideoPlan {
        StructuredVideoPlan {
            flow_version: 1,
            pipes: vec![PlanPipe {
                index: 0,
                title: "A fox at dusk".into(),
                global_style: "cinematic".into(),
                media_mode: "text".into(),
                sections: vec![
                    PlanSection {
                        tag: VT::Camera,
                        frame_start: 0,
                        frame_end: 24,
                        prompt: "wide tracking shot".into(),
                        from: vec![SpanId::new("clause-0")],
                    },
                    PlanSection {
                        tag: VT::Lighting,
                        frame_start: 24,
                        frame_end: 48,
                        prompt: "long shadows".into(),
                        from: vec![SpanId::new("clause-1")],
                    },
                ],
            }],
        }
    }

    fn triple() -> VersionTriple {
        VersionTriple {
            flow_version: 1,
            expand_version: 1,
            structure_version: 1,
            critic_version: 1,
            critic_model_version: 0,
        }
    }

    #[test]
    fn lowers_one_element_per_section_with_provenance() {
        let lowered = lower_to_elements(&plan()).unwrap();
        assert_eq!(lowered.elements.len(), 2, "one element per structured section");
        // Provenance survives the lowering (I4/#8).
        assert_eq!(
            lowered.elements[0].from,
            vec![SpanId::new("clause-0")],
            "element keeps the section's intent-clause span"
        );
        assert_eq!(lowered.elements[0].tag, VT::Camera);
        assert_eq!(lowered.elements[1].frame_start, 24);
        // The trace links element id → section id (same stable label).
        assert_eq!(lowered.trace.len(), 2);
        assert_eq!(lowered.trace[0].element_id, lowered.trace[0].section_id);
    }

    #[test]
    fn element_ids_are_stable_across_relower() {
        let a = lower_to_elements(&plan()).unwrap();
        let b = lower_to_elements(&plan()).unwrap();
        assert_eq!(
            a.elements.iter().map(|e| &e.id).collect::<Vec<_>>(),
            b.elements.iter().map(|e| &e.id).collect::<Vec<_>>(),
            "same plan -> same element ids (determinism the contract relies on)"
        );
    }

    #[test]
    fn empty_sections_fail_lower_named() {
        let empty = StructuredVideoPlan {
            flow_version: 1,
            pipes: vec![PlanPipe {
                index: 0,
                title: "x".into(),
                global_style: String::new(),
                media_mode: "text".into(),
                sections: Vec::new(),
            }],
        };
        assert!(matches!(
            lower_to_elements(&empty).unwrap_err(),
            FlowError::Lower(_)
        ));
    }

    #[test]
    fn regeneration_contract_is_destructive_no_fallback() {
        let lowered = lower_to_elements(&plan()).unwrap();
        let contract = RegenerationContract::new(triple(), &lowered);
        assert_eq!(contract.elements.len(), 2);
        assert!(
            contract.is_destructive_no_fallback(),
            "I5: destructive, no fallback by construction"
        );
        // The version triple is recorded (I5/#6).
        assert_eq!(contract.version.critic_model_version, 0, "Phase 0: no local critic model");
    }

    #[test]
    fn contract_is_wire_serializable_with_triple() {
        let lowered = lower_to_elements(&plan()).unwrap();
        let contract = RegenerationContract::new(triple(), &lowered);
        let json = serde_json::to_value(&contract).unwrap();
        assert_eq!(json["version"]["criticModelVersion"], 0);
        assert_eq!(json["elements"].as_array().unwrap().len(), 2);
        let back: RegenerationContract = serde_json::from_value(json).unwrap();
        assert!(back.is_destructive_no_fallback());
    }
}
