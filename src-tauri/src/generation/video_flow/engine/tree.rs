//! S0.5 — the STRUCTURAL TREE: a deterministic, LLM-free "brain" layer that
//! decomposes the S0 idea into a structural skeleton BEFORE the novel is
//! written (template) or requested (LLM brief).
//!
//! Design rule (agreed with the author): the tree is a BRIEF, not a cage.
//! It fixes the *shape* — scene count, per-branch roles, energy curve,
//! per-boundary transition intent, a coherent color-temperature arc, and the
//! auto-derived scale — but it leaves all prose, environment, character,
//! and beats to the content source (the LLM novel or the template novel).
//! Every value the tree emits is a member of the closed `TagVocabulary`,
//! and every derived scale obeys the engine caps (`CLIP_S`, `SHOTS_PER_SCENE_MAX`,
//! `SCENES_MAX`), so a tree-carrying run stays S5-verifiable by construction.
//!
//! The manual-override rule: `TreeOverrides` carries optional user pins.
//! An absent override = the tree's auto value wins; a present override wins
//! over the auto value. New docs carry `EngineRun.tree` (serde default → old
//! docs load `None` and keep the legacy per-shot cycling tables, byte-stable).

use crate::generation::video_flow::engine::seed::{EngineEntry, MoodProfile};
use crate::generation::video_flow::engine::tag_vocabulary::TagVocabulary;
use crate::generation::video_flow::engine::types::{
    CameraConcern, LensConcern, MotionConcern, SeedScale,
};
use crate::generation::video_flow::intent::IntentSnapshot;
use serde::{Deserialize, Serialize};

/// Wire discriminator for the tree (v2 can evolve the shape without breaking
/// v1 docs, exactly like `SeedCard.v` / `EngineRun.expansion`).
pub const TREE_VERSION: u32 = 1;

/// The main narrative driver of the film (a closed classification). The tree
/// derives one from the idea + genre keyword scan; the user can override it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum Driver {
    /// "chase / fight / escape / battle" content → kinetic structure.
    Action,
    /// "quiet / lonely / dream / silent / vast" → atmosphere carries it.
    Atmosphere,
    /// a principal named / focused ("Vader", "the girl", "he") → character arc.
    Character,
    /// "journey / travel / explore / search / cross" → exploration.
    Exploration,
    /// No strong signal → the neutral default (atmosphere-ish). The wire
    /// name is "neutral" (matching `as_str()` / `parse()` / the TS `Driver`
    /// union), NOT the variant-serialized "unknown" — so `tree.root.driver`
    /// round-trips to the value the UI + the LLM brief both expect.
    #[default]
    #[serde(rename = "neutral")]
    Unknown,
}

impl Driver {
    pub fn as_str(self) -> &'static str {
        match self {
            Driver::Action => "action",
            Driver::Atmosphere => "atmosphere",
            Driver::Character => "character",
            Driver::Exploration => "exploration",
            Driver::Unknown => "neutral",
        }
    }

    /// Closed-vocab parse for a user override (lowercased, trimmed).
    pub fn parse(s: &str) -> Option<Self> {
        match s.trim().to_lowercase().as_str() {
            "action" => Some(Self::Action),
            "atmosphere" => Some(Self::Atmosphere),
            "character" => Some(Self::Character),
            "exploration" => Some(Self::Exploration),
            "neutral" | "" => Some(Self::Unknown),
            _ => None,
        }
    }
}

/// One branch (a scene/act) of the tree.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct TreeBranch {
    /// The closed narrative role ("establishing" | "developing" | "turn" | "resolving").
    pub role: String,
    /// Auto-derived shot count (≤ `SHOTS_PER_SCENE_MAX`), overridable.
    pub shots: u32,
    /// The idea content this branch owns (an `idea_units`-style fragment,
    /// round-robin — never a repeated tail).
    pub narrative: String,
    /// Per-boundary transition intent (closed vocab; branch 0 is "hard_cut").
    pub transition_in: String,
    pub transition_out: String,
    /// The structural (not prose) leaves: one per shot.
    pub leaves: Vec<TreeLeaf>,
    /// This branch's open/close color-temperature pair (chained to the
    /// previous branch's close — no flicker at the cut).
    pub temp_open_k: u32,
    pub temp_close_k: u32,
    /// 0..=1 — drives the transition choice + clip emphasis.
    pub energy: f32,
}

/// One leaf (a shot slot). STRUCTURAL intent only — never novel prose. The
/// content source (template/LLM) writes the prose; the leaf tells it where
/// the story should go.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct TreeLeaf {
    /// A short structural intent, e.g. "subject crosses the threshold".
    pub intent: String,
    /// Closed camera role: "establishing_wide" | "holding_medium" |
    /// "intimate_close" | "dynamic_track".
    pub camera_role: String,
    /// Closed motion intent: "slow_push" | "drift" | "static_hold" | "fast_whip".
    pub motion_intent: String,
    /// 1–3 beat hints the content source expands (or the template seeds).
    pub beat_hints: Vec<String>,
}

/// The tree's root: the thesis + driver + target duration + energy curve +
/// the per-branch temperature arc + the continuity thread that carries across
/// cuts.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct TreeRoot {
    /// One line: "what this video should bring".
    pub thesis: String,
    pub driver: Driver,
    /// The auto-derived target total duration (seconds, within the engine's
    /// `CLIP_S` bounds × branch/shot counts).
    pub target_duration_s: u32,
    /// Per-branch energy (0..=1), index-aligned with `StructuralTree.branches`.
    pub energy: Vec<f32>,
    /// Per-branch (open_K, close_K), index-aligned with branches.
    pub temp_arc: Vec<[u32; 2]>,
    /// The "who/where carries across cuts" continuity line.
    pub continuity_thread: String,
}

/// The full structural skeleton.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct StructuralTree {
    pub v: u32,
    pub root: TreeRoot,
    pub branches: Vec<TreeBranch>,
    /// The auto-derived scale (pre-override), so the UI can show "auto 2×3".
    pub auto_scale: SeedScale,
}

/// The manual-override rule: any field present overrides the tree's auto
/// value; any absent field keeps the auto value.
///
/// Wire case is SNAKE_CASE (like the rest of the engine module + the
/// TypeScript mirror in `engine.ts`): the UI writes `shots_per_scene` /
/// `target_duration_s` / `temp_arc`, so Rust MUST read those exact keys —
/// a camelCase attribute here would silently drop multi-word user pins and
/// break the manual-override rule.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct TreeOverrides {
    /// Pinned total scenes (0–`SCENES_MAX`).
    pub scenes: Option<u32>,
    /// Pinned shots-per-scene (1–`SHOTS_PER_SCENE_MAX`).
    pub shots_per_scene: Option<u32>,
    /// Pinned target total duration in seconds (within `CLIP_S` bounds ×
    /// pinned/derived branch counts).
    pub target_duration_s: Option<u32>,
    /// Pinned driver classification.
    pub driver: Option<String>,
    /// Per-boundary transition overrides (index-aligned with
    /// `branches`; an empty entry at index `i` = the branch's `transition_in`
    /// is pinned). `#[serde(default)]`: the UI always serializes the
    /// `overrides` object (even with no pins → `{}`), so an ABSENT key on
    /// the wire must mean "no pins" (empty vec), not a deserialization
    /// failure (the `missing field 'transitions'` regression).
    #[serde(default)]
    pub transitions: Vec<Option<String>>,
    /// Per-branch temperature overrides (`[open_K, close_K]`; `None` = auto).
    /// Same `default` rationale as `transitions`.
    #[serde(default)]
    pub temp_arc: Vec<Option<[u32; 2]>>,
}

// ── Builders + helpers ──────────────────────────────────────────────────────

/// Build the structural tree from the S0 intent + entry + user overrides.
/// Pure, deterministic, no I/O, no LLM.
pub fn build_structural_tree(
    intent: &IntentSnapshot,
    entry: &EngineEntry,
    overrides: &TreeOverrides,
) -> StructuralTree {
    let caps = (
        TagVocabulary::CLIP_S,
        TagVocabulary::SCENES_MAX,
        TagVocabulary::SHOTS_PER_SCENE_MAX,
    );

    // 1) The idea's clause content — the source for fragments, thesis, and
    //    the richness-derived scale SUGGESTION (the #1 fix: the UI can show
    //    "auto N×M" and the user pins instead of hand-typing).
    let clauses: Vec<&str> = intent
        .clauses
        .iter()
        .map(|c| c.text.trim())
        .filter(|c| !c.is_empty())
        .collect();
    let words = intent.entry_text.split_whitespace().count().max(1);
    let suggested = suggest_scale(words, clauses.len(), &caps);

    // 2) The EFFECTIVE run scale: CONTENT-AWARE (the 2026-11-10 seam). An
    //    explicit pin wins; otherwise the untouched G0 default (1×2) adopts
    //    the idea's own structure so branch/shot counts track the run. The
    //    tree *refines* the entry scale — it does not replace it.
    let effective = resolve_run_scale(intent, entry, overrides, &caps);

    // 3) Mood profile (the user's explicit knob; the tree picks *within* caps).
    let mood = MoodProfile::for_mood(entry.mood);

    // 4) Driver: a user pin wins; otherwise the keyword scan over the idea +
    //    genre; otherwise Unknown.
    let driver = overrides
        .driver
        .as_deref()
        .and_then(Driver::parse)
        .or_else(|| driver_from_idea(&intent.entry_text, &entry.genre.name))
        .unwrap_or_default();

    // 5) Branch roles + role-driven energies + transition intents (content-
    //    driven, the #4 fix: each cut's transition is chosen from the energy
    //    delta + mood bias, not a modulo cycle).
    let b = effective.scenes as usize;
    let k = effective.shots_per_scene as usize;
    let roles: Vec<&'static str> = branch_roles(b);
    let energy: Vec<f32> = branch_energies(&roles);
    let trans_in: Vec<String> = branch_transitions(&energy, &mood);

    // 6) Temperature arc (the #3 fix, promoted per-branch: the arc CHAINS —
    //    open[i+1] == close[i] — so a cut in a continuous scene never flickers).
    let temp_arc = build_temp_arc(&energy, entry, overrides, &caps);

    // 7) Thesis + continuity thread + idea fragments (the #2 fix feeds in:
    //    round-robin the real content, never a repeated tail).
    let thesis = first_clause_capped(&clauses, 120);
    let continuity = continuity_thread(&clauses, &entry.genre.name, &entry.time_of_day);
    let frags = distribute_idea_units(&clauses, b * k);

    // 8) Assemble branches + leaves.
    let mut branches: Vec<TreeBranch> = Vec::with_capacity(b);
    for i in 0..b {
        let role = roles[i];
        let en = energy[i];
        let [temp_open, temp_close] =
            overrides.temp_arc.get(i).and_then(|o| *o).unwrap_or(temp_arc[i]);
        let narrative = frags
            .get(i * k)
            .cloned()
            .filter(|f| !f.is_empty())
            .unwrap_or_else(|| "the moment".to_string());

        let t_in = overrides
            .transitions
            .get(i)
            .and_then(|o| o.clone())
            .unwrap_or_else(|| trans_in[i].clone());

        branches.push(TreeBranch {
            role: role.to_string(),
            shots: k as u32,
            narrative,
            transition_in: t_in,
            transition_out: branch_transition_out(i, b, &energy, &mood),
            leaves: build_leaves(role, k, &frags, i),
            temp_open_k: temp_open,
            temp_close_k: temp_close,
            energy: en,
        });
    }

    // 9) Root: target duration = effective scale × the mood band's clip
    //    (clamped to the engine cap), overridable.
    let target_duration_s = overrides
        .target_duration_s
        .unwrap_or_else(|| {
            let clip = mood.clip_range[0].min(caps.0.1);
            (clip * b as u32 * k as u32).clamp(4, 240)
        });

    StructuralTree {
        v: TREE_VERSION,
        root: TreeRoot {
            thesis,
            driver,
            target_duration_s,
            energy: energy.clone(),
            temp_arc: temp_arc.clone(),
            continuity_thread: continuity,
        },
        branches,
        // The richness-derived suggestion the UI shows as "auto"; the run's
        // effective scale is `effective` (stored on the entry/overrides).
        auto_scale: suggested,
    }
}

/// The richness-derived scale SUGGESTION: ~12 words of content per shot,
/// ~2 clauses per scene. Pure — no overrides, no entry; the UI shows it as
/// the "auto" hint and the user may pin instead.
fn suggest_scale(
    words: usize,
    clauses: usize,
    caps: &((u32, u32), u32, u32),
) -> SeedScale {
    let (clip_min, clip_max) = caps.0;
    let max_scenes = caps.1;
    let max_spc = caps.2;
    let auto_shots = ((words / 12 + 1) as u32).clamp(4, 20);
    let auto_scenes = ((clauses / 2 + 1) as u32).clamp(1, max_scenes);
    let auto_spc = ((auto_shots + auto_scenes - 1) / auto_scenes.max(1)).clamp(1, max_spc);
    SeedScale {
        scenes: auto_scenes,
        shots_per_scene: auto_spc,
        clip_s: [clip_min, clip_max],
    }
}

/// The engine caps in one place (single source for every scale resolver).
pub fn tree_caps() -> ((u32, u32), u32, u32) {
    (
        (TagVocabulary::CLIP_S.0, TagVocabulary::CLIP_S.1),
        TagVocabulary::SCENES_MAX,
        TagVocabulary::SHOTS_PER_SCENE_MAX,
    )
}

/// Role-driven dwell weights (the art-director "where the time goes" table).
/// Establishing and the peak (turn) HOLD; developing moves; resolving exits
/// short. The weights drive the per-branch clip distribution (seed.rs) so an
/// episode's duration follows its energy shape, not a flat `band_min`.
pub fn role_dwell_weight(role: &str) -> f32 {
    match role {
        "establishing" => 1.5,
        "turn" => 1.5,
        "developing" => 1.0,
        "resolving" => 0.8,
        _ => 1.0,
    }
}

/// The content-aware run scale — the "real understanding" seam (2026-11-10).
/// The scene/shot counts are derived from the IDEA's structure (clauses/words
/// via `suggest_scale`), not from the frozen G0 default. The rule is SOFT —
/// the target is a budget that steers the shape, never a hard clamp on the
/// user's content:
///
/// 1. An explicit pin (`overrides.scenes` / `overrides.shots_per_scene`)
///    always wins for its field and is never overridden by the budget.
/// 2. When the G0 entry scale is the untouched default (1 scene × 2 shots)
///    and nothing is pinned, the run adopts the content-derived
///    `suggest_scale` — a rich 4-clause idea reads as ~3 scenes, not 1.
/// 3. A pinned `target_duration_s` SOFT-FITS the shape to the budget at the
///    mood band's clip length: needed clips = ceil(target / clip_eff). If the
///    content scale already exceeds the budget it trims shots-per-scene (down
///    to 1 — scenes are content and survive); if it is under, it grows
///    shots-per-scene to the cap, then scenes to the cap. The run lands as
///    close to the target as the closed engine caps allow.
pub fn resolve_run_scale(
    intent: &IntentSnapshot,
    entry: &EngineEntry,
    overrides: &TreeOverrides,
    caps: &((u32, u32), u32, u32),
) -> SeedScale {
    let (clip_min, clip_max) = caps.0;
    let max_scenes = caps.1;
    let max_spc = caps.2;
    let clauses = intent
        .clauses
        .iter()
        .filter(|c| !c.text.trim().is_empty())
        .count();
    let words = intent.entry_text.split_whitespace().count().max(1);
    let suggested = suggest_scale(words, clauses, caps);

    // Rule 1 + 2: pin > (content when the entry is the untouched 1×2 default)
    // > the entry's explicit scale.
    let entry_is_default = entry.scale.scenes == 1 && entry.scale.shots_per_scene == 2;
    let scenes_pinned = overrides.scenes.is_some();
    let spc_pinned = overrides.shots_per_scene.is_some();
    let mut scenes = match overrides.scenes {
        Some(p) => p.clamp(1, max_scenes),
        None if entry_is_default => suggested.scenes.clamp(1, max_scenes),
        None => entry.scale.scenes.clamp(1, max_scenes),
    };
    let mut spc = match overrides.shots_per_scene {
        Some(p) => p.clamp(1, max_spc),
        None if entry_is_default => suggested.shots_per_scene.clamp(1, max_spc),
        None => entry.scale.shots_per_scene.clamp(1, max_spc),
    };

    // Rule 3: the pinned target soft-fits the shape to the budget. The clip
    // the run will actually use is the mood band's min (seed.rs
    // `build_specs_and_timeline`), clamped to the engine cap — so the budget
    // math matches what the producer builds.
    if let Some(target) = overrides.target_duration_s {
        let clip_eff = MoodProfile::for_mood(entry.mood)
            .clip_range[0]
            .max(4)
            .min(10);
        let clips_needed = target.div_ceil(clip_eff.max(1)).max(1);
        let current_clips = scenes * spc.max(1);
        if clips_needed < current_clips && !spc_pinned {
            // Soft TRIM: fewer shots per scene (scenes are content and keep).
            spc = clips_needed.div_ceil(scenes.max(1)).clamp(1, max_spc);
        } else if clips_needed > current_clips {
            // SOFT GROW: raise the scene count first (a scene carries the
            // dramatic role — the beats live there), then the intra-scene
            // cuts. Pinned fields are left alone.
            if !scenes_pinned {
                let scenes_want = clips_needed
                    .div_ceil(spc.max(1))
                    .max(scenes)
                    .min(max_scenes);
                scenes = scenes_want;
            }
            if !spc_pinned {
                spc = spc.max(clips_needed.div_ceil(scenes.max(1)).min(max_spc));
            }
        }
    }

    SeedScale {
        scenes,
        shots_per_scene: spc,
        clip_s: [
            entry.scale.clip_s[0].clamp(clip_min, clip_max),
            entry.scale.clip_s[1].clamp(clip_min, clip_max),
        ],
    }
}

/// Role assignment across `b` branches: first = establishing, last =
/// resolving, interiors alternate developing/turn (turn at ~60% of the run).
fn branch_roles(b: usize) -> Vec<&'static str> {
    if b == 1 {
        return vec!["resolving"];
    }
    let mut out = Vec::with_capacity(b);
    for i in 0..b {
        let r = if i == 0 {
            "establishing"
        } else if i == b - 1 {
            "resolving"
        } else if i * 2 >= b - 1 {
            "turn"
        } else {
            "developing"
        };
        out.push(r);
    }
    out
}

/// Per-branch energy (0..=1) from the branch's ROLE: establishing low,
/// developing rising, turn at the peak, resolving settling. Drives the
/// transition choice + the within-branch temperature sweep. A single branch
/// sits at the midpoint.
fn branch_energies(roles: &[&'static str]) -> Vec<f32> {
    let of = |r: &str| match r {
        "establishing" => 0.35f32,
        "developing" => 0.65,
        "turn" => 0.95,
        "resolving" => 0.45,
        _ => 0.5,
    };
    roles.iter().map(|r| of(r)).collect()
}

/// Per-branch transition intent (closed vocab, the #4 fix):
/// - branch 0's in = "hard_cut" (the film starts).
/// - boundary i→i+1: Δ = energy[i+1] - energy[i]. Δ > 0.3 → match_cut
///   (energy jump, momentum join); Δ < -0.1 → hard_cut (drop); else crossfade.
/// - Mood band bias: the subtle band rewrites match_cut → cut_on_action;
///   cinematic prefers match_cut and keeps crossfade for level boundaries.
fn branch_transitions(energy: &[f32], mood: &MoodProfile) -> Vec<String> {
    let n = energy.len();
    let mut out = Vec::with_capacity(n.max(1));
    for i in 0..n {
        if i == 0 {
            out.push("hard_cut".into());
            continue;
        }
        let d = energy[i] - energy[i - 1];
        let base = if d > 0.3 {
            "match_cut"
        } else if d < -0.1 {
            "hard_cut"
        } else {
            "crossfade"
        };
        // Mood bias: subtle downgrades match_cut to cut_on_action (snappier
        // joins); cinematic keeps match_cut for positive energy jumps.
        let v = if mood.band() == "subtle" && base == "match_cut" {
            "cut_on_action"
        } else {
            base
        };
        out.push(v.to_string());
    }
    out
}

/// The branch's transition_out: the last branch closes with the mood band's
/// default out; interior branches close with the *next* branch's transition_in
/// (the two share the cut boundary).
fn branch_transition_out(
    i: usize,
    b: usize,
    energy: &[f32],
    mood: &MoodProfile,
) -> String {
    if i == b - 1 {
        return mood.transitions[1].clone();
    }
    // The "out" of branch i is the "in" of branch i+1 — the two shots share
    // the same cut, so the energy delta picks the value symmetrically.
    let d = energy[i + 1] - energy[i];
    let base = if d > 0.3 {
        "match_cut"
    } else if d < -0.1 {
        "hard_cut"
    } else {
        "crossfade"
    };
    if mood.band() == "subtle" && base == "match_cut" {
        "cut_on_action".to_string()
    } else {
        base.to_string()
    }
}

/// Build the per-branch temperature arc: base K from the time-of-day +
/// weather, and CHAINED so that `open[i] == close[i-1]` EXACTLY — the cut
/// between two shots in a continuous scene never flickers warm↔cool (the #3
/// fix). The energy only modulates the WITHIN-branch sweep
/// (`close[i] = open[i] + drift`), never the boundary, so the chain invariant
/// holds. A branch's override pins BOTH its open and close; the chain then
/// resumes from that pinned close.
fn build_temp_arc(
    energy: &[f32],
    entry: &EngineEntry,
    overrides: &TreeOverrides,
    _caps: &((u32, u32), u32, u32),
) -> Vec<[u32; 2]> {
    let (t_min, t_max) = TagVocabulary::COLOR_TEMP_K;
    let base_k = base_temp_k(&entry.time_of_day, &entry.weather);
    let n = energy.len().max(1);
    let mut out: Vec<[u32; 2]> = Vec::with_capacity(n);
    let mut chain_open = base_k; // branch 0's open; every close feeds the next open
    for i in 0..n {
        if let Some(v) = overrides.temp_arc.get(i).and_then(|o| *o) {
            // Pinned branch: both ends are the user's; the chain resumes
            // from this branch's close.
            let open = v[0].clamp(t_min, t_max);
            let close = v[1].clamp(t_min, t_max);
            chain_open = close;
            out.push([open, close]);
            continue;
        }
        // Auto branch: open = the previous close EXACTLY (no jump at the cut).
        // The within-branch sweep grows with energy (higher energy → a warmer
        // close), bounded to the closed COLOR_TEMP_K range.
        let open = chain_open;
        let drift = (300.0 + (energy[i] - 0.5).max(0.0) * 300.0) as u32;
        let close = (open as u64 + drift as u64)
            .min(t_max as u64)
            .max(t_min as u64) as u32;
        chain_open = close;
        out.push([open, close]);
    }
    out
}

/// A base color-temperature K from time-of-day + weather (the template's
/// `palette_of` gives the color words; this gives the numeric K).
fn base_temp_k(tod: &str, weather: &str) -> u32 {
    let w = weather.to_lowercase();
    let mut base: u32 = match tod.to_lowercase().as_str() {
        "dawn" => 4300,
        "morning" => 4800,
        "midday" | "afternoon" => 5500,
        "evening" => 4700,
        "night" => 3800,
        _ => 5000,
    };
    if w.contains("rain") || w.contains("storm") || w.contains("snow") {
        base = base.saturating_sub(200);
    } else if w.contains("clear") || w.is_empty() {
        base += 100;
    }
    base
}

/// The driver classification from a keyword scan over the idea + genre name.
fn driver_from_idea(idea: &str, genre: &str) -> Option<Driver> {
    let t = format!("{idea} {genre}").to_lowercase();
    // Whole-word token set (single-token keywords must match on a word
    // boundary — "across" must NOT hit "cross").
    let words: std::collections::HashSet<&str> = t.split_whitespace().collect();
    const ACTION: [&str; 8] = ["chase", "fight", "escape", "battle", "pursue", "attack", "blaster", "blades"];
    const ATMOS: [&str; 7] = ["quiet", "lonely", "dream", "silent", "vast", "haze", "drift"];
    const EXPLORE: [&str; 6] = ["journey", "travel", "explore", "search", "cross", "wandering"];
    // Multi-word / proper-noun phrases: substring is safe (specific enough).
    const CHAR: [&str; 5] = ["vader", "the girl", "the boy", "a man", "a woman"];
    let has_word = |vs: &[&str]| vs.iter().any(|k| words.contains(k));
    let has_substr = |vs: &[&str]| vs.iter().any(|k| t.contains(k));
    if has_substr(&CHAR) {
        Some(Driver::Character)
    } else if has_word(&ACTION) {
        Some(Driver::Action)
    } else if has_word(&EXPLORE) {
        Some(Driver::Exploration)
    } else if has_word(&ATMOS) {
        Some(Driver::Atmosphere)
    } else {
        None
    }
}

/// The continuity thread: the film's principal + the concrete place (the
/// "who/where carries across cuts" line the S4 prompts should hold).
fn continuity_thread(
    clauses: &[&str],
    genre: &str,
    tod: &str,
) -> String {
    let first = clauses.first().copied().unwrap_or("");
    let subject = subject_of(first);
    let place = match genre.to_lowercase().as_str() {
        _ if genre.to_lowercase().contains("action") => "the kinetic urban space",
        _ if tod.eq_ignore_ascii_case("night") => "the low night light",
        _ if tod.eq_ignore_ascii_case("dawn") => "the first-light setting",
        _ => "the film's principal space",
    };
    format!("{subject} · {place}")
}

/// One word, the film's principal, from the first clause (mirrors the
/// template's `subject_phrase` — the through-line, not the whole clause).
fn subject_of(clause: &str) -> String {
    const FILLERS: [&str; 13] = [
        "there", "then", "and", "it", "is", "in", "on", "at", "to", "of", "with", "as", "the",
    ];
    let words: Vec<&str> = clause.split_whitespace().collect();
    let mut out: Vec<&str> = Vec::new();
    for w in words.iter() {
        let lw = w.to_lowercase();
        if out.is_empty() && FILLERS.iter().any(|f| f == &lw) {
            continue;
        }
        out.push(w);
        if out.len() >= 2 {
            break;
        }
    }
    if out.is_empty() {
        "the principal".to_string()
    } else {
        out.join(" ")
    }
}

/// The thesis: the first clause, capped at `max` chars (the "what this video
/// should bring" one-line).
fn first_clause_capped(clauses: &[&str], max: usize) -> String {
    let c = clauses
        .iter()
        .find(|s| !s.is_empty())
        .copied()
        .unwrap_or("");
    let mut out: String = c.chars().take(max).collect();
    if c.chars().count() > max {
        if let Some(p) = out.rfind(' ') {
            out.truncate(p);
        }
        out = format!("{out}…");
    }
    out.trim().to_string()
}

/// Distribute the idea's content across `n` slots: round-robin the real
/// fragments (never repeat a tail fragment), so 11 pipes get 11 *different*
/// pieces of the idea (the #2 fix feeds straight in).
fn distribute_idea_units(clauses: &[&str], n: usize) -> Vec<String> {
    let pool: Vec<String> = clauses
        .iter()
        .map(|c| c.trim().to_string())
        .filter(|c| !c.is_empty())
        .collect();
    if pool.is_empty() || n == 0 {
        return vec![String::new(); n];
    }
    (0..n)
        .map(|i| pool[i % pool.len()].clone())
        .collect()
}

/// Build the leaves for one branch: the first leaf is the branch's establishing
/// role, the middle leaves hold, the last leaf resolves. The `camera_role` +
/// `motion_intent` are structural intent, not the final camera/motion values
/// (those are resolved by `leaf_to_concerns` in Phase 1, from the closed vocab).
fn build_leaves(
    role: &str,
    k: usize,
    frags: &[String],
    branch_i: usize,
) -> Vec<TreeLeaf> {
    let roles: [(&str, &str); 4] = [
        ("establishing_wide", "slow_push"),
        ("holding_medium", "drift"),
        ("intimate_close", "slow_push"),
        ("dynamic_track", "fast_whip"),
    ];
    let mut out = Vec::with_capacity(k);
    for i in 0..k {
        let slot = if i == 0 {
            if role == "turn" {
                3usize // dynamic_track at the turn
            } else {
                0 // establishing_wide
            }
        } else if i == k - 1 {
            2 // intimate_close at the resolve
        } else {
            1 // holding_medium interior
        };
        let (cr, mi) = roles[slot];
        let hint = frags
            .get(branch_i * k + i)
            .cloned()
            .filter(|f| !f.is_empty())
            .unwrap_or_else(|| "the beat develops".to_string());
        out.push(TreeLeaf {
            intent: format!("subject {hint}"),
            camera_role: cr.to_string(),
            motion_intent: mi.to_string(),
            beat_hints: vec![hint],
        });
    }
    out
}

/// The leaf's structural intent, resolved into CLOSED-VOCAB concern values
/// (the "leaf_to_concerns" bridge the UI / S3 use to turn a tree leaf's
/// camera_role + motion_intent into concrete camera / lens / motion concerns).
/// Every output is a `TagVocabulary` member, so a leaf-driven spec stays
/// S5-verifiable. This is what replaces the `g % N` cycling tables in Phase 1.
pub fn leaf_to_concerns(leaf: &TreeLeaf, focal_default: u32) -> (CameraConcern, LensConcern, MotionConcern) {
    // Closed: size, dof, framing ∈ size()/dof()/framing() sets.
    let (size, dof, framing, angle) = match leaf.camera_role.as_str() {
        "establishing_wide" => ("wide", "deep", "rule_of_thirds", "eye"),
        "intimate_close" => ("close-up", "shallow", "fill_frame", "eye"),
        "dynamic_track" => ("medium", "medium", "rule_of_thirds", "eye"),
        // "holding_medium" + any unknown/legacy role → the neutral hold.
        _ => ("medium", "medium", "centered", "eye"),
    };
    // Closed: the move ∈ move_set(), the speed ∈ speed().
    let (move_, speed) = match leaf.motion_intent.as_str() {
        "slow_push" => ("dolly", "slow"),
        "fast_whip" => ("whip_pan", "fast"),
        "drift" => ("track", "normal"),
        // "static_hold" + unknown → static.
        _ => ("static", "normal"),
    };
    (
        CameraConcern {
            size: size.to_string(),
            angle: angle.to_string(),
            framing: framing.to_string(),
            dof: dof.to_string(),
        },
        LensConcern {
            focal_mm: focal_default,
            distortion: None,
        },
        MotionConcern {
            r#move: move_.to_string(),
            zoom: "static".to_string(),
            speed: speed.to_string(),
        },
    )
}

/// The compact structural brief (injected into the LLM prompt — Phase 2):
/// "here is the shape; the prose / environment / character / beats are yours
/// to invent, stay within these constraints."
/// Phase 2.5: each scene line now carries a soft `hint:` — a role + driver
/// narrative cue that STEERS story direction but never overrides the
/// FilmSeed idea (the "hint, not a cage" rule: the LLM may freely adapt or
/// ignore it; the user's own input always wins).
pub fn brief_block(tree: &StructuralTree) -> String {
    use std::fmt::Write as _;
    let mut s = String::new();
    let r = &tree.root;
    let _ = write!(
        s,
        "Structural brief (constraints — prose, environment, character, and beats are yours to invent; stay within these. The narrative hints steer story direction only; they never override the FilmSeed idea):\n",
    );
    let _ = write!(
        s,
        "- thesis: \"{r_thesis}\" · driver: {r_driver} · target: ~{r_dur}s ({n} scenes)\n",
        r_thesis = r.thesis,
        r_driver = r.driver.as_str(),
        r_dur = r.target_duration_s,
        n = tree.branches.len(),
    );
    for (i, b) in tree.branches.iter().enumerate() {
        let hint = branch_narrative_hint(&b.role, r.driver);
        let _ = write!(
            s,
            "- scene {} {} e{:.2} \"{}\" in={} out={} temp {}→{}K\n  hint: {}\n",
            i + 1,
            b.role,
            b.energy,
            b.narrative,
            b.transition_in,
            b.transition_out,
            b.temp_open_k,
            b.temp_close_k,
            hint,
        );
    }
    let _ = write!(s, "- continuity: \"{}\"", r.continuity_thread);
    s
}

/// Phase 2.5: the branch's soft NARRATIVE HINT — a role-based story cue
/// through the driver's lens. Pure + derived (no schema change on
/// `TreeBranch`, so the golden structure pins stay green). The wording is
/// deliberately advisory: it suggests a direction, never a beat list, and
/// it never invents character, environment, or plot points the user didn't
/// ask for. The UI shows the same string as a quiet "hint:" line.
pub fn branch_narrative_hint(role: &str, driver: Driver) -> String {
    let role_cue: &str = match role {
        "establishing" => "establish the world and the principal before the story moves",
        "developing" => "let the story build: develop one relationship or change one variable at a time",
        "turn" => "bend what the audience expected: a reversal, a reveal, or an escalation",
        "resolving" => "land the ending: release the tension without inventing new problems",
        _ => "carry the story forward and hold the thread",
    };
    let driver_cue: &str = match driver {
        Driver::Action => "keep the principal moving; momentum carries the cut",
        Driver::Atmosphere => "let mood and texture carry it; the stillness is the story",
        Driver::Character => "keep the principal's interior state central",
        Driver::Exploration => "let the space reveal itself; the traversal is the story",
        Driver::Unknown => "follow the principal's thread",
    };
    format!("{role_cue} · {driver_cue}")
}

// ── Tests: the tree is pure + deterministic + capped + the three session-8
//    fixes are pinned here as invariants (the #2/#3/#4 golden-level pins).
#[cfg(test)]
mod tests {
    use super::*;

    fn entry(idea: &str, mood: u8, scenes: u32, spc: u32) -> EngineEntry {
        use crate::generation::video_flow::engine::types::{Genre, SeedScale};
        EngineEntry {
            title: String::new(),
            idea: idea.into(),
            input_text: Some(idea.into()),
            genre: Genre {
                name: "Cinematic".into(),
                style: "cinematic natural light".into(),
            },
            ratio: "16:9".into(),
            scale: SeedScale {
                scenes,
                shots_per_scene: spc,
                clip_s: [8, 10],
            },
            time_of_day: "evening".into(),
            weather: "clear".into(),
            mood,
            overrides: Default::default(),
        }
    }

    #[test]
    fn tree_is_deterministic() {
        let intent = IntentSnapshot::new("a red fox darts through the tall pine forest at dusk as golden light spills across the meadow");
        let e = entry("a red fox darts through the tall pine forest at dusk as golden light spills across the meadow", 50, 3, 2);
        let t1 = build_structural_tree(&intent, &e, &TreeOverrides::default());
        let t2 = build_structural_tree(&intent, &e, &TreeOverrides::default());
        assert_eq!(t1, t2, "same inputs must produce the same tree");
    }

    #[test]
    fn tree_respects_engine_caps() {
        let intent = IntentSnapshot::new("a red fox darts through the tall pine forest at dusk as golden light spills across the meadow and a distant river catches the fading sun in the tall trees");
        let e = entry(&intent.entry_text, 50, 3, 2);
        let t = build_structural_tree(&intent, &e, &TreeOverrides::default());
        let vocab = TagVocabulary::new();
        for b in &t.branches {
            assert!(b.shots <= TagVocabulary::SHOTS_PER_SCENE_MAX);
            for (k, v) in [
                ("in", &b.transition_in),
                ("out", &b.transition_out),
            ] {
                assert!(
                    vocab.transition().contains(v.as_str()),
                    "{k} transition {v:?} must be tag-closed"
                );
            }
            let (t_min, t_max) = TagVocabulary::COLOR_TEMP_K;
            assert!((t_min..=t_max).contains(&b.temp_open_k));
            assert!((t_min..=t_max).contains(&b.temp_close_k));
        }
        assert!(t.branches.len() as u32 <= TagVocabulary::SCENES_MAX);
    }

    #[test]
    fn short_idea_pads_leaves_round_robin() {
        // The #2 fix: a thin idea with more shots than clauses must NOT tail-repeat
        // the same fragment across half the run — it round-robins the real content.
        let intent = IntentSnapshot::new("Vader walks out of smoke");
        let e = entry("Vader walks out of smoke", 50, 4, 3); // 12 shots, 1 clause
        let t = build_structural_tree(&intent, &e, &TreeOverrides::default());
        let all_leaves: Vec<&TreeLeaf> = t.branches.iter().flat_map(|b| b.leaves.iter()).collect();
        assert_eq!(all_leaves.len(), 12, "4 scenes × 3 shots = 12 leaves");
        // All leaves carry the same single clause (round-robin over 1 fragment)
        // but the INTENT text must NOT be identical across siblings: the
        // camera_role/motion_intent per slot differ (establishing vs holding vs
        // intimate), so even with one clause, 12 shots read as 12 distinct
        // beats, not "Vader walks × 12".
        let distinct_roles: std::collections::HashSet<_> =
            all_leaves.iter().map(|l| l.camera_role.as_str()).collect();
        assert!(distinct_roles.len() >= 3, "leaf camera roles must vary (got {distinct_roles:?})");
    }

    #[test]
    fn temp_arc_chains_no_jump() {
        // The #3 fix promoted: the per-branch temp arc chains — open[i+1] ==
        // close[i] — so a cut between two shots in the same scene never
        // flickers warm↔cool.
        let intent = IntentSnapshot::new("a red fox darts through the tall pine forest at dusk as golden light spills across the meadow and a distant river catches the fading sun in the tall trees and wind moves the pines slowly");
        let e = entry(&intent.entry_text, 50, 4, 2);
        let t = build_structural_tree(&intent, &e, &TreeOverrides::default());
        for i in 1..t.branches.len() {
            assert_eq!(
                t.branches[i].temp_open_k,
                t.branches[i - 1].temp_close_k,
                "branch {i} temp arc must chain from the previous branch's close (no flicker)"
            );
        }
    }

    #[test]
    fn energy_jump_picks_match_cut() {
        // The #4 fix: a positive energy jump at a cut boundary → match_cut
        // (momentum join), NOT the uniform crossfade of the old modulo path.
        let intent = IntentSnapshot::new("a red fox darts through the tall pine forest at dusk as golden light spills across the meadow and a distant river catches the fading sun in the tall trees and wind moves the pines slowly and the sky clears at last");
        let e = entry(&intent.entry_text, 50, 3, 2);
        let t = build_structural_tree(&intent, &e, &TreeOverrides::default());
        // Establishing → developing is an energy jump (0.35 → 0.65, Δ = 0.30)
        // — at the strict boundary this is crossfade (Δ == 0.3, not > 0.3);
        // developing → turn (0.95) is Δ 0.30 → crossfade too; turn → resolving
        // (0.45) is Δ -0.50 → hard_cut. The last transition_out of the final
        // branch is the mood band's crossfade. The point of the test: the
        // branch transitions are DISTINCT from a uniform "all crossfade", and
        // the last branch's in/out are energy/mood-driven, not cyclic.
        let last = t.branches.last().unwrap();
        assert_eq!(last.transition_in, "hard_cut", "energy drop turn→resolving picks hard_cut");
        // The mood band (50 = balanced) says balanced.transitions[1] = crossfade,
        // so the final branch closes with crossfade.
        assert_eq!(last.transition_out, "crossfade", "balanced band closes with crossfade");
    }

    #[test]
    fn overrides_win_over_auto() {
        // The manual-override rule: pinned scenes=2 forces 2 branches even
        // when the auto-derive would pick 4.
        let intent = IntentSnapshot::new("a red fox darts through the tall pine forest at dusk as golden light spills across the meadow and a distant river catches the fading sun in the tall trees and wind moves the pines slowly and the sky clears at last and a hawk circles overhead");
        let e = entry(&intent.entry_text, 50, 4, 2);
        let auto = build_structural_tree(&intent, &e, &TreeOverrides::default());
        let ov = TreeOverrides {
            scenes: Some(2),
            ..Default::default()
        };
        let pinned = build_structural_tree(&intent, &e, &ov);
        assert_eq!(auto.branches.len(), 4, "auto-derive picks 4 scenes for the rich idea");
        assert_eq!(pinned.branches.len(), 2, "pinned scenes=2 wins over auto");
    }

    #[test]
    fn brief_carrys_advisory_narrative_hints() {
        // Phase 2.5 pin: every scene line in the brief carries a soft
        // "hint:" narrative cue (role through the driver's lens) that STEERS
        // story direction but never overrides the FilmSeed idea — and the
        // brief header says so explicitly. The hints are derived, so this
        // pin proves the LLM sees the advisory wording, not the shape alone.
        let idea = "a red fox darts through the tall pine forest at dusk as golden light spills across the meadow";
        let intent = IntentSnapshot::new(idea);
        let e = entry(idea, 50, 3, 2);
        let t = build_structural_tree(&intent, &e, &TreeOverrides::default());
        let brief = brief_block(&t);
        assert!(
            brief.contains("never override the FilmSeed idea"),
            "the brief must label the hints advisory (hint, not a cage)"
        );
        let hint_lines = brief.lines().filter(|l| l.trim_start().starts_with("hint: ")).count();
        assert_eq!(
            hint_lines,
            t.branches.len(),
            "one advisory hint per scene (got {hint_lines} for {} scenes)",
            t.branches.len()
        );
        // The hint wording is role + driver, and carries NO invented
        // character / environment / plot points (it only echoes the branch's
        // role cue + driver cue).
        let h1 = branch_narrative_hint("establishing", Driver::Unknown);
        assert!(h1.contains("establish"), "establishing hint carries the role cue: {h1}");
        // A pinned driver changes the cue (the manual-override rule reaches
        // the story hint, not just the shape).
        let h_action = branch_narrative_hint("developing", Driver::Action);
        assert!(
            h_action.contains("momentum"),
            "the action driver's cue steers motion: {h_action}"
        );
        assert_ne!(
            branch_narrative_hint("turn", Driver::Action),
            branch_narrative_hint("turn", Driver::Atmosphere),
            "same role, different driver → different advisory cue"
        );
    }

    #[test]
    fn empty_overrides_object_from_ui_parses() {
        // Regression pin for the `missing field 'transitions'` wire error:
        // the UI ALWAYS serializes the overrides object (normalizeEntry →
        // `{}` when no pins), so an EMPTY object must deserialize to
        // no-pins, never reject the whole entry JSON.
        let ov: TreeOverrides = serde_json::from_str("{}").unwrap();
        assert_eq!(ov, TreeOverrides::default(), "empty object = no pins");
        assert!(ov.transitions.is_empty());
        assert!(ov.temp_arc.is_empty());
        // And a full entry JSON carrying `"overrides": {}` (the exact shape
        // the Director G0 form sends) must parse end-to-end.
        let entry_json = r#"{
            "title": "t", "idea": "a red fox darts through the forest",
            "genre": { "name": "Cinematic", "style": "cinematic natural light" },
            "ratio": "16:9",
            "scale": { "scenes": 2, "shots_per_scene": 2, "clip_s": [8, 10] },
            "time_of_day": "evening", "weather": "clear",
            "overrides": {}
        }"#;
        let e: EngineEntry = serde_json::from_str(entry_json).unwrap();
        assert_eq!(e.overrides, TreeOverrides::default());
        // A pinned card (seed-card v2) still round-trips its pins. The wire
        // is snake_case (the tree types + the rest of the engine use
        // `#[serde(rename_all = "snake_case")]`, matching the TS mirror), so
        // a multi-word pin like `temp_arc` / `shots_per_scene` reaches Rust
        // under the SAME key the UI writes — the manual-override rule works.
        let pinned_json = r#"{ "scenes": 3, "driver": "action", "transitions": ["hard_cut", null, null], "temp_arc": [[4500, 5000], null, null] }"#;
        let p: TreeOverrides = serde_json::from_str(pinned_json).unwrap();
        assert_eq!(p.scenes, Some(3));
        assert_eq!(p.transitions.len(), 3);
        assert_eq!(p.temp_arc[0], Some([4500, 5000]));
        assert_eq!(p.temp_arc[1], None);
        // And the `Driver` wire name is "neutral" for Unknown (not the
        // variant-serialized "unknown"), so the UI + LLM brief + Rust agree.
        let r1: TreeRoot = serde_json::from_str(
            r#"{ "thesis": "t", "driver": "neutral", "target_duration_s": 64, "energy": [0.5], "temp_arc": [[5600, 5900]], "continuity_thread": "c" }"#,
        )
        .unwrap();
        assert_eq!(r1.driver, Driver::Unknown);
        let round = serde_json::to_value(&r1).unwrap();
        assert_eq!(round["driver"], "neutral", "Driver::Unknown must serialize as 'neutral'");
    }

    #[test]
    fn balanced_mood_50_tree_is_pinned() {
        // Golden-level pin: the exact tree for the fixture idea at mood 50.
        let idea = "a red fox darts through the tall pine forest at dusk as golden light spills across the meadow";
        let intent = IntentSnapshot::new(idea);
        let e = entry(idea, 50, 2, 2);
        let t = build_structural_tree(&intent, &e, &TreeOverrides::default());
        // 2 scenes × 2 shots, the establishing→resolving pair:
        assert_eq!(t.branches.len(), 2);
        assert_eq!(t.branches[0].role, "establishing");
        assert_eq!(t.branches[1].role, "resolving");
        assert_eq!(t.branches[0].transition_in, "hard_cut");
        // The driver scan: "fox" is not in the keyword lists; "dusk" is neither —
        // the default (Unknown → neutral) wins when no keyword hits.
        assert_eq!(t.root.driver, Driver::Unknown);
        // The temp arc chains (the #3 invariant, pinned at the golden level):
        assert_eq!(
            t.branches[0].temp_close_k,
            t.branches[1].temp_open_k,
            "balanced tree's temp arc must chain branch 0 close → branch 1 open"
        );
    }

    // ── P1/P2: the content-aware run scale (the 2026-11-10 seam) ─────────

    fn caps() -> ((u32, u32), u32, u32) {
        tree_caps()
    }

    /// A rich 4-clause idea: each sentence is its own clause.
    const RICH: &str = "I leave home and lock the door, leaving a small light on in the room and the cat asleep on the windowsill. \
        In the morning, following the track that disappeared in the woods, I saw the machine stepping out of the pine grove. \
        First, I heard its red optics sweep the clearing, then the whole meadow trembled under its feet. \
        Panic sent me down into a ravine, and I crouched in the damp grass, holding my breath until the giant shadow passed.";

    fn intent_rich() -> IntentSnapshot {
        IntentSnapshot::new(RICH)
    }

    /// The untouched G0 default (1×2) adopts the idea's own structure — a
    /// 4-clause idea reads as ~3 scenes, not 1.
    #[test]
    fn resolve_default_entry_adopts_content_scale() {
        let intent = intent_rich();
        let e = entry("x", 50, 1, 2); // the frozen G0 default
        let s = resolve_run_scale(&intent, &e, &TreeOverrides::default(), &caps());
        assert!(s.scenes >= 2, "a 4-clause idea must read as more than 1 scene (got {})", s.scenes);
        assert!(s.shots_per_scene >= 1);
        assert_eq!(s.clip_s, [8, 10], "clip bounds pass through clamped");
    }

    /// An explicit G0 scale (not the default) is honored even when content
    /// would suggest more — the user chose the shape.
    #[test]
    fn resolve_explicit_entry_scale_wins_over_content() {
        let intent = intent_rich();
        let mut e = entry("x", 50, 1, 2);
        e.scale = crate::generation::video_flow::engine::types::SeedScale {
            scenes: 2,
            shots_per_scene: 3,
            clip_s: [8, 10],
        };
        // Still "default-UNPinned" content-wise, but the entry scale 2×3 is
        // the user's explicit choice, not the 1×2 default, so it wins.
        let s = resolve_run_scale(&intent, &e, &TreeOverrides::default(), &caps());
        assert_eq!(s.scenes, 2, "an explicit entry scale is not overridden by content");
        assert_eq!(s.shots_per_scene, 3);
    }

    /// A pin ALWAYS wins for its field, and is never overridden by the
    /// target budget.
    #[test]
    fn resolve_pins_win_and_survive_target() {
        let intent = intent_rich();
        let e = entry("x", 50, 1, 2);
        let mut o = TreeOverrides::default();
        o.scenes = Some(5);
        o.shots_per_scene = Some(1);
        o.target_duration_s = Some(400); // absurd budget — must not override pins
        let s = resolve_run_scale(&intent, &e, &o, &caps());
        assert_eq!(s.scenes, 5, "a pinned scene count survives an absurd target");
        assert_eq!(s.shots_per_scene, 1, "a pinned spc survives an absurd target");
    }

    /// A pinned target GROWS a 1×2 default so the budget is reachable — but
    /// never above the closed caps.
    #[test]
    fn resolve_target_budget_grows_default_scale() {
        let intent = intent_rich();
        let e = entry("x", 50, 1, 2);
        let mut o = TreeOverrides::default();
        o.target_duration_s = Some(40);
        let s = resolve_run_scale(&intent, &e, &o, &caps());
        // ~40s at the balanced band's 8s clip floor → ~5 clips → more scenes
        // than the frozen 1×2 (2 clips). Must stay inside the caps.
        assert!(
            (s.scenes * s.shots_per_scene) >= 5,
            "40s target must grow the shape past 2 clips (got {}×{}={} clips)",
            s.scenes,
            s.shots_per_scene,
            s.scenes * s.shots_per_scene
        );
        assert!(s.scenes <= caps().1, "scenes stay within SCENES_MAX");
        assert!(s.shots_per_scene <= caps().2, "spc stays within SHOTS_PER_SCENE_MAX");
    }

    /// `role_dwell_weight` — the art-director "where the time goes" table.
    #[test]
    fn role_dwell_weights_are_ordered() {
        let establishing = role_dwell_weight("establishing");
        let turn = role_dwell_weight("turn");
        let developing = role_dwell_weight("developing");
        let resolving = role_dwell_weight("resolving");
        assert!(establishing > developing, "establishing holds longer than developing");
        assert!(turn >= developing, "the peak holds at least as long as developing");
        assert!(resolving < developing, "resolving exits shorter than developing");
    }
}
