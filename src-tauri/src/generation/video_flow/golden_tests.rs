//! Golden-file tests that byte-pin every major seam of the text-mutation pipeline.
//!
//! Regenerate fixtures (run explicitly):
//!   cargo test --ignored regenerate_golden_fixtures
//!
//! Normal run: `cargo test video_flow` — all golden tests compare live output
//! against the committed fixtures. Any drift in a seam format fails loudly.

use crate::generation::video_flow::config::FlowConfig;
use crate::generation::video_flow::intent::IntentSnapshot;
use crate::generation::video_flow::novel::{LayeredExpander, Novel, PassthroughLayeredExpander};
use crate::generation::video_flow::plan::StructuredVideoPlan;
use crate::generation::video_flow::regen::{lower_to_elements, Lowered, RegenerationContract, VersionTriple};
use crate::generation::video_flow::steps::{expand_raw_text, structure_plan, ExpandResult, PassthroughExpander};

fn fixture_dir() -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("fixtures").join("video_flow")
}

fn read_fixture(name: &str) -> String {
    std::fs::read_to_string(fixture_dir().join(name))
        .unwrap_or_else(|e| panic!("missing fixture '{name}': {e}"))
}

fn write_fixture(name: &str, content: &str) {
    let path = fixture_dir().join(name);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(&path, content).unwrap();
}

/// 45 words — clears the default `min_novel_words: 40` floor.
const EXPAND_INPUT: &str = "a red fox darts through the tall pine forest at dusk as golden light \
                            spills across the meadow and a distant river catches the fading sun in \
                            long slow reflections while the wind moves the dry grass and the whole \
                            valley settles into quiet evening";

/// Marker-structured narrative fed into `structure_plan`.
const STRUCTURE_INPUT: &str = "# A fox at dusk\n\
    @@ cinematic, warm golden hour\n\
    @camera:0-24\n\
    wide tracking shot across the meadow\n\
    a red fox darts forward\n\
    @lighting:24-48\n\
    sunset, long shadows\n\
    the river glints in the fading sun";

// ── Fixture regeneration (run with --ignored) ─────────────────────────────────

#[test]
#[ignore = "run explicitly to (re)generate golden fixtures: cargo test --ignored regenerate_golden_fixtures"]
fn regenerate_golden_fixtures() {
    let cfg = FlowConfig::default_flow();

    // expand_raw_text → ExpandResult
    let expand_out = expand_raw_text(EXPAND_INPUT, &PassthroughExpander, &cfg.expand).unwrap();
    write_fixture("expand_golden.json", &serde_json::to_string_pretty(&expand_out).unwrap());

    // layered novel (PassthroughLayeredExpander) → Novel
    let intent = IntentSnapshot::new(EXPAND_INPUT);
    let novel = PassthroughLayeredExpander.expand(&intent, &cfg.expand).unwrap();
    write_fixture("novel_golden.json", &serde_json::to_string_pretty(&novel).unwrap());

    // structure_plan → StructuredVideoPlan
    let plan = structure_plan(STRUCTURE_INPUT, &cfg.structure, cfg.flow_version).unwrap();
    write_fixture("structure_golden.json", &serde_json::to_string_pretty(&plan).unwrap());

    // lower_to_elements → Lowered
    let lowered = lower_to_elements(&plan).unwrap();
    write_fixture("lower_golden.json", &serde_json::to_string_pretty(&lowered).unwrap());

    // RegenerationContract (triple + elements, no fallback)
    let triple = VersionTriple {
        flow_version: cfg.flow_version,
        expand_version: cfg.expand.step_version,
        structure_version: cfg.structure.step_version,
        critic_version: cfg.critic.step_version,
        critic_model_version: 0,
    };
    let contract = RegenerationContract::new(triple, &lowered);
    write_fixture("contract_golden.json", &serde_json::to_string_pretty(&contract).unwrap());

    println!("All golden fixtures regenerated under {}/fixtures/video_flow/", env!("CARGO_MANIFEST_DIR"));
}

// ── Byte-pinning golden tests (run on every normal `cargo test`) ────────────

/// Seam 1: `expand_raw_text` output is byte-stable.
#[test]
fn golden_expand_result() {
    let cfg = FlowConfig::default_flow();
    let live = expand_raw_text(EXPAND_INPUT, &PassthroughExpander, &cfg.expand).unwrap();
    let golden: ExpandResult = serde_json::from_str(&read_fixture("expand_golden.json")).unwrap();
    assert_eq!(live, golden, "expand seam drifted from golden fixture");
}

/// Seam 2: `PassthroughLayeredExpander` (Novel) output is byte-stable.
#[test]
fn golden_novel() {
    let cfg = FlowConfig::default_flow();
    let intent = IntentSnapshot::new(EXPAND_INPUT);
    let live = PassthroughLayeredExpander.expand(&intent, &cfg.expand).unwrap();
    let golden: Novel = serde_json::from_str(&read_fixture("novel_golden.json")).unwrap();
    assert_eq!(live, golden, "novel seam drifted from golden fixture");
}

/// Seam 3: `structure_plan` (StructuredVideoPlan) output is byte-stable.
#[test]
fn golden_structure_plan() {
    let cfg = FlowConfig::default_flow();
    let live = structure_plan(STRUCTURE_INPUT, &cfg.structure, cfg.flow_version).unwrap();
    let golden: StructuredVideoPlan = serde_json::from_str(&read_fixture("structure_golden.json")).unwrap();
    assert_eq!(live, golden, "structure seam drifted from golden fixture");
}

/// Seam 4: `lower_to_elements` (Lowered) output is byte-stable.
#[test]
fn golden_lowered() {
    let plan: StructuredVideoPlan = serde_json::from_str(&read_fixture("structure_golden.json")).unwrap();
    let live = lower_to_elements(&plan).unwrap();
    let golden: Lowered = serde_json::from_str(&read_fixture("lower_golden.json")).unwrap();
    assert_eq!(live, golden, "lower seam drifted from golden fixture");
}

/// Seam 5: `RegenerationContract` (version triple + elements, no fallback) is byte-stable.
#[test]
fn golden_contract() {
    let cfg = FlowConfig::default_flow();
    let plan: StructuredVideoPlan = serde_json::from_str(&read_fixture("structure_golden.json")).unwrap();
    let lowered = lower_to_elements(&plan).unwrap();
    let triple = VersionTriple {
        flow_version: cfg.flow_version,
        expand_version: cfg.expand.step_version,
        structure_version: cfg.structure.step_version,
        critic_version: cfg.critic.step_version,
        critic_model_version: 0,
    };
    let live = RegenerationContract::new(triple.clone(), &lowered);
    let golden: RegenerationContract = serde_json::from_str(&read_fixture("contract_golden.json")).unwrap();
    assert_eq!(live, golden, "regeneration contract drifted from golden fixture");
    assert_eq!(live.version, triple, "triple embedded in contract");
}
