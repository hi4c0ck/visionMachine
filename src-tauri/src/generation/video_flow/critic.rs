//! The critic step: `Structured` + intent → a **descendable `ScoreTree`**.
//!
//! The "overall" transition-quality number the user sees is **never a free
//! value** — it is always `combinator(leaf scores)`. This is the "descending
//! based on overall" control: open the tree, see which section / element /
//! ambient node scored low, and trace it back to provenance.
//!
//! `DefaultCritic` (this phase) emits a *neutral* tree (every leaf = 0.5,
//! `Mean` combinator → overall = 0.5). The *real* critic is a local model
//! (see `learn.rs`); it implements the same `Critic` trait and produces the
//! same shape. The invariant (I2) holds for *any* critic: overall must equal
//! the combinator applied to the root's direct leaf children.

use crate::generation::video_flow::config::{CriticParams, ScoreCombinator};
use crate::generation::video_flow::error::{FlowError, FlowResult};
use serde::{Deserialize, Serialize};

/// What a score node represents.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NodeKind {
    /// A `Structured` section.
    Section,
    /// A lowered flow element (the final "unit" in the descent).
    Element,
    /// An ambient node (its own dynamic).
    Ambient,
    /// A transition between sections.
    Transition,
}

/// One node in the score tree.
///
/// `score` is the *leaf* score for this node (0..=1). Non-leaf nodes carry a
/// score too, but that score **must equal** `combinator(direct leaf children)`
/// — the invariant the tests pin.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreNode {
    /// Stable id (a `SpanId`-style label or a section ordinal).
    pub id: String,
    pub kind: NodeKind,
    /// Leaf score in 0..=1. For leaf nodes this is the final value.
    pub score: f64,
    /// Weight for `Weighted` combinator (ignored by `Mean`/`Min`).
    #[serde(default = "default_weight")]
    pub weight: f64,
    /// Direct children (empty = leaf).
    #[serde(default)]
    pub children: Vec<ScoreNode>,
}

fn default_weight() -> f64 {
    1.0
}

/// The descendable score structure the critic emits.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreTree {
    pub step_version: u32,
    /// The combinator used to collapse leaves → overall.
    pub combinator: ScoreCombinator,
    /// The single root; `overall` is *derived* from `root` (never stored
    /// separately, so it cannot drift from the leaves).
    pub root: ScoreNode,
}

impl ScoreTree {
    /// The overall transition-quality score. *Derived* from the leaves via
    /// the combinator — never a hand-set value. This is the "descending"
    /// invariant: overall = combinator(all leaf scores under root).
    pub fn overall(&self) -> f64 {
        collapse(&self.root, &self.combinator)
    }

    /// Collect every leaf node (depth-first). A leaf has no children.
    pub fn leaves(&self) -> Vec<&ScoreNode> {
        let mut out = Vec::new();
        collect_leaves(&self.root, &mut out);
        out
    }

    /// Verify the I2 invariant: for every non-leaf node, its stored `score`
    /// equals `combinator(children leaf scores)`. Returns `Ok(())` or a
    /// concrete `Critic` error naming the offending node.
    pub fn verify_descendable(&self) -> FlowResult<()> {
        verify_node(&self.root, &self.combinator, "root")
    }
}

/// Recursively collapse a node's subtree to a single score using `comb`.
///
/// Public: the UI's Scoreboard / golden-baseline capture mirrors this exact
/// math (see `src/lib/directorStore/types.ts::collapse`), and the golden-set
/// command (`director_flag_golden`) collapses each section's critic leaf
/// into its baseline score through it. Keeping one source of truth.
pub fn collapse(node: &ScoreNode, comb: &ScoreCombinator) -> f64 {
    if node.children.is_empty() {
        return clamp01(node.score);
    }
    let child_scores: Vec<f64> = node.children.iter().map(|c| collapse(c, comb)).collect();
    match comb {
        ScoreCombinator::Mean => {
            child_scores.iter().sum::<f64>() / child_scores.len() as f64
        }
        ScoreCombinator::Min => child_scores.iter().cloned().fold(f64::MAX, f64::min),
        ScoreCombinator::Weighted => {
            let wsum: f64 = node
                .children
                .iter()
                .map(|c| clamp01(c.weight))
                .sum();
            if wsum == 0.0 {
                return child_scores.iter().sum::<f64>() / child_scores.len() as f64;
            }
            let weighted: f64 = node
                .children
                .iter()
                .enumerate()
                .map(|(i, c)| clamp01(child_scores[i]) * clamp01(c.weight))
                .sum();
            weighted / wsum
        }
    }
}

fn collect_leaves<'a>(node: &'a ScoreNode, out: &mut Vec<&'a ScoreNode>) {
    if node.children.is_empty() {
        out.push(node);
    } else {
        for c in &node.children {
            collect_leaves(c, out);
        }
    }
}

fn verify_node(node: &ScoreNode, comb: &ScoreCombinator, label: &str) -> FlowResult<()> {
    for c in &node.children {
        verify_node(c, comb, &c.id)?;
    }
    // For a non-leaf: stored score must equal combinator(children scores).
    if !node.children.is_empty() {
        let derived = collapse(node, comb);
        // Tolerance: the combinator is deterministic on the same inputs, so
        // an exact match is expected. Use a tiny epsilon for float safety.
        if (derived - node.score).abs() > 1e-9 {
            return Err(FlowError::Critic(format!(
                "node '{label}' score {} is not combinator(children)={derived}",
                node.score
            )));
        }
    }
    Ok(())
}

fn clamp01(v: f64) -> f64 {
    v.clamp(0.0, 1.0)
}

/// Strategy seam: `Structured` + intent → `ScoreTree`. The local critic model
/// implements this; `DefaultCritic` is the deterministic Phase-0 stub.
pub trait Critic: Send + Sync {
    fn score(&self, input: &CriticInput, cfg: &CriticParams) -> FlowResult<ScoreTree>;
}

/// The critic's input — *only* what the step is allowed to see (isolation
/// invariant I1): the structured plan + the intent snapshot it was built from.
/// No raw novel, no next-step output.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CriticInput {
    /// The structured plan to score (section ids + prompts + ranges).
    pub sections: Vec<CriticSectionView>,
    /// The intent clauses the sections trace back to (for coverage).
    pub intent_clauses: Vec<String>,
}

/// A minimal view of a structured section for the critic (decoupled from the
/// full `Structured` type so the critic can score without the whole object).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CriticSectionView {
    pub id: String,
    pub prompt: String,
}

/// Deterministic Phase-0 critic: every section gets a leaf of `0.5`,
/// combinator from config → overall = 0.5 (Mean) or 0.5 (Min) or 0.5
/// (Weighted, default weights). The shape + invariant are what matter; the
/// real local model replaces the scores later.
pub struct DefaultCritic;

impl Critic for DefaultCritic {
    fn score(&self, input: &CriticInput, cfg: &CriticParams) -> FlowResult<ScoreTree> {
        let children: Vec<ScoreNode> = input
            .sections
            .iter()
            .map(|s| ScoreNode {
                id: s.id.clone(),
                kind: NodeKind::Section,
                score: 0.5,
                weight: 1.0,
                children: Vec::new(),
            })
            .collect();

        // Root: store the *derived* overall (so I2 holds by construction).
        let root = ScoreNode {
            id: "root".into(),
            kind: NodeKind::Element, // root is a virtual aggregation node
            score: collapse(
                &ScoreNode {
                    id: "root".into(),
                    kind: NodeKind::Element,
                    score: 0.0,
                    weight: 1.0,
                    children: children.clone(),
                },
                &cfg.combinator,
            ),
            weight: 1.0,
            children,
        };

        let tree = ScoreTree {
            step_version: cfg.step_version,
            combinator: cfg.combinator,
            root,
        };
        // Verify by construction (will catch any float bug in collapse).
        tree.verify_descendable()?;
        Ok(tree)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input() -> CriticInput {
        CriticInput {
            sections: vec![
                CriticSectionView {
                    id: "s1".into(),
                    prompt: "wide tracking shot".into(),
                },
                CriticSectionView {
                    id: "s2".into(),
                    prompt: "sunset light".into(),
                },
            ],
            intent_clauses: vec!["A girl walks into a forest.".into()],
        }
    }

    fn cfg() -> CriticParams {
        CriticParams::default()
    }

    #[test]
    fn default_critic_produces_neutral_tree() {
        let tree = DefaultCritic.score(&input(), &cfg()).unwrap();
        assert_eq!(tree.overall(), 0.5, "Mean of two 0.5 leaves = 0.5");
        assert_eq!(tree.leaves().len(), 2);
    }

    #[test]
    fn overall_equals_combinator_of_leaves_by_construction() {
        // The I2 invariant: for any tree the critic emits, overall ==
        // combinator(all leaf scores).
        for comb in [
            ScoreCombinator::Mean,
            ScoreCombinator::Min,
            ScoreCombinator::Weighted,
        ] {
            let mut c = cfg();
            c.combinator = comb;
            let tree = DefaultCritic.score(&input(), &c).unwrap();
            let leaves: Vec<f64> = tree.leaves().iter().map(|l| l.score).collect();
            let expected = match comb {
                ScoreCombinator::Mean => leaves.iter().sum::<f64>() / leaves.len() as f64,
                ScoreCombinator::Min => leaves.iter().cloned().fold(f64::MAX, f64::min),
                ScoreCombinator::Weighted => {
                    // Default weights are all 1.0 → same as Mean.
                    leaves.iter().sum::<f64>() / leaves.len() as f64
                }
            };
            assert!((tree.overall() - expected).abs() < 1e-9);
        }
    }

    #[test]
    fn verify_descendable_catches_bad_tree() {
        // A hand-built tree where root.score != combinator(children) fails I2.
        let bad = ScoreTree {
            step_version: 1,
            combinator: ScoreCombinator::Mean,
            root: ScoreNode {
                id: "root".into(),
                kind: NodeKind::Element,
                score: 0.9, // deliberately wrong: mean of (0.5, 0.5) = 0.5
                weight: 1.0,
                children: vec![
                    ScoreNode {
                        id: "a".into(),
                        kind: NodeKind::Section,
                        score: 0.5,
                        weight: 1.0,
                        children: vec![],
                    },
                    ScoreNode {
                        id: "b".into(),
                        kind: NodeKind::Section,
                        score: 0.5,
                        weight: 1.0,
                        children: vec![],
                    },
                ],
            },
        };
        let err = bad.verify_descendable().unwrap_err();
        assert!(matches!(err, FlowError::Critic(ref m) if m.contains("root")));
    }

    #[test]
    fn empty_sections_produce_zero_leaves() {
        let empty = CriticInput {
            sections: Vec::new(),
            intent_clauses: Vec::new(),
        };
        let tree = DefaultCritic.score(&empty, &cfg()).unwrap();
        // Zero children → collapse of empty = 0.0 (guard in collapse).
        assert_eq!(tree.overall(), 0.0);
    }

    #[test]
    fn tree_is_wire_serializable() {
        let tree = DefaultCritic.score(&input(), &cfg()).unwrap();
        let json = serde_json::to_value(&tree).unwrap();
        let back: ScoreTree = serde_json::from_value(json).unwrap();
        assert!((back.overall() - tree.overall()).abs() < 1e-12);
        assert!(back.verify_descendable().is_ok(), "round-tripped tree still descendable");
    }
}
