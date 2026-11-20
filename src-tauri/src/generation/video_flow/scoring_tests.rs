//! Scoring-seam tests: the text-mutation quality guarantees.
//!
//! These pin what "stable quality" actually means in the engine:
//!
//! 1. **Descendable math (I2)** — for ANY `ScoreTree`, `overall` equals the
//!    combinator applied to the leaves. Property-tested over random trees.
//! 2. **Named failure** — a tree whose stored score contradicts its leaves
//!    fails `verify_descendable` with a `Critic` error naming the node.
//! 3. **Version-stable replay** — the same text run through the pipeline at a
//!    recorded `VersionTriple` reproduces the exact same `ScoreTree` and
//!    element set. This is what makes "did quality drift when I mutated the
//!    pipeline?" a checkable question, not an eyeball call.

use crate::generation::video_flow::config::{FlowConfig, ScoreCombinator};
use crate::generation::video_flow::critic::{
    Critic, CriticInput, CriticSectionView, DefaultCritic, NodeKind, ScoreNode, ScoreTree,
};
use crate::generation::video_flow::error::FlowError;
use crate::generation::video_flow::regen::{lower_to_elements, VersionTriple};
use crate::generation::video_flow::steps::structure_plan;

// ── 1. Descendable math over random trees ─────────────────────────────────────

/// Deterministic 32-bit LCG so property tests repeat identically across runs
/// and machines (no external crate).
struct Lcg(u32);
impl Lcg {
    fn new(seed: u32) -> Self {
        Self(seed)
    }
    fn next_f64(&mut self) -> f64 {
        self.0 = self.0.wrapping_mul(1_664_525).wrapping_add(1_014_904_223);
        self.0 as f64 / u32::MAX as f64
    }
}

/// Build a random tree whose non-leaf scores are CORRECT by construction.
fn random_correct_tree(rng: &mut Lcg, depth: u32, comb: &ScoreCombinator) -> ScoreNode {
    if depth == 0 {
        return ScoreNode {
            id: format!("leaf{}", rng.next_f64() as u32),
            kind: NodeKind::Section,
            score: rng.next_f64(),
            // Keep weights in [0,1] so the `Weighted` combinator is genuinely
            // exercised (the production `clamp01` would flatten >1 weights).
            weight: rng.next_f64(),
            children: Vec::new(),
        };
    }
    let mut children = Vec::new();
    for _ in 0..1 + rng.next_f64() as usize * 3 {
        children.push(random_correct_tree(rng, depth - 1, comb));
    }
    // Compute the correct derived score for this node. `collapse_public` works
    // over a node's children, so hand it a throwaway node carrying `children`
    // (its own `score` is ignored once it has children).
    let carrier = ScoreNode {
        id: String::new(),
        kind: NodeKind::Element,
        score: 0.0,
        weight: 1.0,
        children: children.clone(),
    };
    let derived = collapse_public(carrier, comb);
    ScoreNode {
        id: format!("node{}", rng.next_f64() as u32),
        kind: NodeKind::Element,
        score: derived,
        weight: 1.0,
        children,
    }
}

/// Public mirror of the collapse math (mean/min/weighted) used to build
/// correct-by-construction trees.
fn collapse_public(node: ScoreNode, comb: &ScoreCombinator) -> f64 {
    if node.children.is_empty() {
        return node.score.clamp(0.0, 1.0);
    }
    let kids: Vec<f64> = node
        .children
        .iter()
        .map(|c| collapse_public(c.clone(), comb))
        .collect();
    match comb {
        ScoreCombinator::Mean => kids.iter().sum::<f64>() / kids.len() as f64,
        ScoreCombinator::Min => kids.iter().cloned().fold(f64::MAX, f64::min),
        ScoreCombinator::Weighted => {
            let wsum: f64 = node
                .children
                .iter()
                .map(|c| c.weight.clamp(0.0, 1.0))
                .sum();
            if wsum == 0.0 {
                kids.iter().sum::<f64>() / kids.len() as f64
            } else {
                node.children
                    .iter()
                    .enumerate()
                    .map(|(i, c)| kids[i].clamp(0.0, 1.0) * c.weight.clamp(0.0, 1.0))
                    .sum::<f64>()
                    / wsum
            }
        }
    }
}

#[test]
fn property_random_correct_trees_are_descendable() {
    for comb in [ScoreCombinator::Mean, ScoreCombinator::Min, ScoreCombinator::Weighted] {
        let mut rng = Lcg::new(0xC0FFEE);
        for trial in 0..200 {
            let root = random_correct_tree(&mut rng, 3, &comb);
            let tree = ScoreTree {
                step_version: 1,
                combinator: comb,
                root,
            };
            tree.verify_descendable()
                .unwrap_or_else(|e| panic!(
                    "trial {trial} with {comb:?}: correct tree failed verify_descendable: {e:?}"
                ));
        }
    }
}

#[test]
fn property_random_broken_trees_are_caught() {
    // A tree with a single leaf's score perturbed must always be caught.
    for comb in [ScoreCombinator::Mean, ScoreCombinator::Min] {
        let mut rng = Lcg::new(0xBEEF);
        let mut caught_any = false;
        for _ in 0..200 {
            let mut root = random_correct_tree(&mut rng, 2, &comb);
            // Perturb every leaf by a visible amount.
            perturb_leaves(&mut root, 0.37);
            let tree = ScoreTree {
                step_version: 1,
                combinator: comb,
                root: root.clone(),
            };
            if tree.verify_descendable().is_err() {
                caught_any = true;
            } else {
                // If this happened the invariant is vacuous — must never occur.
                panic!("perturbed tree passed verify_descendable under {comb:?}");
            }
        }
        assert!(caught_any, "perturbation was never caught under {comb:?}");
    }
}

fn perturb_leaves(node: &mut ScoreNode, delta: f64) {
    if node.children.is_empty() {
        node.score = (node.score + delta).clamp(0.0, 1.0);
    } else {
        for c in &mut node.children {
            perturb_leaves(c, delta);
        }
    }
}

// ── 2. Named failure carries the offending node id ──────────────────────────

#[test]
fn descendable_failure_names_the_offending_node() {
    let tree = ScoreTree {
        step_version: 1,
        combinator: ScoreCombinator::Mean,
        root: ScoreNode {
            id: "root".into(),
            kind: NodeKind::Element,
            score: 0.9, // wrong: mean(0.5, 0.5) = 0.5
            weight: 1.0,
            children: vec![
                ScoreNode {
                    id: "s0".into(),
                    kind: NodeKind::Section,
                    score: 0.5,
                    weight: 1.0,
                    children: vec![],
                },
                ScoreNode {
                    id: "s1".into(),
                    kind: NodeKind::Section,
                    score: 0.5,
                    weight: 1.0,
                    children: vec![],
                },
            ],
        },
    };
    let err = tree.verify_descendable().unwrap_err();
    match err {
        FlowError::Critic(msg) => {
            assert!(msg.contains("root"), "error must name the offending node, got: {msg}")
        }
        other => panic!("expected FlowError::Critic, got {other:?}"),
    }
}

// ── 3. Version-stable replay ──────────────────────────────────────────────────

const REPLAY_TEXT: &str = "# A fox at dusk\n\
    @@ cinematic, warm golden hour\n\
    @camera:0-24\n\
    wide tracking shot across the meadow\n\
    @lighting:24-48\n\
    sunset, long shadows";

fn score_tree_for(text: &str, triple: &VersionTriple) -> ScoreTree {
    let cfg = FlowConfig::default_flow();
    let plan = structure_plan(text, &cfg.structure, triple.flow_version).unwrap();
    let input = CriticInput {
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
        intent_clauses: vec!["A girl walks into a forest.".into()],
    };
    DefaultCritic.score(&input, &cfg.critic).unwrap()
}

fn elements_for(text: &str, triple: &VersionTriple) -> Vec<crate::generation::video_flow::regen::FlowElement> {
    let cfg = FlowConfig::default_flow();
    let plan = structure_plan(text, &cfg.structure, triple.flow_version).unwrap();
    lower_to_elements(&plan).unwrap().elements
}

#[test]
fn same_text_same_triple_replays_identical_scores() {
    let triple = VersionTriple {
        flow_version: 1,
        expand_version: 1,
        structure_version: 1,
        critic_version: 1,
        critic_model_version: 0,
    };
    let a = score_tree_for(REPLAY_TEXT, &triple);
    let b = score_tree_for(REPLAY_TEXT, &triple);
    assert_eq!(a, b, "replay at the same triple must reproduce the identical tree");
    assert!(a.verify_descendable().is_ok());
    assert_eq!(a.step_version, triple.critic_version);
}

#[test]
fn same_text_same_triple_replays_identical_elements() {
    let triple = VersionTriple {
        flow_version: 1,
        expand_version: 1,
        structure_version: 1,
        critic_version: 1,
        critic_model_version: 0,
    };
    let ea = elements_for(REPLAY_TEXT, &triple);
    let eb = elements_for(REPLAY_TEXT, &triple);
    let ids_a: Vec<_> = ea.iter().map(|e| &e.id).collect();
    let ids_b: Vec<_> = eb.iter().map(|e| &e.id).collect();
    assert_eq!(ids_a, ids_b, "replay must reproduce the same element ids");
    assert_eq!(ea, eb, "replay must reproduce the identical element set");
}

#[test]
fn overall_score_is_the_average_of_section_scores() {
    let triple = VersionTriple {
        flow_version: 1,
        expand_version: 1,
        structure_version: 1,
        critic_version: 1,
        critic_model_version: 0,
    };
    let tree = score_tree_for(REPLAY_TEXT, &triple);
    let leaves: Vec<f64> = tree.leaves().iter().map(|l| l.score).collect();
    let expected_mean = leaves.iter().sum::<f64>() / leaves.len() as f64;
    assert!(
        (tree.overall() - expected_mean).abs() < 1e-9,
        "overall must equal the combinator (mean) of leaf scores"
    );
}


