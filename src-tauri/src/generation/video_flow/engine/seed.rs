//! Deterministic S0→S4 builder + S5 verify + gate states (LLM-free, seeded).
//!
//! This is the *product path* the UI drives today. A real Node A / Node B
//! LLM is not wired yet (Phase 1a/1b), so the harness needs a fully-typed
//! S0→S4 state the UI can render, drill, and copy **without** fabricating
//! data client-side. `build_engine_run(seed)` produces every typed layer of
//! the flow from a user `FilmSeed` (S0 entry + its genre/ratio/scale +
//! time_of_day/weather), in one deterministic pass:
//!
//!   S0 seed → S1 novel → S2 scene specs → S3 shot specs (+ sub-timeline)
//!          → S3′ molecules (S4 derive fills prompts) → timeline
//!   then S5 verify (V1–V7) runs against the produced state, and the
//!   G0..G4 gate table is stamped with its "now" state (G0 confirmed = it
//!   IS the input; G1/G2 pending = user review point; G3/G4 out of text
//!   scope, auto-confirmable in batch).
//!
//! Everything emitted is tag-closed by construction (uses only values from
//! `TagVocabulary`), V3 counts are enforced, V4 frame floor holds, and V5
//! invariants hold on the derive output (identity lock + no on-screen
//! text). So `VerifyReport.errors` is **always empty** on this path — which
//! is what the Scoreboard's "verified ✓" chip depends on. If a future LLM
//! node ever produces out-of-vocab state, `verify` will surface it named.

use crate::generation::video_flow::engine::axes;
use crate::generation::video_flow::engine::beat_profiles;
use crate::generation::video_flow::engine::derive::{derive_full, frames_of, FRAME_RATE, MIN_FRAMES};
use crate::generation::video_flow::engine::gates::{Gate, GateId, Gates, Step};
use crate::generation::video_flow::engine::tag_vocabulary::TagVocabulary;
use crate::generation::video_flow::engine::types::{
    AudioConcern, CameraConcern, Concerns, FilmSeed, Genre, GradeConcern, LensConcern,
    LightingConcern, MotionConcern, NovelScene, NovelShot, PartialConcerns, SceneSpec,
    SceneTimeline, SeedScale, ShotContent, ShotMolecule, ShotSpec, SubSlice, TimelineScene,
    TimelineShot, VisualNovel,
};
use crate::generation::video_flow::engine::tree::{leaf_to_concerns, role_dwell_weight, StructuralTree};
use serde::{Deserialize, Serialize};

/// S0 → S4 deterministic build result, one per run.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct EngineRun {
    /// S0 entry (the input to Node A).
    pub seed: FilmSeed,
    /// S1 Node A output (visual-language document).
    pub novel: VisualNovel,
    /// S2 Node A′ per-scene base look (one SceneSpec per novel scene).
    pub scenes: Vec<SceneSpec>,
    /// S3 Node B per-shot concern-grouped specs (one ShotSpec per novel shot).
    pub specs: Vec<ShotSpec>,
    /// S3′ ShotMolecule — the *delta* form shots inherit from their scene.
    /// One per spec, order-matched. `prompts` are filled by S4 derive.
    pub molecules: Vec<ShotMolecule>,
    /// S2 division — the shot timeline at transition points.
    pub timeline: SceneTimeline,
    /// S5 text-only verify. `errors` is empty iff the run is a clean verified state.
    pub verify: VerifyReport,
    /// Gate states (G0–G4) stamped to their "now" status.
    pub gates: Vec<GateState>,
    /// Where the S1 novel came from (Template by default; Llm when the
    /// provider's Node A wrote it). Backward-compatible: old docs load
    /// with `Template` (serde default).
    #[serde(default)]
    pub expansion: ExpansionSource,
    /// Named provenance note: the LLM model id (when `expansion == Llm`),
    /// or "template · LLM failed: <reason>" on fallback. None when the
    /// LLM path was not attempted.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expansion_note: Option<String>,
    /// S0.5 structural tree (the "brain" layer). Present on every NEW run
    /// (template or LLM); old docs load `None` via the serde default below,
    /// and their S2/S3 keep the legacy per-shot cycling tables (byte-stable).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tree: Option<crate::generation::video_flow::engine::tree::StructuralTree>,
}

/// One gate's in-run state. Absorbed shape of `harness/out/session.json`
/// `gates` map + the batch-mode auto-confirm rule from `gates.yaml`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct GateState {
    pub gate: GateId,
    /// "confirmed" | "pending" | "auto" (batch)
    pub status: String,
    /// What is acquirable at this gate (from the gate table).
    pub acquirable: Vec<String>,
    /// Upstream steps this gate can backtrack to.
    pub backtrack: Vec<Step>,
    /// Human prompt for this gate's affirm.
    pub confirm: String,
}

/// S5 VERIFY result. `issues` uses V1..V7 labels exactly as pipeline.js does.
/// V1 shape · V2 tag-closure · V3 counts · V4 frame floor · V5 invariants ·
/// V6 length comparison · V7 no-op sub-slice (every slice must add information).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct VerifyReport {
    pub verified: bool,
    /// V1..V7 labeled issues (empty = clean).
    pub issues: Vec<String>,
    /// Per-shot frame counts at FRAME_RATE.
    pub frames: Vec<u32>,
    pub total_frames: u32,
}

/// Where the S1 novel came from. `Template` = the deterministic builder
/// (always available, LLM-free). `Llm` = Node A through the app's text
/// provider (the harness llm.json contract: production reads the active
/// profile's providers.text slot). Never a silent fallback: when the LLM
/// path failed, `expansion` stays `Template` and `expansion_note` names
/// why (model + reason), so the UI + S5 report the actual source.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExpansionSource {
    /// Deterministic template expansion (build_novel).
    Template,
    /// LLM Node A expansion (the provider's text model wrote the novel).
    Llm,
}

impl Default for ExpansionSource {
    fn default() -> Self {
        Self::Template
    }
}

/// S5 VERIFY — schema-ish V1, tag-closure V2, counts V3, frame floor V4,
/// invariants V5 (absorbed from pipeline.js + validate_concerns).
fn verify(run: &EngineRun) -> VerifyReport {
    let mut issues: Vec<String> = Vec::new();
    let vocab = TagVocabulary::new();

    // V1: required fields non-empty where the schema demands it.
    if run.seed.title.is_empty() { issues.push("V1 seed.title is empty".into()); }
    if run.seed.idea.len() < 10 { issues.push(format!("V1 seed.idea has {} chars (min 10)", run.seed.idea.len())); }
    for sc in &run.novel.scenes {
        if sc.title.is_empty() { issues.push(format!("V1 scene '{}' has empty title", sc.prose)); }
        if sc.prose.is_empty() { issues.push("V1 scene has empty prose".into()); }
        for sh in &sc.shots {
            if sh.prose.is_empty() { issues.push("V1 novel shot has empty prose".into()); }
        }
    }
    for sp in &run.specs {
        if sp.shot_id.is_empty() { issues.push("V1 ShotSpec.shot_id empty".into()); }
        if sp.clip_s == 0 { issues.push("V1 ShotSpec.clip_s == 0".into()); }
    }

    // V2: tag-closure on every spec concern + every folded sub-slice state.
    for sp in &run.specs {
        let label = format!("V2 {}", sp.shot_id);
        for v in vocab.validate_concerns(&sp.concerns) {
            issues.push(format!("{label}: {v}"));
        }
        let slices: Vec<Option<PartialConcerns>> = sp.sub_timeline.iter().map(|s| s.state.clone()).collect();
        let eff = axes::fold(&sp.concerns, &slices);
        for (i, e) in eff.iter().enumerate() {
            for v in vocab.validate_concerns(e) {
                issues.push(format!("V2 {} slice {i}: {v}", sp.shot_id));
            }
        }
    }

    // V3: counts (novel scenes == scale.scenes, per-scene shots == scale.shots_per_scene).
    if run.novel.scenes.len() as u32 != run.seed.scale.scenes {
        issues.push(format!(
            "V3 scenes={} != scale.scenes={}",
            run.novel.scenes.len(),
            run.seed.scale.scenes
        ));
    }
    for (i, sc) in run.novel.scenes.iter().enumerate() {
        if sc.shots.len() as u32 != run.seed.scale.shots_per_scene {
            issues.push(format!(
                "V3 scene {} shots={} != scale.shots_per_scene={}",
                i + 1,
                sc.shots.len(),
                run.seed.scale.shots_per_scene
            ));
        }
    }
    // S3/S3′/S2-division counts line up with the novel.
    if run.specs.len() != run.novel.scenes.iter().map(|s| s.shots.len()).sum::<usize>() {
        issues.push(format!("V3 specs.len()={} != novel shot total", run.specs.len()));
    }
    if run.molecules.len() != run.specs.len() {
        issues.push(format!("V3 molecules.len()={} != specs.len()={}", run.molecules.len(), run.specs.len()));
    }

    // V4: frame floor (each clip ≥ MIN_FRAMES @ FRAME_RATE).
    let mut total = 0u32;
    let mut frames: Vec<u32> = Vec::new();
    for m in &run.molecules {
        let f = frames_of(m.clip_s);
        if f < MIN_FRAMES {
            issues.push(format!(
                "V4 {} {}f < min {}f (extend clip to ≥{}s)",
                m.inherit, f, MIN_FRAMES, (MIN_FRAMES as f64 / FRAME_RATE as f64).ceil() as u32
            ));
        }
        total += f;
        frames.push(f);
    }

    // V5: invariants — identity lock in video + no on-screen text in either prompt.
    for m in &run.molecules {
        let img = &m.prompts.image;
        let vid = &m.prompts.video;
        if vid.is_empty() {
            issues.push(format!("V5 {} video prompt missing", m.inherit));
        } else if !vid.to_lowercase().contains("first frame identical") {
            issues.push(format!("V5 {} video prompt missing identity-lock line", m.inherit));
        }
        for w in ["subtitle", "caption", "title card"] {
            if contains_word(img, w) || contains_word(vid, w) {
                issues.push(format!("V5 {} prompt contains on-screen text phrase '{w}'", m.inherit));
            }
        }
    }

    // V7: every sub-slice must ADD information — a non-empty concern delta
    // against the previous folded effective state. This is the compact-data
    // signal: the value itself, per shot, no cross-shot comparison and no
    // numeric metric. A slice that changes nothing (a held or duplicated
    // state) is a no-op: the user sees a named issue and either merges it
    // into the neighbor's window or gives it a distinct concern change.
    for sp in &run.specs {
        let slices: Vec<Option<PartialConcerns>> =
            sp.sub_timeline.iter().map(|s| s.state.clone()).collect();
        let eff = axes::fold(&sp.concerns, &slices);
        for i in 0..sp.sub_timeline.len() {
            if axes::diff(&eff[i], &eff[i + 1]).is_empty() {
                issues.push(format!(
                    "V7 {} slice {} is a no-op (no concern delta); merge it or give it a distinct change",
                    sp.shot_id, i + 1
                ));
            }
        }
    }

    // V6: generated pipe length vs the CUMULATIVE S2/S3 scene length.
    // The concrete plan is one pipe per shot, each lengthed to that shot's
    // S3 clip; so (a) the S2 division total must equal the sum of the S3
    // shot clips, (b) the cumulative generated frames must equal that
    // total @ 24fps, and (c) the concrete plan's per-pipe lengths must sum
    // to the same frames with no section overflowing its pipe.
    let cum_s: u32 = run.specs.iter().map(|s| s.clip_s).sum();
    if run.timeline.total_s != cum_s {
        issues.push(format!(
            "V6 S2 division total_s={} != cumulative S3 shot clips {}s",
            run.timeline.total_s, cum_s
        ));
    }
    if total != cum_s.saturating_mul(FRAME_RATE) {
        issues.push(format!(
            "V6 cumulative generated {}f != {}s @ {}fps ({}f)",
            total,
            cum_s,
            FRAME_RATE,
            cum_s.saturating_mul(FRAME_RATE)
        ));
    }
    let plan = run.plan_from_engine(1);
    let pipe_lens: Vec<u32> = plan
        .pipes
        .iter()
        .map(|p| p.length_frames.max(p.sections.iter().map(|s| s.frame_end).max().unwrap_or(0)))
        .collect();
    let pipe_sum: u32 = pipe_lens.iter().sum();
    if pipe_sum != total {
        issues.push(format!(
            "V6 sum of generated pipe lengths {}f != cumulative generated frames {}f",
            pipe_sum, total
        ));
    }
    for (i, p) in plan.pipes.iter().enumerate() {
        let len = pipe_lens[i];
        for s in &p.sections {
            if s.frame_end > len {
                issues.push(format!(
                    "V6 pipe {} section '{}' ends at {}f > pipe length {}f",
                    i,
                    s.tag.keyword(),
                    s.frame_end,
                    len
                ));
            }
        }
    }

    VerifyReport {
        verified: issues.is_empty(),
        issues,
        frames,
        total_frames: total,
    }
}

fn contains_word(haystack: &str, word: &str) -> bool {
    let h = haystack.to_lowercase();
    let w = word.to_lowercase();
    h.match_indices(&w)
        .any(|(i, _)| {
            let before_ok = i == 0 || !h[..i].chars().next_back().map_or(true, |c| c.is_alphanumeric());
            let after = &h[i + w.len()..];
            let after_ok = after.is_empty() || !after.chars().next().map_or(true, |c| c.is_alphanumeric());
            before_ok && after_ok
        })
}

impl EngineRun {
    /// Gate states stamped to their "now" position (G0 done, G1/G2 pending,
    /// G3/G4 auto for the declared batch rule).
    fn gate_states() -> Vec<GateState> {
        let gates = Gates::default();
        let table: Vec<Gate> = Gates::all();
        table
            .into_iter()
            .map(|g| GateState {
                gate: g.id,
                status: match g.id {
                    GateId::G0Entry => "confirmed".into(),   // G0 IS the input
                    GateId::G1NovelReview => "pending".into(),
                    GateId::G2SpecReview => "pending".into(),
                    GateId::G3ClipReview => if gates.auto_confirm(GateId::G3ClipReview, true, &std::collections::BTreeMap::new()) { "auto".into() } else { "pending".into() },
                    GateId::G4FinalReview => if gates.auto_confirm(GateId::G4FinalReview, true, &std::collections::BTreeMap::new()) { "auto".into() } else { "pending".into() },
                },
                acquirable: g.acquirable,
                backtrack: g.backtrack,
                confirm: g.confirm,
            })
            .collect()
    }

    /// Deterministic S0→S4 build + S5 verify + gate stamping.
    ///
    /// LLM-free: everything is derived from the seed's closed vocabularies +
    /// defaults. Real LLM expansion/structure slots (Phase 1a/1b) will replace
    /// the S1/S2/S3 producers here without touching the S4 derive, S5 verify,
    /// or the S0 entry surface.
    pub fn build(seed_in: FilmSeed, tod: &str, weather: &str) -> Self {
        let seed = normalize_seed(seed_in);
        // S1: deterministic template novel (the always-available LLM-free
        // producer). The LLM path (build_with_novel) swaps only this layer.
        let novel = build_novel(&seed, tod, weather);
        // The plain seed build keeps the pre-M4 pinned structure (no mood
        // post-processing): mood rides the UI template path (build_run) +
        // the Node A prompt line, not the LLM/director bridge.
        Self::build_with_novel(
            seed,
            novel,
            tod,
            weather,
            ExpansionSource::Template,
            None,
        )
    }

    /// S2–S5 build from an ALREADY-PRODUCED S1 novel (the LLM Node A
    /// output) + expansion provenance. S2/S3/S4/S5 stay deterministic from
    /// the novel — only the S1 layer may be LLM-written; the G0 look axes
    /// still drive S2/S4 regardless of what the LLM claimed. Structurally
    /// intact (no mood post-processing) — M4 mood shapes the PROMPT, not
    /// this bridge's structure.
    pub fn build_with_novel(
        seed_in: FilmSeed,
        novel: VisualNovel,
        tod: &str,
        weather: &str,
        expansion: ExpansionSource,
        expansion_note: Option<String>,
    ) -> Self {
        Self::build_with_novel_mood(
            seed_in,
            novel,
            tod,
            weather,
            expansion,
            expansion_note,
            None,
            None,
        )
    }

    /// M4: the mood-aware build. Same deterministic S2–S5 bridge as
    /// `build_with_novel`, but when `mood_profile` is `Some` the mood band
    /// post-processes the seeded S2 scenes + S3 specs + S2 division BEFORE
    /// S4 derive + S5 verify: clip length (the band's `clip_range` min,
    /// clamped to the 4..10 engine cap), transition_in/out (the band's
    /// `transitions`), base shot move/speed (the band's `motion`/`speed`,
    /// with `camera_move` standing in when the band is static), the scene's
    /// `effects_base` (the first `effect_count` closed-vocab effect tags),
    /// and the scene light + grade `contrast`. `None` = the pre-M4 path,
    /// byte-identical to `build_with_novel`.
    ///
    /// Phase 1b: when `tree` is `Some`, the S0.5 structural tree drives the
    /// S2/S3 production on top of the mood band — the scene's color
    /// temperature comes from the owning branch's chained open/close K pair
    /// (the #3 fix promoted per-branch), the scene-boundary transition intent
    /// comes from the branch's energy-driven `transition_in`/`out`, and each
    /// shot's base camera/lens concerns come from its leaf via
    /// `leaf_to_concerns` (closed vocab, so S5 stays clean). The mood band
    /// still owns the S3 clip + scene contrast + effects_base and stamps the
    /// base motion (the leaf's motion is structural intent, not the mood
    /// band's). `None` keeps the legacy per-shot cycling tables, so old docs
    /// stay byte-stable; the tree is additive.
    pub fn build_with_novel_mood(
        seed_in: FilmSeed,
        novel: VisualNovel,
        tod: &str,
        weather: &str,
        expansion: ExpansionSource,
        expansion_note: Option<String>,
        mood_profile: Option<&MoodProfile>,
        tree: Option<&StructuralTree>,
    ) -> Self {
        let seed = normalize_seed(seed_in);
        let mut novel = novel;
        // G0 look axes win over the LLM's own time_of_day/weather: they
        // steer S2 scene specs + S4 prompts on every path.
        novel.film.time_of_day = tod.to_string();
        novel.film.weather = weather.to_string();

        // S2: scene specs - one per novel scene, look seeded from the novel film.
        // M4: when a mood band is active it OVERRIDES the scene light + grade
        // contrast and seeds the scene's `effects_base` (the first
        // `effect_count` closed-vocab effect tags), so the whole run reads
        // "subtle" or "cinematic" before any shot-level delta lands.
        // Phase 1b: when a tree is present the scene's color temperature is
        // set from the owning branch's open/close K pair instead of the
        // hardcoded 5000K default (the chained temp arc, no cut flicker).
        let mood_effects: Vec<String> = match mood_profile {
            Some(p) => p.effects_base(),
            None => Vec::new(),
        };
        let scenes: Vec<SceneSpec> = novel
            .scenes
            .iter()
            .enumerate()
            .map(|(i, sc)| {
                let mut sp = build_scene_spec(i, sc, &novel, &seed.genre.name, tree);
                if let Some(p) = mood_profile {
                    sp.light.contrast = p.contrast.to_string();
                    sp.grade.contrast = p.contrast.to_string();
                    sp.effects_base = mood_effects.clone();
                }
                sp
            })
            .collect();

        // S3: shot specs - one per novel shot, concern-grouped closed defaults.
        // content-driven sub-slices activate ONLY on the LLM path (rich Node A
        // beats); the deterministic template keeps its pinned cycling journey.
        // Phase 1b: the tree's leaves drive the base shot concerns + the
        // branch-boundary transition intent when present.
        let content_driven = expansion == ExpansionSource::Llm;
        let (specs, timeline) =
            build_specs_and_timeline(&seed, &novel, &scenes, content_driven, mood_profile, tree);

        // S3'/S4: molecules - derived from (scene, spec pair), prompts filled.
        // Specs are laid out scene-major (si, ki); the owning scene index is
        // the prefix count of shots, not a string match (scene ids are
        // zero-padded, novel_refs are not).
        let mut scene_idx: Vec<usize> = Vec::new();
        for (si, sc) in novel.scenes.iter().enumerate() {
            for _ in 0..sc.shots.len() {
                scene_idx.push(si);
            }
        }
        let molecules: Vec<ShotMolecule> = specs
            .iter()
            .enumerate()
            .map(|(i, sp)| {
                let scene = &scenes[scene_idx[i]];
                let m = make_molecule(sp, scene);
                derive_full(scene, &m).molecule
            })
            .collect();

        // S5: verify + gate states.
        let mut run = EngineRun {
            seed: seed.clone(),
            novel: novel.clone(),
            scenes: scenes.clone(),
            specs: specs.clone(),
            molecules: molecules.clone(),
            timeline: timeline.clone(),
            verify: VerifyReport {
                verified: false,
                issues: Vec::new(),
                frames: Vec::new(),
                total_frames: 0,
            },
            gates: Vec::new(),
            expansion,
            expansion_note,
            // Phase 1a: the run's structural tree is attached by the callers
            // that have the full `EngineEntry` (`EngineEntry::build_run` for
            // the template path, `director_run_flow` for the LLM path). This
            // low-level builder leaves it `None` so the legacy / golden
            // structure pins stay byte-stable; the tree is additive.
            tree: None,
        };
        run.verify = verify(&run);
        run.gates = Self::gate_states();
        run
    }

    /// Concrete materialization bridge (I9): turn this run's S3 concerns into
    /// a `StructuredVideoPlan` the composer's materialize step lowers. One
    /// **pipe per shot**, and each pipe is split into its own concrete
    /// concern sections — `scene` (the shot's novel prose), `camera` (size /
    /// angle / framing / DoF / focal), `motion` (move / zoom / speed),
    /// `lighting` (key / grade) and `transition` (in / out). Each section
    /// carries only ITS concern's text, so the composer gets a real tagged
    /// structure, not one S4 blob dumped into a single `@scene` section.
    pub fn plan_from_engine(
        &self,
        flow_version: u32,
    ) -> crate::generation::video_flow::plan::StructuredVideoPlan {
        use crate::generation::video_flow::engine::derive::{
            composition_text, grade_text, light_text, motion_text,
        };
        use crate::generation::video_flow::plan::{PlanPipe, PlanSection, StructuredVideoPlan, VideoTag};

        let clip = self.seed.scale.clip_s[0].max(4);
        let frames = frames_of(clip);
        // Per-shot cumulative content length: each pipe is ONE shot, so its
        // length is that shot's S3 clip (the spec value, which the timeline
        // division also uses) — NOT the global seed clip. This is what V6
        // compares against the S2 division's cumulative total_s.
        let shot_frames = |sp: &crate::generation::video_flow::engine::types::ShotSpec| {
            frames_of(sp.clip_s.max(4))
        };

        let fallback_style = format!(
            "{} — {}",
            self.novel.film.style, self.novel.film.palette
        );

        // Molecules + specs are scene-major, shot-major (index-aligned).
        // Flatten both to shot order; the shot title carries the scene id.
        let mut pipes: Vec<PlanPipe> = Vec::new();
        let shot_counts: Vec<usize> =
            self.novel.scenes.iter().map(|s| s.shots.len()).collect();

        // Full-novel meta (user fix): every pipe carries the whole film —
        // logline (the whole idea), world, palette, style — as its global
        // style, so no shot loses the novel's context. A 6-shot run no
        // longer generates six identical quarter-idea scenes.
        let film_ctx = {
            let f = &self.novel.film;
            format!(
                "{}, {} · {} · {}",
                f.logline, f.world, f.palette, f.style
            )
        };

        // The film's PRINCIPAL — the one-word through-line that every pipe's
        // continuity anchor says "the same {principal} persists". Derived
        // from the logline's first content noun (the S1 subject). Bounded to
        // one word so it reads as an identity, not a clause.
        let principal = {
            let raw = subject_phrase(&self.novel.film.logline);
            let first = cap_words(&raw, 1);
            let articles = ["the", "a", "an"];
            if articles.iter().any(|a| first.eq_ignore_ascii_case(a)) {
                "the main subject".to_string()
            } else {
                first
            }
        };

        for (si, sc) in self.novel.scenes.iter().enumerate() {
            let scene_style = self.scenes.get(si).map(|s| {
                format!("{film_ctx} · {} {}", s.time_of_day, s.weather)
            });
            let ambience = self.scenes.get(si).map(|s| s.ambience.clone());
            for (ki, _kshot) in sc.shots.iter().enumerate() {
                let mi: usize = shot_counts[..si].iter().sum::<usize>() + ki;
                let Some(spec) = self.specs.get(mi) else { continue };
                let shot_no = ki + 1;
                let shot_title = format!("{} · shot {shot_no}", sc.title);
                let scene_style = scene_style
                    .clone()
                    .unwrap_or_else(|| film_ctx.clone());

                // ── SUSTAINED BASE → global_style ──────────────────────────
                // The whole-shot look that holds when NOTHING changes: the
                // scene's light+grade + the ambient sound bed + the base
                // camera/motion. This is the "whole-scene scenario" that must
                // live ONCE (in global_style) — it is NOT re-stated as a
                // per-concern slab. The per-section tags below carry only the
                // MOMENTS where a concern actually moves (the harness delta).
                let base_light_grade = [
                    light_text(&spec.concerns.lighting),
                    grade_text(&spec.concerns.grade),
                ]
                .into_iter()
                .filter(|s| !s.is_empty())
                .collect::<Vec<_>>()
                .join("; ");
                let base_camera = {
                    let base = composition_text(&spec.concerns.camera);
                    let lens = if spec.concerns.lens.focal_mm > 0 {
                        format!(" · {}mm lens", spec.concerns.lens.focal_mm)
                    } else {
                        String::new()
                    };
                    format!("{base}{lens}")
                };
                let base_motion = motion_text(&spec.concerns.motion);
                let ambient = ambience
                    .clone()
                    .filter(|a| !a.is_empty())
                    .map(|a| format!("ambience: {a}"))
                    .unwrap_or_default();
                let sustained_base = [
                    base_light_grade.as_str(),
                    base_camera.as_str(),
                    base_motion.as_str(),
                    ambient.as_str(),
                ]
                .into_iter()
                .filter(|s| !s.is_empty())
                .collect::<Vec<_>>()
                .join(" · ");
                let scene_style = if sustained_base.is_empty() {
                    scene_style.clone()
                } else {
                    format!("{scene_style} · {sustained_base}")
                };
                // Cross-pipe through-line: one bounded `continuity:` line so a
                // generated clip knows "the same person / same place / does it
                // keep going". The locus is the scene's own title (its place).
                let locus = cap_words(&sc.title, 5);
                let scene_style = format!(
                    "{scene_style} · {}",
                    continuity_line(&principal, &locus, si, ki)
                );

                let shot_f = shot_frames(spec);
                let mut sections: Vec<PlanSection> = Vec::new();
                let add =
                    |secs: &mut Vec<PlanSection>,
                     tag: VideoTag,
                     prompt: &str,
                     start: u32,
                     end: u32| {
                        if !prompt.trim().is_empty() && end > start {
                            secs.push(PlanSection {
                                tag,
                                frame_start: start,
                                frame_end: end,
                                prompt: prompt.trim().to_string(),
                                from: vec![],
                            });
                        }
                    };

                // MAIN ARCS: the shot's STORY — Scene (S1 prose + beat) and
                // Camera ride each S3 sub-slice window. DELTA-DRIVEN (the
                // harness diffStates contract): a concern emits a WINDOWED
                // section ONLY at the slice where it changes; a flat concern
                // is not repeated — it lives in the sustained base above.
                let prose = spec.content.prose.clone();
                if spec.sub_timeline.is_empty() {
                    // No slices → the whole shot is one sustained base: one
                    // Scene arc + one base-Camera arc, both full-clip.
                    add(&mut sections, VideoTag::Scene, &prose, 0, shot_f);
                    add(&mut sections, VideoTag::Camera, &base_camera, 0, shot_f);
                } else {
                    for (i, sl) in spec.sub_timeline.iter().enumerate() {
                        let s0 = sl.from_s.saturating_mul(24);
                        let s1 = sl.to_s.saturating_mul(24).max(s0 + 1);
                        let state = sl.state.as_ref();
                        // SCENE arc: the beat/story at this moment.
                        // Content-driven slices CARRY their beat text(s) in
                        // `absorbed_beats` (including any no-op beat collapsed
                        // into this window, V7-merge) — no positional drift.
                        // The cycling template path leaves it empty, so fall
                        // back to the positional beat as before.
                        let beats_here = if sl.absorbed_beats.is_empty() {
                            spec.content.beats.get(i).cloned()
                        } else {
                            Some(sl.absorbed_beats.join(" · "))
                        };
                        // Lean per-slice Scene text (the "over-detail squish"
                        // fix): slice 0 = the shot's own descriptive sentence
                        // (prose) + one capped beat; later slices = just their
                        // capped beat. The structural "opens/develops/closes"
                        // note and the content-driven note/beat doubling are
                        // dropped — that context now lives once in the pipe's
                        // global_style (the continuity line + sustained base),
                        // so a long LLM beat can't over-detail and squash.
                        let beat = cap_words(&beats_here.unwrap_or_default(), 10);
                        let p = if i == 0 {
                            if beat.is_empty() {
                                prose.clone()
                            } else {
                                format!("{prose} · {beat}")
                            }
                        } else {
                            beat.clone()
                        };
                        add(&mut sections, VideoTag::Scene, &p, s0, s1);
                        // CAMERA event: only where this slice states a camera
                        // change (the shot-size / focal move at this moment).
                        if let Some(cc) = state.and_then(|s| s.camera.clone()) {
                            let t = composition_text(&cc);
                            let ls = state
                                .and_then(|s| s.lens.clone())
                                .filter(|l| l.focal_mm > 0)
                                .map(|l| format!(" · {}mm lens", l.focal_mm))
                                .unwrap_or_default();
                            add(&mut sections, VideoTag::Camera, &format!("{t}{ls}"), s0, s1);
                        }
                        // LIGHTING event: only where this slice changes the
                        // light (cool open / warm close), never a slab.
                        if let Some(lc) = state.and_then(|s| s.lighting.clone()) {
                            let t = [
                                light_text(&lc),
                                state
                                    .and_then(|s| s.grade.clone())
                                    .map(|g| grade_text(&g))
                                    .unwrap_or_default(),
                            ]
                            .into_iter()
                            .filter(|s| !s.is_empty())
                            .collect::<Vec<_>>()
                            .join("; ");
                            add(&mut sections, VideoTag::Lighting, &t, s0, s1);
                        }
                        // MOTION event: only where this slice moves (dolly /
                        // track) — a real in-shot event, not a sustained bed.
                        // The MOVE is finite: a dolly occupies a bounded part
                        // of the slice, then the camera HOLDS at the new
                        // position. Bounding the window to the move (by
                        // speed) instead of slabbing the whole slice stops
                        // "dolly, slow" from claiming a full 5s of motion.
                        if let Some(mc) = state.and_then(|s| s.motion.clone()) {
                            let t = motion_text(&mc);
                            let slice_len = s1.saturating_sub(s0);
                            // Move duration by speed: slow = 2s, normal = 1.5s,
                            // fast = 1s (FRAME_RATE @24). Never longer than
                            // the slice itself (then it fills it).
                            let move_f = match mc.speed.as_str() {
                                "slow" => 48,
                                "fast" => 24,
                                _ => 36,
                            };
                            let motion_end = (s0 + move_f.min(slice_len)).max(s0 + 1);
                            add(&mut sections, VideoTag::Motion, &t, s0, motion_end);
                        }
                        // EFFECT event: only where this slice adds an effect.
                        if let Some(efx) = state.and_then(|s| s.effects.clone()) {
                            let kept: Vec<_> = efx.into_iter().filter(|e| e != "none").collect();
                            if !kept.is_empty() {
                                add(
                                    &mut sections,
                                    VideoTag::Effect,
                                    &format!("effects: {}", kept.join(", ")),
                                    s0,
                                    s1,
                                );
                            }
                        }
                    }
                }

                // TRANSITION: a cut EVENT at the shot's ENTRIES, not a
                // sustained condition. Two windows, both sized by the
                // transition TYPE (closed table, deterministic):
                //   in  -> [0, in_dur]: the morph INTO this shot
                //   out -> [shot_f - out_dur, shot_f]: the morph OUT to the
                //          next shot (this was previously never emitted, so
                //          the model had no "how the shot leaves" signal and
                //          the morph became awkward mid-sequence)
                // hard_cut is a near-zero boundary change, not a windowed
                // event — it emits nothing (the cut reads from the clip
                // join itself), so we don't burn a section on it.
                let trans_window = |t: &str, shot_f: u32| -> Option<(u32, u32)> {
                    let d = match t {
                        // hard cuts = the clip join itself; no windowed cue.
                        "hard_cut" | "jump_cut" => 0,
                        // l_cut / j_cut: audio leads video ~0.5s
                        "l_cut" | "j_cut" => 12,
                        // match_cut: the match carries ~1s of overlap
                        "match_cut" => 24,
                        // wipe/dissolve/crossfade: a real envelope, scaled to
                        // the clip length (40% of a 10s shot, capped 24f)
                        "crossfade" | "dissolve" | "wipe" => {
                            (shot_f.saturating_mul(4) / 10).min(24)
                        }
                        _ => 0,
                    };
                    if d == 0 {
                        None
                    } else {
                        Some((0, d))
                    }
                };
                if let Some((ts, te)) = trans_window(&spec.transition_in, shot_f) {
                    add(&mut sections, VideoTag::Transition, &spec.transition_in, ts, te);
                }
                // OUT window: mirror of the in-window at the tail. Emitted
                // only when the shot actually morphs out (crossfade/dissolve/
                // wipe/match/l/j) — a hard-cut exit stays silent.
                let out_window = match spec.transition_out.as_str() {
                    "crossfade" | "dissolve" | "wipe" | "match_cut" | "l_cut" | "j_cut" => {
                        let d = trans_window(&spec.transition_out, shot_f)
                            .map(|(_, e)| e)
                            .unwrap_or(0);
                        if d > 0 && shot_f > d + 1 {
                            Some((shot_f - d, shot_f))
                        } else {
                            None
                        }
                    }
                    _ => None,
                };
                if let Some((ts, te)) = out_window {
                    add(
                        &mut sections,
                        VideoTag::Transition,
                        &format!("{} (out)", spec.transition_out),
                        ts,
                        te,
                    );
                }

                pipes.push(PlanPipe {
                    index: pipes.len(),
                    title: shot_title,
                    global_style: scene_style,
                    media_mode: "text".into(),
                    sections,
                    // One pipe per shot: lengthed to that shot's clip so the
                    // generated pipe matches its content (no dead tail).
                    length_frames: shot_f,
                });
            }
        }

        if pipes.is_empty() {
            // No scenes (shouldn't happen) — emit a single logline-shell pipe
            // so the plan always has ≥1 pipe and materialize can still run.
            pipes.push(PlanPipe {
                index: 0,
                title: self.novel.film.title.clone(),
                global_style: fallback_style,
                media_mode: "text".into(),
                sections: vec![PlanSection {
                    tag: VideoTag::Scene,
                    frame_start: 0,
                    frame_end: frames,
                    prompt: self.novel.film.logline.clone(),
                    from: vec![],
                }],
                // The logline-shell pipe carries one scene's worth of
                // content; length it to that shot's clip so materialize
                // matches content, not the 240-frame default floor.
                length_frames: frames,
            });
        }

        StructuredVideoPlan {
            flow_version,
            pipes,
        }
    }
}

/// Seed the deterministic S1/S2/S3 layers from a user `FilmSeed`.
fn normalize_seed(seed: FilmSeed) -> FilmSeed {
    let mut s = seed;
    // Clamp scenes/shots_per_scene/clip_s to the closed bounds.
    let scenes = s.scale.scenes.clamp(1, 24);
    let shots = s.scale.shots_per_scene.clamp(1, 5);
    let clip_min = s.scale.clip_s[0].clamp(4, 12).max(4);
    let clip_max = s.scale.clip_s[1].clamp(4, 12).max(4);
    s.scale = SeedScale { scenes, shots_per_scene: shots, clip_s: [clip_min, if clip_max < clip_min { clip_min } else { clip_max }] };
    s
}

/// S1 Node A — deterministic visual novel from the seed.
/// S1 Node A —" deterministic visual novel from the seed.
///
/// Follows the harness Node A contract (config/nodes.yaml + golden/
/// visual_novel.json): the expander WRITES saturated visual language, it
/// never echoes the seed. The idea gets exactly ONE home in the novel
/// (the film logline, compressed); the world/palette are DERIVED from the
/// G0 look axes; each shot prose is composed from its shot's camera
/// concern + a cycling sensory axis (the profile's
/// `sensory_axes: [light, color, motion, sound, texture, weather]`), and
/// beats use the harness micro-cue form
/// `<shot-size>: <subject> <motion> —" <light/sound detail>`.
fn build_novel(seed: &FilmSeed, tod: &str, weather: &str) -> VisualNovel {
    use crate::generation::video_flow::engine::types::FilmLook;

    // Title: explicit G0 title > first clause of the idea > "Untitled".
    let film_title = if seed.title.trim().is_empty() {
        title_from_idea(&seed.idea)
    } else {
        seed.title.trim().to_string()
    };
    let world = world_of(&seed.genre.name);
    let palette = palette_of(tod, weather);
    let logline = logline_of(&seed.idea);
    // Concrete, distributed idea fragments: the author's real content, split
    // so EVERY shot (across every scene) owns a distinct piece — never the
    // whole idea in one shot (no echo), never a truncated 3-word stub.
    let total_shots = (seed.scale.scenes as usize)
        .saturating_mul(seed.scale.shots_per_scene as usize)
        .max(1);
    let units = idea_units(&seed.idea, total_shots);

    let scenes: Vec<NovelScene> = (0..seed.scale.scenes)
        .map(|i| {
            let scene_num = i + 1;
            let shot_count = seed.scale.shots_per_scene as usize;
            let last_scene = i as u32 == seed.scale.scenes - 1;
            let shots: Vec<NovelShot> = (0..shot_count)
                .map(|k| {
                    let g = i as usize * shot_count + k;
                    let cam = shot_camera(g);
                    // This shot OWNS one distributed fragment of the author's
                    // idea — a meaningful narrative piece, not a truncated
                    // label and not the whole idea.
                    let frag = units.get(g).cloned().filter(|f| !f.is_empty()).unwrap_or_else(|| "the moment deepens".to_string());
                    // A concrete place (genre + time-of-day), not a raw
                    // world string. "sun-drenched street market", "cool blue city block",
                    // "dense pine forest" — a real, concrete, filmic space.
                    let place = concrete_place(&seed.genre.name, tod);
                    // A concrete action grounded in that place: the shot's own
                    // fragment (its piece of the idea) + a cycling sensory
                    // detail. No S3 camera tokens, no tod/weather tail — S4
                    // adds those.
                    let axis = SENSORY_AXES[g % SENSORY_AXES.len()];
                    let axis_desc = axis_phrase(axis, &world);
                    let prose = scene_sentence(g, &place, &frag, &axis_desc);
                    let beats = shot_beats(g, &cam, &frag, &world);
                    NovelShot { prose, beats }
                })
                .collect();
            // Scene prose: one concrete sentence — the scene's subject (from
            // its first fragment) grounded in the place, carrying the scene's
            // role, closed with a sensory detail. Reads as a narrative beat,
            // not a slice-dump of the author's text.
            let place = concrete_place(&seed.genre.name, tod);
            let first_frag = units
                .get(i as usize * shot_count)
                .cloned()
                .filter(|f| !f.is_empty())
                .unwrap_or_else(|| "the moment".to_string());
            let subject = subject_phrase(&first_frag);
            let role = if i == 0 {
                "the world is established here"
            } else if last_scene {
                "the arc resolves here"
            } else {
                "the story develops here"
            };
            let scene_axis = axis_phrase(
                SENSORY_AXES[i as usize % SENSORY_AXES.len()],
                &world,
            );
            let prose = format!(
                "In {place}, {subject}; {role}; {scene_axis}."
            );
            NovelScene {
                title: format!("Scene {scene_num}"),
                prose,
                shots,
            }
        })
        .collect();
    VisualNovel {
        film: FilmLook {
            title: film_title.to_string(),
            logline,
            style: seed.genre.style.clone(),
            world,
            palette,
            time_of_day: tod.to_string(),
            weather: weather.to_string(),
        },
        scenes,
    }
}

/// The idea's single home inside the novel: a compressed logline
/// (schema bound: strings < 300 chars, word-boundary safe).
fn logline_of(idea: &str) -> String {
    let t = idea.trim();
    if t.is_empty() {
        return "an untitled idea".into();
    }
    if t.chars().count() <= 290 {
        return t.to_string();
    }
    let mut out: String = t.chars().take(290).collect();
    let _ = out.rfind(' ').map(|p| out.truncate(p));
    out.trim_end().to_string()
}

/// Distribute the idea's content into `n` concrete narrative fragments, one
/// per shot across the whole run. This is the real "saturated" expander move:
/// the author's *content* is spread across shots so each shot owns a distinct,
/// meaningful piece — not a truncated 3-word label. A single-sentence idea is
/// split by word; a multi-sentence idea is split by clause (each clause itself
/// can be word-split). If there are more fragments than shots, the surplus is
/// folded into the last fragment so nothing is lost.
fn idea_units(idea: &str, n: usize) -> Vec<String> {
    let trimmed = idea.trim();
    if trimmed.is_empty() {
        return vec!["the moment deepens in the space".into()];
    }
    // Split into clauses (sentences / semicolons / commas) — the natural
    // narrative beats. If we have fewer clauses than shots, word-split the
    // surplus so every shot still gets something.
    let clauses: Vec<&str> = trimmed
        .split(['.', '!', '?', ';', ','])
        .map(|c| c.trim())
        .filter(|c| !c.is_empty())
        .collect();
    let mut parts: Vec<String> = if clauses.len() >= n && n > 1 {
        // Use the first `n` clauses (they carry the most distinct content).
        clauses.iter().take(n).map(|c| c.to_string()).collect()
    } else {
        // Word-level distribution: split the whole idea into words, group into
        // `n` roughly equal chunks. This is the "distribute the words" path.
        let words: Vec<&str> = trimmed.split_whitespace().collect();
        if words.is_empty() {
            return vec!["the moment deepens".into()];
        }
        let chunk = (words.len() + n - 1) / n.max(1);
        (0..n)
            .map(|i| {
                let lo = i * chunk;
                let hi = (lo + chunk).min(words.len());
                if lo >= words.len() {
                    String::new()
                } else {
                    words[lo..hi].join(" ")
                }
            })
            .collect()
    };
    // Fill to exactly `n` entries. When the author's idea is thinner than the
    // shot count, SPREAD the real content round-robin (never tail-repeat one
    // fragment across half the run) and drop empty slots so no shot is left
    // with blank prose. This is what stops "every pipe says the same thing."
    let pool: Vec<String> = parts
        .iter()
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty())
        .collect();
    parts.clear();
    for i in 0..n {
        parts.push(if pool.is_empty() {
            "the moment deepens".to_string()
        } else {
            pool[i % pool.len()].clone()
        });
    }
    parts
}

/// Cap a fragment at `max` words (word-boundary safe) so a fragment never
/// bleeds into the next shot's territory.
fn cap_words(text: &str, max: usize) -> String {
    text.split_whitespace().take(max).collect::<Vec<_>>().join(" ")
}

/// The profile's creative expansion axes (harness config/profiles.yaml,
/// cinema preset). Each shot cycles one, so sibling prose differs.
const SENSORY_AXES: [&str; 6] = ["light", "color", "motion", "sound", "texture", "weather"];

/// Derived film world from genre (closed keyword scan) — the *space* only;
/// time-of-day / weather stay their own fields so nothing doubles. No
/// leading article, so "the {world}" composes cleanly.
fn world_of(genre: &str) -> String {
    let g = genre.to_lowercase();
    if g.contains("documentary") {
        "wide real-world space, natural locations, available light, deep texture"
    } else if g.contains("anime") || g.contains("animation") {
        "stylized frame, bold color fields, clean composition, bold silhouettes"
    } else if g.contains("action") {
        "kinetic urban space, hard edges, high-contrast practicals, visible dust"
    } else {
        "lived-in cinematic space, motivated light, deep detail, tactile surfaces"
    }
    .to_string()
}

/// Derived palette from time-of-day + weather (what a real expander writes
/// instead of leaving the field "neutral").
fn palette_of(tod: &str, weather: &str) -> String {
    let base = match tod {
        "dawn" => "rose-gold dawn tones, soft contrast",
        "morning" => "clean golden morning light, fresh mid tones",
        "evening" => "amber dusk fading to cool teal, warm into cool",
        "night" => "cool blue night, low-key practicals, deep blacks",
        _ => "bright neutral daylight, crisp hard-edged contrast",
    };
    let wmod = if weather.trim().is_empty() || weather.eq_ignore_ascii_case("clear") {
        String::new()
    } else {
        format!(", {weather} softening the edges")
    };
    format!("{base}{wmod}")
}

/// NEW sensory detail only (one per shot). Deliberately omits tokens the S4
/// base/subject/concerns already carry (time-of-day, weather, palette, world,
/// the subject itself) so nothing duplicates in the derived prompts: the
/// S2 base owns the world/space context, S3 owns the camera mechanics.
fn axis_phrase(axis: &str, _world: &str) -> String {
    match axis {
        "light" => "dappled light shifts across the frame".into(),
        "color" => "soft tonal shifts settle into the grade".into(),
        "motion" => "background elements drift on their own rhythm".into(),
        "sound" => "a low ambient hum moves through the space".into(),
        "texture" => "fine surface detail reads in the open light".into(),
        "weather" => "air moves through the frame on its own".into(),
        _ => String::new(),
    }
}

/// A concrete, genre-anchored place that varies with time-of-day — the
/// golden's "a dense deciduous forest, mossy trails, tall pines". This is
/// what a real expander writes into the *scene prose*, not the raw G0
/// "world" string. Each shot reads like it happens IN a specific place.
fn concrete_place(genre: &str, tod: &str) -> String {
    let g = genre.to_lowercase();
    // Concrete place per genre (the golden's "a dense deciduous forest"
    // is what this should look like — specific, visual, filmic).
    let base = if g.contains("documentary") {
        "a wide real-world location, open sky and ground, visible texture"
    } else if g.contains("anime") || g.contains("animation") {
        "a stylized frame with bold color fields and clean composition"
    } else if g.contains("action") {
        "a kinetic urban space, hard edges and practical light, dust in the air"
    } else {
        "a lived-in cinematic space, motivated light, deep detail"
    };
    // Time-of-day modifier (keeps the place concrete and time-aware).
    let tod_mod = match tod {
        "dawn" => "at first light",
        "morning" => "in clean morning light",
        "evening" | "afternoon" => "as the light cools into dusk",
        "night" => "under low night light",
        _ => "in bright daylight",
    };
    format!("{base}, {tod_mod}")
}

/// A clean visual *subject noun* from a distributed fragment: skip leading
/// filler ("there", "and", "it"...), keep 1–2 content words so it names what
/// the shot is about WITHOUT re-carrying the fragment's own verb — the
/// sentence's verb is the cycling one, so "a girl" + "settles into", not
/// "a girl follows settles into". Capped at 2 words: enough to be a concrete
/// noun, short enough to read as a subject, not a clause dump.
fn subject_phrase(fragment: &str) -> String {
    let fillers = [
        "there", "then", "and", "it", "is", "in", "on", "at", "to", "of", "with", "as", "but",
        "the",
    ];
    let words: Vec<&str> = fragment.split_whitespace().collect();
    let mut chosen: Vec<&str> = Vec::new();
    for w in words.iter() {
        let lw = w.to_lowercase();
        // Skip leading fillers (and "the" before a noun) until the real
        // content word; then take up to 2 words.
        if chosen.is_empty() && fillers.iter().any(|f| f == &lw) {
            continue;
        }
        chosen.push(w);
        if chosen.len() >= 2 {
            break;
        }
    }
    if chosen.is_empty() {
        "the subject".to_string()
    } else {
        chosen.join(" ")
    }
}

/// Compose the concrete S1 shot-prose sentence: the shot's subject + a
/// cycling action + a specific place + one sensory detail, read as a complete
/// grammatical sentence (the golden's "the girl walks down a sunlit forest
/// corridor" pattern), not a raw word-slice of the user's text.
fn scene_sentence(g: usize, place: &str, fragment: &str, axis_detail: &str) -> String {
    let verbs = [
        "settles into",
        "drifts across",
        "moves through",
        "emerges in",
        "carries across",
    ];
    let verb = verbs[g % verbs.len()];
    let subject = subject_phrase(fragment);
    format!("{subject} {verb} {place}; {axis_detail}.")
}

/// One bounded `continuity:` line per pipe — the cross-pipe signal the
/// generated clips currently lose ("who is the same person as before, is
/// this the same place, and does the scene keep going"). Deliberately ONE
/// short line in the pipe's global_style (never per-slice), so the media
/// model gets the through-line without over-detail that makes it squash:
/// - shot 0 of scene 0 -> the film opens here;
/// - shot >0 in a scene -> continues the previous shot, same subject + place;
/// - shot 0 of a later scene -> the scene shifts place but the SAME subject
///   carries over (continuable across the cut).
/// `subject` = the film's principal (one word, the through-line), `locus` =
/// the scene's concrete place.
fn continuity_line(subject: &str, locus: &str, si: usize, ki: usize) -> String {
    if si == 0 && ki == 0 {
        format!("continuity: the film opens here — {subject} in {locus}")
    } else if ki == 0 {
        format!(
            "continuity: the scene shifts to {locus} but the same {subject} carries over from the previous scene"
        )
    } else {
        format!(
            "continuity: continues the previous shot — the same {subject} remains in {locus}"
        )
    }
}

/// Beats in the harness Node A micro-cue form:
/// `<shot-size>: <subject> <motion> — <light/sound detail>` (concrete, no
/// generic filler; the schema wants 2–4 cues). Each shot gets its own
/// non-overlapping 3-beat window: sizes cycle close-up→medium→wide, motion
/// verbs + sensory details offset by the global beat index, so sibling
/// shots' beats don't repeat and no beat re-states the S4 motion block.
fn shot_beats(g: usize, cam: &CameraConcern, frag: &str, world: &str) -> Vec<String> {
    let beat_sizes = ["close-up", "medium", "wide"];
    let beat_verbs = ["settles", "drifts", "presses forward"];
    let beat_details = [
        "light shifts on the frame",
        "sound swells under the beat",
        "the space settles into quiet",
    ];
    // Rotate the window by the shot index (g*3 is always ≡ 0 mod 3, which
    // is why the first version never rotated).
    let pick = |idx: usize| (g + idx) % 3;
    // Concrete beats: each anchors on the shot's own fragment + place, then
    // a micro-action. First beat uses the shot's real S3 size; the others
    // cycle. No generic filler, no re-stating the S4 motion block.
    let subject = cap_words(frag, 6);
    let sizes = [cam.size.as_str(), beat_sizes[pick(1)], beat_sizes[pick(2)]];
    vec![
        format!(
            "{}: {} {} in {} — {}",
            sizes[0],
            subject,
            beat_verbs[pick(0)],
            cap_words(world, 4),
            beat_details[pick(2)]
        ),
        format!(
            "{}: {} {} — {}",
            beat_sizes[pick(1)],
            subject,
            beat_verbs[pick(1)],
            beat_details[pick(0)]
        ),
        format!(
            "{}: {} {} — {}",
            beat_sizes[pick(2)],
            subject,
            beat_verbs[pick(2)],
            beat_details[pick(1)]
        ),
    ]
}

/// A deterministic short title from the first clause of the idea (capped at
/// 5 words) — replaces "Untitled" when G0 leaves the title empty.
fn title_from_idea(idea: &str) -> String {
    let first = idea.split(['.', '!', '?', ';', '\n']).next().unwrap_or(idea.trim());
    let t: Vec<&str> = first.split_whitespace().take(5).collect();
    if t.is_empty() {
        "Untitled".into()
    } else {
        t.join(" ")
    }
}



/// S2 Node A′ — per-scene base look. Seeded from the novel film + scene title.
/// Phase 1b: when a tree is present the scene's color temperature is set from
/// the owning branch's chained open/close K pair (the #3 fix promoted
/// per-branch — open[i] == close[i-1] exactly, so a cut in a continuous
/// scene never flickers warm↔cool); the hardcoded 5000K default is the
/// tree:None legacy fallback (byte-stable for old docs).
fn build_scene_spec(
    index: usize,
    _sc: &NovelScene,
    novel: &VisualNovel,
    genre: &str,
    tree: Option<&StructuralTree>,
) -> SceneSpec {
    // The branch owning this scene: the tree's branches are index-aligned
    // with the novel's scenes (both track the entry's scale.scenes). A scene
    // past the tree's branch count (the LLM's shot-count stretch) rides the
    // last branch's close K — the arc doesn't invent new branches.
    let scene_temp_k: u32 = match tree {
        Some(t) => t
            .branches
            .get(index)
            .map(|b| b.temp_open_k)
            .unwrap_or_else(|| {
                t.branches
                    .last()
                    .map(|b| b.temp_close_k)
                    .unwrap_or(5000)
            }),
        None => 5000,
    };
    SceneSpec {
        scene_id: format!("scene_{:02}", index + 1),
        time_of_day: novel.film.time_of_day.clone(),
        weather: novel.film.weather.clone(),
        light: LightingConcern {
            key: "soft".into(),
            contrast: "medium".into(),
            color_temp_k: scene_temp_k,
            pattern: Some("ambient".into()),
        },
        grade: GradeConcern {
            palette: "neutral".into(),
            saturation: "neutral".into(),
            contrast: "medium".into(),
            film_stock: "kodak_250d".into(),
        },
        // Real ambient cue from the genre (the golden fixture uses
        // "forest, birds"-style sound, not a bare scene title).
        ambience: ambience_of(genre),
        tempo: "medium".into(),
        effects_base: Vec::new(),
    }
}

/// A deterministic ambient-sound cue per genre (matches the harness golden
/// "ambience: forest, birds" shape — a real sound bed, not "Scene 1").
fn ambience_of(genre: &str) -> String {
    let g = genre.to_lowercase();
    if g.contains("documentary") {
        "natural location sound, wind, distant ambient life".into()
    } else if g.contains("anime") || g.contains("animation") {
        "stylized room tone, light foley".into()
    } else if g.contains("action") {
        "urban city hum, distant traffic, crowd murmur".into()
    } else {
        "quiet location ambience, soft natural sound bed".into()
    }
}

/// Per-shot concern variety, keyed on the global shot index `g`.
///
/// Deterministic + tag-closed: every value is a member of the corresponding
/// `TagVocabulary` set, so V2 tag-closure stays clean. The point is that
/// sibling shots no longer collapse into identical S4 prompts — the first
/// shot of a scene is the "establishing" wide, the last is the "resolving"
/// tight close, and the in-between shots walk focal length / framing /
/// motion so the whole sequence reads as real coverage, not one copy.
fn shot_camera(g: usize) -> CameraConcern {
    let sizes = ["wide", "medium", "close-up", "over-the-shoulder", "medium"];
    let angles = ["eye", "low", "eye", "high", "eye"];
    let framings = ["rule_of_thirds", "rule_of_thirds", "centered", "fill_frame", "negative_space"];
    let dos = ["deep", "medium", "shallow", "shallow", "medium"];
    // Establishing = wide/deep first, resolving = tight/shallow last.
    let size = if g == 0 { sizes[0] } else { sizes[g % sizes.len()] };
    let angle = if g == 0 { angles[0] } else { angles[g % angles.len()] };
    CameraConcern {
        size: size.to_string(),
        angle: angle.to_string(),
        framing: framings[g % framings.len()].to_string(),
        dof: dos[g % dos.len()].to_string(),
    }
}

fn shot_lens(g: usize) -> LensConcern {
    let focals: [u32; 5] = [24, 35, 50, 85, 35];
    LensConcern {
        focal_mm: focals[g % focals.len()],
        distortion: None,
    }
}

/// Phase 1b: the base focal length a tree LEAF's camera role implies, chosen
/// from the closed `TagVocabulary::lens_focal()` set so a leaf-driven spec
/// stays S5-verifiable. The leaf's `camera_role` is the structural intent;
/// this maps it to a concrete focal — wide establishing = wide lens, intimate
/// close = long lens, dynamic track / holding medium = mid lens. `None`
/// (a leaf past the branch's leaf count, the LLM shot-count stretch) keeps
/// the caller's cycling fallback.
fn focal_for_role(camera_role: &str) -> u32 {
    match camera_role {
        "establishing_wide" => 24,
        "intimate_close" => 85,
        "dynamic_track" => 50,
        // "holding_medium" + unknown/legacy → the neutral mid focal.
        _ => 35,
    }
}

fn shot_motion(g: usize) -> MotionConcern {
    let moves = ["static", "pan", "track", "dolly", "static"];
    let speeds = ["normal", "slow", "normal", "slow", "normal"];
    MotionConcern {
        r#move: moves[g % moves.len()].to_string(),
        zoom: "static".into(),
        speed: speeds[g % speeds.len()].to_string(),
    }
}

/// Per-shot sub-slice journey (the S3 delta-driven slices). Keyed on the
/// global shot index `g` so SIBLING shots tell DIFFERENT stories within the
/// same clip: a different camera path, focal path, light-temperature arc,
/// motion events, and slice split points. `g = 0` is the "establishing"
/// journey (close-up→medium→wide, 85→50→35mm, cool→warm, dolly then track);
/// every other shot varies. All values stay tag-closed.
/// S3 sub-slices, **content-driven**: the shot's Node A beats set the camera
/// journey + pacing. Each beat's closed-vocab shot-size prefix is the
/// ACTIVATION signal — when a beat parses a size, that beat drives its
/// sub-slice's concern state (lens / DoF / framing / lighting / motion) via
/// the editable `beat_profiles` table, and the table's `pacing_weight` sets
/// the slice's window width (wide establishes long, close-ups resolve short).
///
/// Guaranteed fallback: when NO beat carries a parseable size prefix, the
/// per-shot **cycling** journey below is used unchanged (the pre-existing
/// structure), so sibling variety is preserved and the S3 shape always holds.
/// V7 no-op slices are always collapsed, so every emitted slice adds a real
/// concern delta.
/// S3 sub-slices.
///
/// `content_driven` selects the ACTUATION layer (the user's question: is this
/// a new template or a content-driven one?):
/// - `content_driven == false` (the deterministic template/seed path): ALWAYS
///   the pre-existing per-shot **cycling** journey — sibling-variety by the
///   global shot index. This is the structure the fidelity test pins.
/// - `content_driven == true` (an LLM-authored novel, `build_with_novel`):
///   the shot's Node A beats set the camera journey + pacing. Each beat's
///   closed-vocab shot-size prefix is the activation signal — when it parses,
///   that beat drives its sub-slice's concern state (lens / DoF / framing /
///   lighting / motion) via the editable `beat_profiles` table, and the
///   table's `pacing_weight` sets the slice's window width (wide establishes
///   long, close-ups resolve short). Beats that DON'T parse a size prefix
///   fall back to the cycling journey, so the S3 shape always holds.
///
/// V7 no-op slices are always collapsed (against the shot's real base), so
/// every emitted slice adds a genuine concern delta.
fn shot_sub_slices(
    g: usize,
    clip: u32,
    shot_ref: &str,
    beats: &[String],
    base: &Concerns,
    content_driven: bool,
    tree_temps: Option<(u32, u32)>,
) -> Vec<SubSlice> {
    if !content_driven {
        return shot_sub_slices_cycling(g, clip, shot_ref, tree_temps);
    }
    let vocab = TagVocabulary::new();
    let profiles = beat_profiles::beat_profiles();
    let prefixes: Vec<String> =
        beats.iter().map(|b| beat_profiles::beat_prefix_of(b)).collect();
    // P1 total grammar: a beat's prefix resolves to a closed-vocab SIZE
    // (bare size or an alias like "low angle" → wide + low angle) or a
    // MOTION word ("tracking shot" → track delta).
    let sizes: Vec<Option<&'static str>> = prefixes
        .iter()
        .map(|p| beat_profiles::resolve_beat_size(p, &vocab))
        .collect();
    let motion_deltas: Vec<Option<(String, String, String)>> =
        prefixes.iter().map(|p| beat_profiles::motion_prefix_delta(p)).collect();

    // Activation gate: content drives the structure when at least one beat
    // resolves to a closed-vocab size (bare or alias) or a known motion
    // word. A shot whose beats resolve to NOTHING stays on the cycling
    // journey (byte-stable legacy — the P2 synth is a per-beat guarantee
    // inside the content path, not a per-shot activation).
    let any_resolved = (0..prefixes.len())
        .any(|i| sizes[i].is_some() || motion_deltas[i].is_some());
    if !any_resolved {
        return shot_sub_slices_cycling(g, clip, shot_ref, tree_temps);
    }

    // One slice per beat (S3 cap is 4). The table's pacing weight sets each
    // slice's window width (aliases ride their resolved size's weight;
    // motion / unknown beats are flat 1.0); normalized to fill the clip.
    let n = prefixes.len().min(4).max(1);
    let weights: Vec<f32> = (0..n)
        .map(|i| {
            sizes[i]
                .and_then(|s| profiles.get(s))
                .map(beat_profiles::pacing_of)
                .unwrap_or(1.0)
        })
        .collect();
    let total: f32 = weights.iter().sum::<f32>().max(1.0);
    let mut bounds = vec![0u32];
    let mut acc = 0f32;
    for i in 1..=n {
        acc += weights[i - 1];
        let px = ((acc / total) * clip as f32).round() as u32;
        bounds.push(px.clamp(i as u32, clip));
    }

    let roles = ["opens", "develops", "closes", "closes"];
    let mut slices = (0..n)
        .map(|i| {
            let prefix = prefixes.get(i).cloned().unwrap_or_default();
            let state = if let Some(size) = sizes.get(i).copied().flatten() {
                // P1: a closed-vocab size OR an alias-resolved angle word.
                // The alias's closed-vocab angle overrides the profile's
                // default "eye" so the LLM's angle intent survives.
                let mut st = beat_profiles::profile_state(size, profiles.get(size).expect("closed size always in the table"));
                if let Some(angle) = beat_profiles::alias_angle(&prefix) {
                    if let Some(cam) = st.camera.as_mut() {
                        cam.angle = angle.to_string();
                    }
                }
                st
            } else if let Some((zoom, move_, speed)) = &motion_deltas[i] {
                // P1: a motion word → a closed-vocab motion delta only
                // (camera / lens / lighting carry forward from the base).
                PartialConcerns {
                    motion: Some(MotionConcern {
                        zoom: zoom.clone(),
                        r#move: move_.clone(),
                        speed: speed.clone(),
                    }),
                    ..PartialConcerns::default()
                }
            } else {
                // P2 guarantee layer: a prefix that resolved to NEITHER a
                // size/alias NOR a motion word gets a DISTINCT synthesized
                // concern delta (idx-rotated, tag-closed) — a sub-slice can
                // never be a V7 no-op because of what the LLM said.
                beat_profiles::synth_unknown_beat_state(&prefix, i, &vocab)
            };
            let role = roles.get(i).copied().unwrap_or("develops");
            let beat_text = beats.get(i).cloned().unwrap_or_default();
            SubSlice {
                from_s: bounds[i],
                to_s: bounds[i + 1],
                note: format!("{shot_ref} {role}: {beat_text}"),
                state: Some(state),
                // Content-driven slices CARRY their beat text(s); the plan
                // reader prefers these over the positional beats.
                absorbed_beats: vec![beat_text],
            }
        })
        .collect();

    collapse_no_op_slices(&mut slices, base);
    slices
}

/// V7 no-op collapse against the shot's REAL base: a slice whose folded
/// effective concern state equals the previous slice's adds no information,
/// so a beat that says nothing new is absorbed into the previously-kept
/// slice's window (window extended, its beat text carried). This is what
/// keeps `verify`'s V7 invariant clean on content-driven slices (it folds
/// against `sp.concerns`, so the collapse must too — `Concerns::default()`
/// would be the wrong base).
fn collapse_no_op_slices(slices: &mut Vec<SubSlice>, base: &Concerns) {
    let states: Vec<Option<PartialConcerns>> =
        slices.iter().map(|s| s.state.clone()).collect();
    let eff = axes::fold(base, &states); // eff[i] = state before slice i
    let mut out: Vec<SubSlice> = Vec::new();
    for (i, s) in slices.iter().enumerate() {
        // Slice i is a no-op when its state adds nothing over the previous
        // folded state — the exact condition verify() checks (V7).
        let adds = out.is_empty() || !axes::diff(&eff[i], &eff[i + 1]).is_empty();
        if adds {
            out.push(s.clone());
        } else if let Some(last) = out.last_mut() {
            last.to_s = s.to_s.max(last.to_s);
            // Carry the dropped beat's text so no narrative content is lost.
            for b in &s.absorbed_beats {
                if !b.is_empty() && !last.absorbed_beats.iter().any(|k| k == b) {
                    last.absorbed_beats.push(b.clone());
                }
            }
        }
    }
    *slices = out;
}

/// The pre-existing per-shot **cycling** journey — the guaranteed structure
/// when beats carry no parseable shot-size prefixes (and the sibling-variety
/// source). Unchanged from the original S3 sub-slice builder, EXCEPT the
/// light-temperature arc: when `tree_temps` is `Some((open_k, close_k))` the
/// sub-slice's cool-open / warm-close states ride the OWNING BRANCH's chained
/// temp pair (the #3 fix promoted to the sub-slice level — no within-branch
/// flicker), instead of the `g % 6` cycling temp table. `None` = the
/// pre-tree cycling temps (byte-stable legacy / golden path).
fn shot_sub_slices_cycling(
    g: usize,
    clip: u32,
    shot_ref: &str,
    tree_temps: Option<(u32, u32)>,
) -> Vec<SubSlice> {
    // Camera size journey (start → mid → end).
    let cam = [
        ["close-up", "medium", "wide"],
        ["wide", "close-up", "medium"],
        ["medium", "wide", "close-up"],
        ["over-the-shoulder", "medium", "wide"],
        ["wide", "medium", "close-up"],
        ["medium", "close-up", "wide"],
    ][g % 6];
    let framing = [
        ["fill_frame", "rule_of_thirds", "centered"],
        ["centered", "fill_frame", "rule_of_thirds"],
        ["rule_of_thirds", "centered", "fill_frame"],
        ["negative_space", "rule_of_thirds", "centered"],
        ["fill_frame", "centered", "rule_of_thirds"],
        ["centered", "fill_frame", "symmetrical"],
    ][g % 6];
    let dof = [
        ["shallow", "medium", "deep"],
        ["deep", "shallow", "medium"],
        ["medium", "deep", "shallow"],
        ["shallow", "medium", "deep"],
        ["deep", "medium", "shallow"],
        ["medium", "shallow", "deep"],
    ][g % 6];
    let focal = [
        [85u32, 50, 35],
        [24, 35, 50],
        [35, 85, 50],
        [50, 24, 35],
        [14, 35, 85],
        [50, 135, 35],
    ][g % 6];
    // Light-temperature arc (open K, close K) + its pattern words.
    //
    // Phase 1b: when the run carries a structural tree, the open/close K
    // ride the OWNING BRANCH's chained temp pair (tree_temps) — the #3 fix
    // promoted to the sub-slice level, so a cut between two shots in a
    // continuous branch never flickers warm↔cool. The sub-slice camera /
    // focal / motion journeys still cycle on `g` (sibling variety), only
    // the temp arc is tree-driven. When `tree_temps` is `None` the
    // legacy `g % 6` cycling temp table is used unchanged (byte-stable).
    let (cycling_open, cycling_close, cycling_open_p, cycling_close_p): (u32, u32, &str, &str) =
        match g % 6 {
            0 => (4500, 5500, "cool", "warm"),
            1 => (5300, 4500, "warm", "cool"),
            2 => (4200, 5200, "cool", "warm"),
            3 => (4700, 5500, "soft", "warm"),
            4 => (5300, 4400, "warm", "cool"),
            _ => (5000, 5500, "neutral", "cool"),
        };
    // Tree temps win; the cycling table is the fallback. The temp PATTERN
    // words are derived from the temp RELATIONSHIP (warm close vs cool
    // close) so the closed-vocab V2 check stays clean.
    let (open_k, close_k) = match tree_temps {
        Some((o, c)) => (o, c),
        None => (cycling_open, cycling_close),
    };
    let temp_cooler_than_open = close_k < open_k;
    let (open_p, close_p) = if tree_temps.is_some() {
        if temp_cooler_than_open {
            ("warm", "cool")
        } else {
            ("cool", "warm")
        }
    } else {
        (cycling_open_p, cycling_close_p)
    };
    // Motion events, keyed per slice (None = no motion delta there).
    let m0: Option<(&str, &str)> = if g % 6 == 2 { Some(("push", "slow")) } else { None };
    let m1: Option<(&str, &str)> = match g % 6 {
        0 => Some(("dolly", "slow")),
        1 => Some(("crane", "fast")),
        3 => Some(("handheld", "fast")),
        _ => None,
    };
    let m2: Option<(&str, &str)> = match g % 6 {
        0 => Some(("track", "normal")),
        1 => Some(("pan", "normal")),
        2 => Some(("orbit", "normal")),
        3 => Some(("tilt", "normal")),
        4 => Some(("dolly", "slow")),
        _ => Some(("steadicam", "normal")),
    };
    // Slice split points (seconds): [0, mid], [mid, mid2], [mid2, clip].
    // Varying the split points so sibling shots don't share identical
    // sub-slice windows (the "same timespan" complaint).
    let (mid, mid2) = match g % 6 {
        0 => (clip / 3, clip * 2 / 3),
        1 => (clip / 2, clip * 3 / 4),
        2 => (clip * 2 / 3, clip * 5 / 6),
        3 => (clip / 4, clip * 3 / 4),
        4 => (clip / 2, clip * 4 / 5),
        _ => (clip * 2 / 5, clip * 4 / 5),
    };
    let mid = mid.max(1).min(clip - 1);
    let mid2 = mid2.max(mid + 1).min(clip);

    let motion_of = |mv: Option<(&str, &str)>| {
        mv.map(|(m, sp)| MotionConcern {
            zoom: "static".into(),
            r#move: m.to_string(),
            speed: sp.to_string(),
        })
    };
    let cam_c = |i: usize| {
        Some(CameraConcern {
            size: cam[i].into(),
            angle: "eye".into(),
            framing: framing[i].into(),
            dof: dof[i].into(),
        })
    };

    vec![
        SubSlice {
            from_s: 0,
            to_s: mid,
            note: format!("{shot_ref} opens"),
            state: Some(PartialConcerns {
                camera: cam_c(0),
                lens: Some(LensConcern { focal_mm: focal[0], distortion: None }),
                lighting: Some(LightingConcern { key: "soft".into(), contrast: "medium".into(), color_temp_k: open_k, pattern: Some(open_p.into()) }),
                motion: motion_of(m0),
                grade: None, effects: None, audio: None,
            }),
            absorbed_beats: Vec::new(),
        },
        SubSlice {
            from_s: mid,
            to_s: mid2,
            note: format!("{shot_ref} develops"),
            state: Some(PartialConcerns {
                camera: cam_c(1),
                lens: Some(LensConcern { focal_mm: focal[1], distortion: None }),
                motion: motion_of(m1),
                lighting: None, grade: None, effects: None, audio: None,
            }),
            absorbed_beats: Vec::new(),
        },
        SubSlice {
            from_s: mid2,
            to_s: clip,
            note: format!("{shot_ref} closes"),
            state: Some(PartialConcerns {
                camera: cam_c(2),
                lens: Some(LensConcern { focal_mm: focal[2], distortion: None }),
                lighting: Some(LightingConcern { key: "soft".into(), contrast: "medium".into(), color_temp_k: close_k, pattern: Some(close_p.into()) }),
                motion: motion_of(m2),
                grade: None, effects: None, audio: None,
            }),
            absorbed_beats: Vec::new(),
        },
    ]
}

/// S3 Node B + S2 division — concern-grouped shot specs (closed vocab defaults)
/// and the shot timeline at transition points.
///
/// Phase 1b: when `tree` is `Some`, the S0.5 structural tree drives the S3
/// production — each shot's base camera/lens comes from its branch's leaf via
/// `leaf_to_concerns` (the "brief" the leaf is: closed-vocab structural
/// intent, no prose), scene-entry shots carry the branch's energy-driven
/// `transition_in`, and a scene's last shot closes with the branch's
/// `transition_out`. The mood band layers ON TOP: it still owns the clip,
/// effects_base, contrast, and stamps the base motion. `tree == None` keeps
/// the legacy per-shot `g % N` cycling tables byte-exactly (old docs).
fn build_specs_and_timeline(
    seed: &FilmSeed,
    novel: &VisualNovel,
    scenes: &[SceneSpec],
    content_driven: bool,
    mood: Option<&MoodProfile>,
    tree: Option<&StructuralTree>,
) -> (Vec<ShotSpec>, SceneTimeline) {
    // M4: the mood band drives the S3 clip (its `clip_range` min, clamped to
    // the 4..10 engine cap) — the sub-slice journeys + S2 division all scale
    // off this same value, so the run stays V6-consistent. `None` = the
    // pre-M4 seed-scale clip.
    let clip = match mood {
        Some(p) => p.clip_range[0].clamp(4, 10),
        None => seed.scale.clip_s[0].clamp(4, 10),
    };
    // M4: transitions from the band's closed pair — [0] = the first shot's
    // in, [1] = every other in + every out. `None` = the pre-M4 defaults
    // (first hard_cut, rest crossfade, out crossfade).
    let (first_in, default_in, out) = match mood {
        Some(p) => (
            p.transitions[0].clone(),
            p.transitions[1].clone(),
            p.transitions[1].clone(),
        ),
        None => ("hard_cut".into(), "crossfade".into(), "crossfade".into()),
    };
    // Phase 1b: the tree's branch-level transition intents (index-aligned
    // with the novel's scenes; a scene past the tree's branch count — the
    // LLM's shot-count stretch — falls back to the band values).
    let branch_in_all: Vec<String> = tree
        .map(|t| t.branches.iter().map(|b| b.transition_in.clone()).collect())
        .unwrap_or_default();
    let branch_out_all: Vec<String> = tree
        .map(|t| t.branches.iter().map(|b| b.transition_out.clone()).collect())
        .unwrap_or_default();
    // P4 (2026-11-10) NOTE: per-scene dwell (distribute the target budget
    // across scenes by role weight) is INTENTIONALLY not wired here yet —
    // it requires the marker-bridge structure step (`plan_from_engine`) to
    // tile its per-pipe frame ranges off the SAME per-scene clips, else the
    // S5 V6 invariant ("sum of generated pipe lengths == cumulative S3
    // frames") drifts. Until that structure-step alignment lands, every shot
    // keeps the flat band `clip` (byte-stable). The art-director dwell is the
    // next seam; P1/P2 (content-aware scene/shot COUNT + the soft target
    // budget in `resolve_run_scale`) already make a rich idea read at the
    // right length instead of the frozen 1×2.
    let mut specs: Vec<ShotSpec> = Vec::new();
    let mut tl_scenes: Vec<TimelineScene> = Vec::new();

    for (si, sc) in novel.scenes.iter().enumerate() {
        let scene = &scenes[si];
        // Phase 1b: the branch owning this scene (its entry/exit intent).
        let branch_in = branch_in_all
            .get(si)
            .cloned()
            .unwrap_or(if si == 0 {
                first_in.clone()
            } else {
                default_in.clone()
            });
        let branch_out = branch_out_all.get(si).cloned().unwrap_or(out.clone());
        let mut tl_shots: Vec<TimelineShot> = Vec::new();
        for (ki, kshot) in sc.shots.iter().enumerate() {
            let shot_num = ki + 1;
            let shot_ref = format!("scene_{si}.shot_{shot_num}");
            let shot_id = format!("tl_{:02}_shot_{:02}", si + 1, shot_num);

            // S3 — ShotSpec: concern-grouped, closed defaults.
            let g = si * sc.shots.len() + ki;
            // Phase 1b: the leaf driving this shot's base camera/lens/motion
            // (closed vocab via leaf_to_concerns). The branch's leaf count is
            // the AUTO shots-per-scene; an LLM stretch (more shots) or a
            // missing branch falls back to the cycling tables (legacy shape).
            let leaf = tree
                .and_then(|t| t.branches.get(si))
                .and_then(|b| b.leaves.get(ki));
            let (camera, lens, motion_base) = match leaf {
                Some(l) => {
                    let (c, ln, m) = leaf_to_concerns(l, focal_for_role(&l.camera_role));
                    (c, ln, m)
                }
                None => (shot_camera(g), shot_lens(g), shot_motion(g)),
            };
            let mut concerns = Concerns {
                camera,
                lens,
                motion: motion_base,
                lighting: scene.light.clone(),
                grade: scene.grade.clone(),
                effects: Vec::new(),
                audio: AudioConcern {
                    foley: String::new(),
                    sfx: String::new(),
                    music_cue: String::new(),
                    silence: false,
                },
            };
            // M4: the mood band OVERRIDES the deterministic defaults — the
            // shot's base move/speed come from the band (with the band's
            // `camera_move` standing in when its base motion is static, so a
            // static band still carries a closed camera move), and the shot
            // effects start as the scene's mood-scaled `effects_base`.
            if let Some(p) = mood {
                let move_ = if p.motion == "static" { p.camera_move } else { p.motion };
                concerns.motion = MotionConcern {
                    r#move: move_.to_string(),
                    zoom: "static".into(),
                    speed: p.speed.to_string(),
                };
                // Shots inherit the scene's effects_base as their own
                // effects (the delta form stays empty; the S4 merge
                // de-dupes scene-base ∪ shot-delta, so this is clean).
                concerns.effects = scene.effects_base.clone();
            }
            // Sub-timeline: content-driven when this is an LLM novel (the
            // beat shot-size prefixes set the journey + pacing via the
            // editable beat_profiles table); the per-shot cycling journey is
            // the guaranteed fallback (template path, or unparseable beats).
            // Phase 1b: when a tree is present, the sub-slice's temp arc
            // rides the OWNING BRANCH's chained open/close K (the #3 fix at
            // the sub-slice level) instead of the legacy g%6 cycling temps;
            // the camera / focal / motion journeys still cycle on `g`.
            let tree_temps: Option<(u32, u32)> = tree
                .and_then(|t| t.branches.get(si))
                .map(|b| (b.temp_open_k, b.temp_close_k));
            let beats = kshot.beats.clone();
            let sub =
                shot_sub_slices(g, clip, &shot_ref, &beats, &concerns, content_driven, tree_temps);
            // Phase 1b: the scene's ENTRY shot carries the branch's
            // energy-driven transition_in; interior shots keep the band's
            // within-scene default (the tree models cuts at the branch level,
            // not per shot).
            let trans_in = if ki == 0 { branch_in.clone() } else { default_in.clone() };
            // Phase 1b: the scene's LAST shot closes with the branch's
            // transition_out; interior shots keep the band's out.
            let shot_out = if ki + 1 == sc.shots.len() {
                branch_out.clone()
            } else {
                out.clone()
            };
            specs.push(ShotSpec {
                shot_id: shot_id.clone(),
                novel_ref: shot_ref.clone(),
                content: ShotContent {
                    prose: kshot.prose.clone(),
                    beats: kshot.beats.clone(),
                },
                clip_s: clip,
                transition_in: trans_in,
                transition_out: shot_out.clone(),
                concerns,
                sub_timeline: sub,
            });

            // S2 division: timeline shot.
            tl_shots.push(TimelineShot {
                shot_id: shot_id.clone(),
                novel_ref: shot_ref.clone(),
                clip_s: clip,
                transition_out: shot_out,
                transition_note: format!("cut to next in scene {}", si + 1),
            });
        }
        tl_scenes.push(TimelineScene {
            scene_id: format!("scene_{:02}", si + 1),
            title: sc.title.clone(),
            transition_in: branch_in,
            transition_note: "scene entry".into(),
            time_of_day: novel.film.time_of_day.clone(),
            weather: novel.film.weather.clone(),
            shots: tl_shots,
        });
    }

    // S2 division total = the CUMULATIVE shot-clip length: sum of the
    // actual S3 shot clips (the clamped values each spec carries), NOT the
    // raw G0 scale clip. This is what V6 compares the generated pipes
    // against — one generated pipe per shot, each lengthed to its clip.
    let total_s: u32 = specs.iter().map(|s| s.clip_s).sum();
    let timeline = SceneTimeline {
        timeline_id: "tl_01".into(),
        total_s,
        scenes: tl_scenes,
    };
    (specs, timeline)
}

/// The shot-molecule form (delta-from-scene), ready for `derive_full`.
fn make_molecule(sp: &ShotSpec, scene: &SceneSpec) -> ShotMolecule {
    ShotMolecule {
        inherit: scene.scene_id.clone(),
        subject: sp.content.prose.clone(),
        composition: CameraConcern {
            size: sp.concerns.camera.size.clone(),
            angle: sp.concerns.camera.angle.clone(),
            framing: sp.concerns.camera.framing.clone(),
            dof: sp.concerns.camera.dof.clone(),
        },
        lens: sp.concerns.lens.clone(),
        motion: sp.concerns.motion.clone(),
        effects_delta: sp.concerns.effects.clone(),
        audio: sp.concerns.audio.clone(),
        transition_in: sp.transition_in.clone(),
        transition_out: sp.transition_out.clone(),
        clip_s: sp.clip_s,
        prompts: crate::generation::video_flow::engine::types::Prompts {
            image: String::new(),
            video: String::new(),
        },
    }
}

// ── Entry surface: the UI's S0 input (with UI-driven overrides) ───────────
/// The S0 input the UI submits to a run. A subset of `FilmSeed` that the UI
/// actually authorizes — genre/style/ratio/scale + the two film-look axes
/// (`time_of_day`, `weather`) that the UI lets the user tune at G0.
///
/// Serialized as `snake_case` to match the harness wire schema (film_seed).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct EngineEntry {
    pub title: String,
    pub idea: String,
    /// Verbatim user text (display-only; LLM reads `idea`).
    #[serde(default)]
    pub input_text: Option<String>,
    pub genre: Genre,
    /// "16:9" | "9:16" | "1:1".
    #[serde(default = "default_ratio")]
    pub ratio: String,
    pub scale: SeedScale,
    /// G0 overridable look axes (feed S1/S2 seeding).
    #[serde(default = "default_tod")]
    pub time_of_day: String,
    #[serde(default = "default_weather")]
    pub weather: String,
    /// M4 — the 0..100 "Subtle ↔ Cinematic" mood slider. An ENTRY-level
    /// control: `MoodProfile::for_mood` maps the band onto the deterministic
    /// S2/S3 seeding (clip length, transitions, base motion, effects,
    /// contrast, default camera move) + the one Node A prompt line (llm.rs).
    /// It is deliberately NOT on `FilmSeed` (byte-stable) and never lands in
    /// the persisted seed. Old persisted docs / seed cards without the key
    /// parse as 50 (balanced) via the serde default below.
    #[serde(default = "default_mood")]
    pub mood: u8,
    /// Manual-override pins for the S0.5 structural tree (the "always give
    /// the user a manual opportunity" rule). Absent on old entries / seed
    /// cards → parses as no-pins via the serde default below; the tree's
    /// auto values win wherever a pin is missing.
    #[serde(default)]
    pub overrides: crate::generation::video_flow::engine::tree::TreeOverrides,
}

fn default_ratio() -> String { "16:9".into() }
fn default_tod() -> String { "midday".into() }
fn default_weather() -> String { "clear".into() }
/// M4 default: 50 = the "balanced" band.
fn default_mood() -> u8 { 50 }

impl Default for EngineEntry {
    fn default() -> Self {
        Self {
            title: String::new(),
            idea: String::new(),
            input_text: None,
            genre: Genre::default(),
            ratio: default_ratio(),
            scale: SeedScale::default(),
            time_of_day: default_tod(),
            weather: default_weather(),
            mood: default_mood(),
            overrides: Default::default(),
        }
    }
}

/// M4: the "Subtle ↔ Cinematic" mood slider (0..100) mapped onto the
/// deterministic S2/S3 engine parameters. Every tag value is a member of the
/// closed `TagVocabulary`:
/// - `transitions` / `motion` / `camera_move` ∈ transition() / move_set()
/// - `speed` ∈ speed() · `contrast` ∈ light_contrast() ∩ grade_contrast()
/// - `clip_range` bounds the S3 clip choice (the spec build clamps to the
///   engine's 4..10s cap, so the cinematic band's 12s max lands at 10s)
/// - `effect_count` items are taken from the closed effects() set (stable
///   BTreeSet order, skipping the "none" sentinel).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MoodProfile {
    /// [min, max] clip seconds the band draws from (the spec build picks the
    /// band's min, clamped to the 4..10 engine cap).
    pub clip_range: [u32; 2],
    /// [first-shot transition_in, default transition_in] · transition_out is
    /// always index [1].
    pub transitions: [String; 2],
    /// The base shot move (MotionConcern.move) the band stamps on shots.
    pub motion: &'static str,
    /// The base shot speed (MotionConcern.speed).
    pub speed: &'static str,
    /// How many effects() items the scene's effects_base carries.
    pub effect_count: u8,
    /// The scene light + grade contrast.
    pub contrast: &'static str,
    /// The default camera move for shots that sit static (motion == "static").
    pub camera_move: &'static str,
}

impl MoodProfile {
    /// The three closed bands:
    /// - subtle    0..=33   : clip [6,8],   hard_cut/cut_on_action, static move,
    ///   fast, 0 effects, medium contrast, static default camera move
    /// - balanced  34..=66  : clip [8,10],  hard_cut/crossfade,     pan move,
    ///   normal, 1 effect, medium contrast, dolly default camera move
    /// - cinematic 67..=100 : clip [10,12], match_cut/crossfade,    crane move,
    ///   slow, 3 effects, high contrast, crane default camera move
    pub fn for_mood(mood: u8) -> Self {
        match mood {
            0..=33 => Self {
                clip_range: [6, 8],
                transitions: ["hard_cut".into(), "cut_on_action".into()],
                motion: "static",
                speed: "fast",
                effect_count: 0,
                contrast: "medium",
                camera_move: "static",
            },
            34..=66 => Self {
                clip_range: [8, 10],
                transitions: ["hard_cut".into(), "crossfade".into()],
                motion: "pan",
                speed: "normal",
                effect_count: 1,
                contrast: "medium",
                camera_move: "dolly",
            },
            _ => Self {
                clip_range: [10, 12],
                transitions: ["match_cut".into(), "crossfade".into()],
                motion: "crane",
                speed: "slow",
                effect_count: 3,
                contrast: "high",
                camera_move: "crane",
            },
        }
    }

    /// The band name for the Node A mood line (llm.rs).
    pub fn band(&self) -> &'static str {
        match self.effect_count {
            0 => "subtle",
            1 => "balanced",
            _ => "cinematic",
        }
    }

    /// The scene's mood-scaled `effects_base`: the first `effect_count`
    /// closed-vocab effect tags (stable BTreeSet order, skipping the "none"
    /// sentinel). Subtle (0) = empty, balanced (1) = one, cinematic (3) =
    /// three. This is what the S2 scene spec seeds so the whole run reads
    /// "subtle" or "cinematic" before any shot-level delta lands.
    pub fn effects_base(&self) -> Vec<String> {
        if self.effect_count == 0 {
            return Vec::new();
        }
        let mut tags: Vec<&'static str> = TagVocabulary::new()
            .effects()
            .iter()
            .filter(|e| **e != "none")
            .map(|e| *e)
            .collect();
        tags.truncate(self.effect_count as usize);
        tags.into_iter().map(|t| t.to_string()).collect()
    }

    /// A one-line Node A mood directive (llm.rs). Tells the model how the
    /// film should FEEL so its prose paces toward the band — subtle (quiet,
    /// sparse) vs cinematic (slow moves, layered light + effects).
    pub fn directive(&self) -> &'static str {
        match self.band() {
            "subtle" => "Mood: subtle — restrained, quiet, sparse effects; let the light and stillness carry it.",
            "cinematic" => "Mood: cinematic — slow deliberate moves, layered light and effects, high contrast, rich sensory detail.",
            _ => "Mood: balanced — natural pacing, moderate effects, steady sensory texture.",
        }
    }
}

impl EngineEntry {
    /// Convert to a `FilmSeed`, injecting the G0 look axes into the style.
    pub fn to_seed(&self) -> FilmSeed {
        // The idea is what the LLM/expand reads: never let it degrade to an
        // empty seed (G0 may have run with input_text populated and idea
        // empty). Fall back to the verbatim text, then to a named default.
        let idea = if self.idea.trim().is_empty() {
            self.input_text
                .clone()
                .map(|t| t.trim().to_string())
                .filter(|t| !t.is_empty())
                .unwrap_or_else(|| "untitled idea".into())
        } else {
            self.idea.trim().to_string()
        };
        // An empty G0 title resolves to the first idea clause at S0, so the
        // persisted seed is complete (V1 "seed.title is empty" stays clean).
        let title = if self.title.trim().is_empty() {
            title_from_idea(&idea)
        } else {
            self.title.trim().to_string()
        };
        FilmSeed {
            title,
            idea,
            input_text: self.input_text.clone(),
            genre: self.genre.clone(),
            ratio: self.ratio.clone(),
            scale: self.scale.clone(),
        }
    }

    /// Build an S0→S5 run, injecting the G0 look axes into the seed-driven novel.
    /// M4: the entry's `mood` band also drives the deterministic S2/S3 seeding
    /// (clip, transitions, base motion, effects, contrast) so one slider value
    /// reshapes the whole run; mood-50 = the pre-M4 pinned structure.
    ///
    /// Structural tree (S0.5): this entry-level builder attaches the tree so
    /// it's present on EVERY template run (Phase 1a — S3 production is
    /// unchanged; the tree drives S2/S3 from Phase 1b). The intent comes from
    /// the entry's own idea text, so a template run needs no external
    /// `IntentSnapshot`.
    pub fn build_run(&self) -> EngineRun {
        use crate::generation::video_flow::engine::tree::{
            build_structural_tree, TREE_VERSION,
        };
        use crate::generation::video_flow::intent::IntentSnapshot;
        let seed = self.to_seed();
        // The G0 look axes steer S1 (novel world/palette/light) + S2
        // (scene light) directly — they are NOT baked into the style string,
        // which stays the pure G0 genre/style author value (no doubling).
        // S2 specs + S4 prompts inherit the axes from the novel film, so no
        // post-build patch is needed.
        let novel = build_novel(&seed, &self.time_of_day, &self.weather);
        let profile = MoodProfile::for_mood(self.mood);
        // Phase 1b: build the structural tree FIRST — from this entry's idea
        // + the entry's override pins (self-contained: no external
        // `IntentSnapshot` needed) — then THREAD it into the S2/S3 build so
        // the tree actually drives the production (scene color-temperature
        // from the branch arc, branch-boundary transitions, leaf-resolved
        // base camera/lens/motion), not just ride along on the run.
        let intent = IntentSnapshot::new(&self.idea);
        let tree = build_structural_tree(&intent, self, &self.overrides);
        let _ = TREE_VERSION; // the tree's `v` is set inside build_structural_tree
        let mut run = EngineRun::build_with_novel_mood(
            seed,
            novel,
            &self.time_of_day,
            &self.weather,
            ExpansionSource::Template,
            None,
            Some(&profile),
            Some(&tree),
        );
        run.tree = Some(tree);
        run
    }
}

// ── Tests: the S4 "identical prompts" + idea-restoration gaps are closed ──

#[cfg(test)]
mod seed_tests {
    use super::*;
    use crate::generation::video_flow::engine::types::{Genre, SeedScale};

    fn entry(idea: &str) -> EngineEntry {
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
                scenes: 1,
                shots_per_scene: 3,
                clip_s: [8, 10],
            },
            time_of_day: "midday".into(),
            weather: "clear".into(),
            mood: 50,
            overrides: Default::default(),
        }
    }

    /// The two S4 shots of one scene must no longer be identical: the
    /// per-shot concern table + sensory-axis prose differentiate them.
    #[test]
    fn sibling_shots_produce_different_prompts() {
        let run = entry("a girl follows the river road north at dusk").build_run();
        let mol = &run.molecules;
        assert!(mol.len() >= 3);
        assert_ne!(
            mol[0].prompts.image, mol[1].prompts.image,
            "sibling S4 image prompts must differ"
        );
        assert_ne!(mol[0].composition, mol[1].composition, "per-shot camera variety");
    }

    /// M4 mood-drift guard: the deterministic template path (build_run) must
    /// respond to the entry's mood band. Same idea, two moods → the run's
    /// S2/S3 seeding differs (clip, transitions, base motion, effects,
    /// contrast), proving the mood slider actually reshapes the film rather
    /// than being a no-op. Also pins that mood-50 (the default / balanced
    /// band) keeps the pre-M4 pinned structure (byte-stable for old docs).
    #[test]
    fn mood_drifts_deterministic_structure() {
        let base = entry("a red fox darts through the tall pine forest at dusk as golden light spills across the meadow");

        // The band edges (subtle = 0..=33, cinematic = 67..=100) must differ
        // in at least one of the mood-driven knobs.
        let subtle = {
            let mut e = base.clone();
            e.mood = 10;
            e.build_run()
        };
        let balanced = {
            let mut e = base.clone();
            e.mood = 50;
            e.build_run()
        };
        let cinematic = {
            let mut e = base.clone();
            e.mood = 90;
            e.build_run()
        };

        // Clip length: the mood band's clip_range min is clamped to the
        // 4..10 engine cap — subtle draws a shorter clip than cinematic.
        let clip_of = |run: &EngineRun| run.specs.first().expect("at least one spec").clip_s;
        assert!(
            clip_of(&subtle) < clip_of(&cinematic),
            "subtle clip {} must be shorter than cinematic clip {}",
            clip_of(&subtle),
            clip_of(&cinematic)
        );

        // Transitions: the band's transition pair differs across moods.
        let trans_of = |run: &EngineRun| {
            let sp = run.specs.first().expect("at least one spec");
            (sp.transition_in.clone(), sp.transition_out.clone())
        };
        assert_ne!(
            trans_of(&subtle),
            trans_of(&cinematic),
            "subtle vs cinematic transitions must differ"
        );

        // Effects: subtle (0) carries no base effects, cinematic (3) carries
        // the first three closed-vocab effect tags.
        assert_eq!(subtle.scenes[0].effects_base.len(), 0, "subtle = 0 base effects");
        assert_eq!(cinematic.scenes[0].effects_base.len(), 3, "cinematic = 3 base effects");
        assert!(cinematic.scenes[0].effects_base.iter().all(|e| e != "none"), "no 'none' sentinel leaks into effects_base");

        // Contrast: cinematic bumps the scene light+grade to "high".
        assert_eq!(cinematic.scenes[0].light.contrast, "high", "cinematic contrast = high");
        assert_eq!(subtle.scenes[0].light.contrast, "medium", "subtle contrast = medium");

        // The balanced band (mood 50) is the pre-M4 pin: transitions fall
        // back to hard_cut/crossfade and the run stays verified end-to-end.
        assert_eq!(balanced.specs[0].transition_in, "hard_cut", "balanced default transition_in");
        assert_eq!(balanced.specs[0].transition_out, "crossfade", "balanced default transition_out");
        assert!(balanced.verify.verified, "balanced-band run stays S5 verified");
        assert_eq!(balanced.scenes[0].effects_base.len(), 1, "balanced = 1 base effect");
    }

    /// I9 concrete-pipes proof: the engine plan materializes into composer
    /// pipes whose Scene sections carry the shot's *derived concrete image
    /// prompt* (not the coarse marker-bridge clauses), and validate +
    /// materialize both succeed on that plan. This is exactly what
    /// `director_apply_flow` runs now.
    #[test]
    fn engine_plan_materializes_concrete_composer_pipes() {
        use crate::generation::video_flow::config::FlowConfig;
        use crate::generation::video_flow::{materialize_pipes, validate_plan};

        let run = entry("a girl follows the river road north at dusk").build_run();
        let cfg = FlowConfig::default_flow();
        let plan = run.plan_from_engine(1);

        // One composer pipe per SHOT (not per scene), and each shot's pipe is
        // split into its own concrete concern sections — the structure the
        // user asked for, not one S4 blob per shot.
        let total_shots: usize =
            run.novel.scenes.iter().map(|s| s.shots.len()).sum::<usize>();
        assert_eq!(
            plan.pipes.len(),
            total_shots,
            "one pipe per shot (concrete structure)"
        );

        // Each shot pipe carries multiple DISTINCT concern tags (scene /
        // camera / motion / lighting / transition), not a single @scene blob.
        let p0 = &plan.pipes[0];
        let distinct_tags: std::collections::HashSet<_> =
            p0.sections.iter().map(|s| s.tag).collect();
        assert!(
            distinct_tags.len() >= 3,
            "shot pipe splits into ≥3 concrete concern tags, got {}",
            p0.sections.len()
        );

        // The bridge plan must still satisfy the flow's structural caps so
        // `director_apply_flow`'s validate gate passes.
        validate_plan(&plan, &cfg.structure).expect("engine plan passes validate_plan");
        let pipes = materialize_pipes(&plan, &cfg.materialize).expect("engine plan materializes");
        assert_eq!(pipes.len(), total_shots, "one composer pipe per shot");

        // Each materialized pipe lowers its concrete concern sections into ONE
        // zone, whose sub-tags are real concrete text (>3 chars) and all nest
        // inside the zone's concrete boundary.
        let p0m = &pipes[0];
        let timeline = p0m
            .elements
            .iter()
            .find(|e| matches!(e, crate::models::composer::PipeElement::Timeline(_)))
            .expect("timeline element present");
        if let crate::models::composer::PipeElement::Timeline(t) = timeline {
            assert_eq!(t.segments.len(), 1, "one concrete zone per shot pipe");
            let zone = &t.segments[0];
            assert!(zone.tags.len() >= 3, "zone nests the concrete concern tags");
            for tg in &zone.tags {
                let prompt = tg.prompt.as_deref().unwrap_or("");
                assert!(
                    prompt.trim().len() > 3,
                    "section prompt is concrete concern text, got: '{prompt}'"
                );
                assert!(
                    tg.frame_start >= zone.frame_start && tg.frame_end <= zone.frame_end,
                    "sub-tag {} nests inside the zone boundary",
                    tg.tag
                );
            }
        }
    }

    /// Fidelity guard for the concrete structure (user directive): the
    /// `plan_from_engine` output — the one the Extract tab's TS mirror and
    /// `director_apply_flow_edited` both address — is pinned EXACTLY.
    /// Any change to the per-pipe tag sequence, the concern-text format, or
    /// the skip-empty rule in seed.rs/derive.rs breaks this test, so a
    /// drifted TS mirror is caught at build time, not in production.
    #[test]
    fn engine_plan_structure_is_pinned_exactly() {
        use crate::generation::video_flow::plan::VideoTag;

        let run = entry("a girl follows the river road north at dusk").build_run();
        let plan = run.plan_from_engine(1);

        // 3 shots per scene → 3 pipes, one per shot.
        assert_eq!(plan.pipes.len(), 3, "one pipe per shot");

        // Pin pipe 0 = the "establishing" journey (g=0): close-up→medium→wide,
        // 85→50→35mm, cool→warm light, dolly then track. The concern events
        // are DELTA-DRIVEN: a concern emits a windowed section only at the
        // sub-slice where it actually changes.
        fn tags_of(p: &crate::generation::video_flow::PlanPipe) -> Vec<VideoTag> {
            p.sections.iter().map(|s| s.tag).collect()
        }
        let establishing_seq = vec![
            VideoTag::Scene,
            VideoTag::Camera,
            VideoTag::Lighting, // slice 0: cool open (4500K)
            VideoTag::Scene,
            VideoTag::Camera,
            VideoTag::Motion, // slice 1: dolly
            VideoTag::Scene,
            VideoTag::Camera,
            VideoTag::Lighting, // slice 2: warm close (5500K)
            VideoTag::Motion, // slice 2: track
            VideoTag::Transition, // cut-in event
        ];
        assert_eq!(
            tags_of(&plan.pipes[0]),
            establishing_seq,
            "pipe 0 (establishing journey) carries the delta-driven concern events"
        );

        // The whole point of per-shot journeys: sibling shots must NOT be
        // identical copies. Each shot's camera path, focal path, light-temp
        // arc, motion events, and slice split points vary with the global
        // shot index, so no two pipes have the same (tag, range, prompt)
        // section list.
        fn sections_key(
            p: &crate::generation::video_flow::PlanPipe,
        ) -> Vec<(VideoTag, u32, u32, String)> {
            p.sections
                .iter()
                .map(|s| (s.tag, s.frame_start, s.frame_end, s.prompt.clone()))
                .collect()
        }
        let k0 = sections_key(&plan.pipes[0]);
        let k1 = sections_key(&plan.pipes[1]);
        let k2 = sections_key(&plan.pipes[2]);
        assert_ne!(k0, k1, "shot 1's structure differs from the establishing shot");
        assert_ne!(k0, k2, "shot 2's structure differs from the establishing shot");
        assert_ne!(k1, k2, "the three sibling shots are pairwise distinct");

        // ARCS tile the shot (open/develop/close sub-slice windows, 24fps);
        // each Camera arc overlaps its matching Scene arc in the same window.
        let shot_f: u32 = run.specs[0].clip_s * 24;
        let p0 = &plan.pipes[0];
        let scenes: Vec<_> = p0.sections.iter().filter(|s| s.tag == VideoTag::Scene).collect();
        let cams: Vec<_> = p0.sections.iter().filter(|s| s.tag == VideoTag::Camera).collect();
        assert_eq!(scenes.len(), 3, "one scene arc per S3 sub-slice");
        assert_eq!(cams.len(), 3, "camera event rides every sub-slice");
        for i in 0..3 {
            assert_eq!(
                (scenes[i].frame_start, scenes[i].frame_end),
                (cams[i].frame_start, cams[i].frame_end),
                "camera arc {i} overlaps its scene arc window"
            );
        }
        assert_eq!((scenes[0].frame_start, scenes[0].frame_end), (0, 48), "arc 0 opens");
        assert_eq!((scenes[1].frame_start, scenes[1].frame_end), (48, 120), "arc 1 develops");
        assert_eq!((scenes[2].frame_start, scenes[2].frame_end), (120, shot_f), "arc 2 closes");
        // DELTA-DRIVEN: lighting fires only on the cool-open + warm-close
        // slices (2 sections, not a whole-shot slab); motion only on
        // develop + close (dolly then track).
        let lts: Vec<_> = p0.sections.iter().filter(|s| s.tag == VideoTag::Lighting).collect();
        assert_eq!(lts.len(), 2, "lighting event only where the slice changes it");
        assert_eq!((lts[0].frame_start, lts[0].frame_end), (0, 48), "cool open window");
        assert_eq!((lts[1].frame_start, lts[1].frame_end), (120, shot_f), "warm close window");
        let mts: Vec<_> = p0.sections.iter().filter(|s| s.tag == VideoTag::Motion).collect();
        assert_eq!(mts.len(), 2, "motion event only where the slice moves");
        // FINITE moves (speed-bounded, front-loaded): the dolly occupies ~2s
        // (48f) of its [48,120] slice then holds; the track ~1.5s (36f) of
        // its [120,192] slice. Neither slabs the whole slice.
        assert_eq!((mts[0].frame_start, mts[0].frame_end), (48, 96), "develop dolly: 48f move, then hold");
        assert_eq!((mts[1].frame_start, mts[1].frame_end), (120, 156), "close track: 36f move, then hold");
        // No Effect event in the deterministic seed (effects_base empty) —
        // the genre ambience bed moved to the sustained base in global_style.
        assert!(
            p0.sections.iter().all(|s| s.tag != VideoTag::Effect),
            "flat ambience is not re-emitted as a whole-shot Effect slab"
        );
        // Transition = windowed cut EVENTS at the shot's BOUNDARIES, sized
        // by type. Shot 0 enters on a hard_cut (no windowed cue) and exits on
        // a crossfade, so pipe 0 carries ONE transition section — the OUT
        // envelope at the tail (shot_f-24 .. shot_f), not a head cut-in.
        let trans: Vec<_> = p0.sections.iter().filter(|s| s.tag == VideoTag::Transition).collect();
        assert_eq!(trans.len(), 1, "shot 0: hard_cut in emits no section; only the crossfade out-window");
        assert_eq!(
            (trans[0].frame_start, trans[0].frame_end),
            (shot_f - 24, shot_f),
            "out-window = the crossfade envelope at the shot's tail"
        );
        assert!(
            trans[0].frame_start > 0,
            "the out-window sits at the tail, not the head"
        );
        // A morphing shot (crossfade in) gets BOTH a head in-window and a
        // tail out-window.
        let trans1: Vec<_> = plan.pipes[1]
            .sections
            .iter()
            .filter(|s| s.tag == VideoTag::Transition)
            .collect();
        assert_eq!(trans1.len(), 2, "crossfade shot carries an in-window AND an out-window");
        assert_eq!(
            (trans1[0].frame_start, trans1[0].frame_end),
            (0, 24),
            "in-window = crossfade envelope at the head"
        );
        assert_eq!(
            (trans1[1].frame_start, trans1[1].frame_end),
            (shot_f - 24, shot_f),
            "out-window = crossfade envelope at the tail"
        );

        // Pin the EXACT concern-text format (what the TS mirror must match).
        fn prompt_of(
            p: &crate::generation::video_flow::plan::PlanPipe,
            tag: VideoTag,
        ) -> &str {
            p.sections
                .iter()
                .find(|s| s.tag == tag)
                .map(|s| s.prompt.as_str())
                .unwrap_or("<missing>")
        }
        // Camera events ride all 3 sub-slices (close-up→medium→wide,
        // 85→50→35mm) in the exact derive.rs format — the shot-internal
        // camera journey, not a full-width slab.
        fn texts_of(
            p: &crate::generation::video_flow::plan::PlanPipe,
            tag: VideoTag,
        ) -> Vec<String> {
            p.sections
                .iter()
                .filter(|s| s.tag == tag)
                .map(|s| s.prompt.clone())
                .collect()
        }
        assert_eq!(
            texts_of(&plan.pipes[0], VideoTag::Camera),
            vec![
                "close-up shot, fill_frame framing, shallow depth of field · 85mm lens",
                "medium shot, rule_of_thirds framing, medium depth of field · 50mm lens",
                "wide shot, deep depth of field · 35mm lens",
            ],
            "camera events ride the 3 sub-slices (size + focal per window)"
        );
        // Lighting DELTA: only the two slices that change the light — the
        // tree-driven branch temp arc (cool open → warm close). Never a slab.
        // Phase 1b: the entry path (scenes=1, mood 50) rides the tree's
        // single "resolving" branch; its chained temp arc opens at the
        // midday base (5600K) and closes 300K warmer (5900K). This is the
        // tree-v1 re-pin (pre-1b the legacy g%6 cycling table pinned
        // 4500→5500K here; the `tree:None` legacy pin keeps that value).
        assert_eq!(
            texts_of(&plan.pipes[0], VideoTag::Lighting),
            vec![
                "soft key light, medium contrast, 5600K, cool",
                "soft key light, medium contrast, 5900K, warm",
            ],
            "lighting fires only where the slice changes it (cool→warm)"
        );
        // Motion DELTA: only where the camera moves (dolly develop, track close).
        assert_eq!(
            texts_of(&plan.pipes[0], VideoTag::Motion),
            vec!["dolly, slow speed", "track"],
            "motion fires only where the slice moves"
        );
        // S3 transition prompts: a windowed cue carries its TYPE (in-window)
        // or TYPE + " (out)" marker (out-window). Shot 0's in is a hard cut
        // (no section) — its only transition section is the crossfade out.
        assert_eq!(
            prompt_of(&plan.pipes[0], VideoTag::Transition),
            "crossfade (out)",
            "shot 0 exits via a crossfade out-window (hard-cut in emits no section)"
        );
        assert_eq!(
            prompt_of(&plan.pipes[1], VideoTag::Transition),
            "crossfade",
            "shot 1 enters via a crossfade in-window"
        );
        // SUSTAINED BASE now lives in global_style (the whole-scene look): the
        // flat grade + the genre ambience bed that no longer appear as slabs.
        assert!(
            plan.pipes[0].global_style.contains("kodak_250d"),
            "sustained grade base lives in global_style, not a whole-shot slab: {}",
            plan.pipes[0].global_style
        );
        assert!(
            plan.pipes[0].global_style.contains("ambience:"),
            "the genre ambience bed lives in global_style: {}",
            plan.pipes[0].global_style
        );

        // FULL-NOVEL CONTEXT (user fix): every pipe's global style carries
        // the film logline (the WHOLE idea), world + palette + style +
        // scene tod/weather — six shots no longer generate six identical
        // quarter-idea scenes.
        let idea = "a girl follows the river road north at dusk";
        for p in &plan.pipes {
            assert!(
                p.global_style.contains(idea),
                "pipe global style carries the full logline, got: '{}'",
                p.global_style
            );
            assert!(p.global_style.contains("midday clear"));
        }

        // The S1 arc of a shot carries its S1 prose (concrete sentence,
        // >= 8 words), not a bare fragment.
        let arc0 = prompt_of(&plan.pipes[0], VideoTag::Scene);
        assert!(
            arc0.contains("follows") || arc0.len() >= 20,
            "arc 0 carries the shot's S1 prose, got: '{arc0}'"
        );

        // The pipe carries the scene base as global style, not a bare
        // "text".
        assert!(
            plan.pipes[0].global_style.contains("midday clear"),
            "global style carries the G0 look axes: {}",
            plan.pipes[0].global_style
        );

        // LENGTH FIDELITY: each concrete pipe is lengthed to its own shot's
        // S3 clip (entry() default clips to 8s → 192f), NOT the 240-frame
        // default floor. Sum of pipe lengths == cumulative S2 division
        // total_s @ 24fps == the S5 verify cumulative frames.
        let cum_s: u32 = run.specs.iter().map(|s| s.clip_s).sum();
        for p in &plan.pipes {
            assert_eq!(
                p.length_frames,
                8 * 24,
                "each shot pipe is lengthed to its 8s clip (192f), not the 240f floor: {}",
                p.length_frames
            );
        }
        let pipe_sum: u32 = plan.pipes.iter().map(|p| p.length_frames).sum();
        assert_eq!(
            pipe_sum,
            cum_s.saturating_mul(24),
            "sum of pipe lengths == cumulative S3 shot clips @ 24fps (no dead tail)"
        );
        assert_eq!(
            run.verify.total_frames,
            cum_s.saturating_mul(24),
            "S5 cumulative generated frames == cumulative shot clips"
        );
        // V6 must pass (the run is fully self-consistent on this path).
        assert!(
            run.verify.verified,
            "V6 length comparison must pass: {:?}",
            run.verify.issues
        );
        // And materialize honors the explicit length: the composer pipe is
        // 192f (content length), not the 240f default floor.
        let pipes = crate::generation::video_flow::materialize_pipes(
            &plan,
            &crate::generation::video_flow::config::FlowConfig::default_flow().materialize,
        )
        .expect("concrete plan materializes");
        assert_eq!(
            pipes[0].length_frames,
            192,
            "materialized pipe is lengthed to its cumulative content (192f), not the 240f default floor"
        );
    }

    /// V7: a sub-slice must ADD information (a non-empty concern delta vs
    // the previous folded state). A clean seed run has no V7 issues;
    // holding a slice (state → None) makes it a no-op and fires exactly
    // one named V7 for that shot + slice. No metric, no cross-shot compare —
    // the signal is the value itself.
    #[test]
    fn v7_flags_no_op_sub_slices() {
        // Clean seed run: every sub-slice carries a concern delta → no V7.
        let mut run = entry("a girl follows the river road north at dusk").build_run();
        let v0 = verify(&run);
        assert!(
            v0.issues.iter().all(|i| !i.starts_with("V7")),
            "clean seed run has no V7 no-op-slice issues, got: {:?}",
            v0.issues
        );

        // Hold the develop slice of shot 0 (state → None): it now changes
        // nothing, so it is a no-op and must be named.
        run.specs[0].sub_timeline[1].state = None;
        let v1 = verify(&run);
        let v7: Vec<_> = v1.issues.iter().filter(|i| i.starts_with("V7")).collect();
        assert_eq!(
            v7.len(),
            1,
            "exactly one no-op slice is flagged: {:?}",
            v1.issues
        );
        assert!(
            v7[0].contains(&run.specs[0].shot_id) && v7[0].contains("slice 2"),
            "V7 names the shot + slice: '{}'",
            v7[0]
        );
    }

    /// Node A contract: the idea gets ONE home in the novel (the film
    /// logline). Shot prose is saturated sensory writing (camera concern +
    /// sensory axis + G0 look axes), not a copy of the idea string.
    #[test]
    fn idea_has_one_home_shot_prose_is_saturated() {
        let idea = "there Googl bubble with comix eyes and eyebrows is fitting with M$ bubble and then they struck when Anthropic bubble comes";
        let run = entry(idea).build_run();
        // One home: the film logline.
        assert_eq!(run.novel.film.logline, run.seed.idea);
        // No echo: the full idea must not be pasted into the shot prose.
        let all_prose: String = run
            .novel
            .scenes
            .iter()
            .flat_map(|sc| sc.shots.iter().map(|s| s.prose.clone()))
            .collect::<Vec<_>>()
            .join(" | ");
        assert!(!all_prose.contains(idea), "shot prose must NOT echo the whole idea:\n{all_prose}");
        // Dedup: S1 shot prose carries ONLY new content (subject + stage +
        // one sensory detail) — no S3 camera-size mechanics (those live in
        // the S3 spec + S4 prompt, not the novel), so nothing duplicates.
        let s0 = &run.novel.scenes[0].shots;
        let size_words = ["wide", "medium", "close-up", "over-the-shoulder"];
        for p in s0.iter().map(|s| s.prose.as_str()) {
            for w in &size_words {
                assert!(!p.contains(w), "S1 shot prose must not carry S3 shot size '{w}': {p}");
            }
        }
        assert_ne!(&s0[0].prose, &s0[1].prose, "sibling shot prose differs (subject + verb + axis)");
        // Shot prose is a concrete, composed sentence (subject + cycling verb
        // + specific place + sensory detail), NOT a raw word-slice of the
        // author's text and NOT a truncated 3-word stub.
        for p in s0.iter().map(|s| s.prose.as_str()) {
            assert!(
                p.split_whitespace().count() >= 8,
                "shot prose is a concrete sentence (≥8 words), got: '{p}'"
            );
            assert!(
                p.ends_with('.'),
                "shot prose is a complete sentence, got: '{p}'"
            );
        }
        // Beats: concrete micro-cues in the harness form, not filler.
        let beats = &s0[0].beats;
        assert_eq!(beats.len(), 3);
        assert!(!beats.iter().any(|b| b.contains("opens:") || b.contains("develops:")));
    }

    /// G0 look axes saturate the derived film fields (world + palette),
    /// so a night/dawn run reads differently from a midday one.
    #[test]
    fn look_axes_saturate_world_and_palette() {
        let mut e = entry("a fox darts through the pines");
        e.time_of_day = "night".into();
        e.weather = "light rain".into();
        let run = e.build_run();
        // World is a genre-based space; weather is its own field + palette.
        assert_eq!(run.novel.film.weather, "light rain", "weather carried as its own axis");
        assert!(run.novel.film.palette.contains("cool blue night"), "palette follows time-of-day: {}", run.novel.film.palette);
        assert!(run.novel.film.palette.contains("light rain"), "palette folds in the weather: {}", run.novel.film.palette);
        assert_eq!(run.novel.film.time_of_day, "night");
        // S2 scene specs inherit the axes from the novel film.
        assert_eq!(run.scenes[0].time_of_day, "night");
        assert_eq!(run.scenes[0].weather, "light rain");
    }

    /// Empty title falls back to the first idea clause (capped at 5 words),
    /// not "Untitled".
    #[test]
    fn empty_title_falls_back_to_idea_clause() {
        let run = entry("a girl follows the river road north at dusk").build_run();
        assert_ne!(run.novel.film.title, "Untitled");
        assert_eq!(run.novel.film.title, "a girl follows the river", "title is the first 5 words");
    }

    /// An empty idea + populated input_text must never degrade the seed:
    /// idea persists from the verbatim text (the Q2 saving gap).
    #[test]
    fn empty_idea_falls_back_to_input_text() {
        let e = EngineEntry {
            idea: String::new(),
            input_text: Some("the lighthouse at night".into()),
            ..entry("unused")
        };
        let seed = e.to_seed();
        assert_eq!(seed.idea, "the lighthouse at night");
    }

    /// Explicit G0 title wins over the idea-derived one.
    #[test]
    fn explicit_title_wins() {
        let mut e = entry("an idea about a dog");
        e.title = "The Lighthouse".into();
        let run = e.build_run();
        assert_eq!(run.novel.film.title, "The Lighthouse");
    }

    /// The engine run must stay verified end-to-end on the new builder.
    #[test]
    fn run_stays_verified_after_expansion() {
        let run = entry("a girl follows the river road north at dusk").build_run();
        assert!(run.verify.verified, "S5 verify must pass: {:?}", run.verify.issues);
    }

    /// Node A golden (harness-style, the "LLM output is testable" pin).
    ///
    /// A strict-JSON VisualNovel — the exact contract `expand_node_a`
    /// constrains the model to (same schema as
    /// `harness/fixtures/node_a.request.json`) — is parsed with the
    /// production parse path, repaired to the seed counts, and run through
    /// the SAME deterministic S2–S5 bridge (`build_with_novel`) every LLM
    /// run uses. Pinned:
    ///  - expansion provenance (`Llm` + model note),
    ///  - G0 look axes override the LLM's own tod/weather claims,
    ///  - S5 verify (V1–V7) passes end-to-end,
    ///  - the LLM's ACTUAL content survives into the concrete plan
    ///    (logline/world into every pipe's global_style, each shot's beats
    ///    into its scene sections) — no template boilerplate,
    ///  - the plan materializes into one concern-split pipe per shot.
    ///
    /// LLM text drift is a Node A contract problem (schema + repair_counts);
    /// anything failing here means the bridge between the LLM shape and the
    /// concrete plan drifted.
    #[test]
    fn node_a_novel_runs_through_the_deterministic_bridge() {
        use crate::generation::video_flow::config::FlowConfig;
        use crate::generation::video_flow::engine::llm::{parse_novel, repair_counts};
        use crate::generation::video_flow::engine::types::VisualNovel;
        use crate::generation::video_flow::{materialize_pipes, validate_plan};

        // 1 scene x 3 shots — matches entry()'s seed scale, so repair_counts
        // is a no-op and the bridge runs on the counts as produced.
        let e = entry("a girl follows the river road north at dusk");
        let seed = e.to_seed();
        let novel_json = serde_json::json!({
            "film": {
                "title": "Imperium",
                "logline": "A crew enters the battleship and chases the shadow figure",
                "style": "film noir",
                "world": "imperium battleship interior",
                "palette": "steel blue, amber instrument glow",
                "time_of_day": "night",
                "weather": "storm"
            },
            "scenes": [
                { "title": "The Bridge",
                  "prose": "doors open onto the command deck, holo-charts drifting",
                  "shots": [
                    { "prose": "the deck opens, a figure stands in the center",
                      "beats": ["wide: the deck opens, instrument glow - a distant moan"] },
                    { "prose": "the figure moves toward the far exit",
                      "beats": ["medium: the figure steps right, panels flicker - low engine hum"] },
                    { "prose": "the figure climbs toward the starship",
                      "beats": ["close-up: the ladder rung glints, breath fog - hydraulic clank"] }
                  ] }
            ]
        });
        // Production parse path (bare-object branch) + production repair.
        let mut novel: VisualNovel = parse_novel(&novel_json)
            .expect("strict VisualNovel JSON must parse");
        repair_counts(&mut novel, &e).expect("counts already match the seed scale");

        let run = EngineRun::build_with_novel(
            seed,
            novel,
            &e.time_of_day,
            &e.weather,
            ExpansionSource::Llm,
            Some("agnes-2.5-flash".into()),
        );

        // 1) Provenance: this run IS the LLM path, named.
        assert_eq!(run.expansion, ExpansionSource::Llm);
        assert_eq!(run.expansion_note.as_deref(), Some("agnes-2.5-flash"));

        // 2) G0 look axes override the LLM's own tod/weather claims.
        assert_eq!(run.novel.film.time_of_day, "midday", "G0 tod wins over the LLM's 'night'");
        assert_eq!(run.novel.film.weather, "clear", "G0 weather wins over the LLM's 'storm'");

        // 3) S5 verify (V1-V7) passes end-to-end on the LLM-built novel.
        assert!(
            run.verify.verified,
            "S5 verify must pass on the Node A novel: {:?}",
            run.verify.issues
        );

        // 4) Content survival: the LLM's ACTUAL text lands in the plan.
        let plan = run.plan_from_engine(1);
        let total_shots: usize =
            run.novel.scenes.iter().map(|s| s.shots.len()).sum::<usize>();
        assert_eq!(plan.pipes.len(), total_shots, "one pipe per LLM-written shot");
        for (i, pipe) in plan.pipes.iter().enumerate() {
            let shot = &run.novel.scenes[0].shots[i];
            // film-level context on every pipe (no shot loses the whole idea).
            for needle in [
                "A crew enters the battleship",
                "imperium battleship interior",
                "steel blue, amber instrument glow",
                "film noir",
            ] {
                assert!(
                    pipe.global_style.contains(needle),
                    "pipe {i} global_style must carry '{needle}'"
                );
            }
            // The shot's S1 beat reaches its scene sections (delta-driven).
            let beat = &shot.beats[0];
            let scene_texts: String = pipe
                .sections
                .iter()
                .filter(|s| s.tag.keyword() == "scene")
                .map(|s| s.prompt.clone())
                .collect::<Vec<_>>()
                .join(" ");
            let token = beat.split_once(':').map(|(_, rest)| rest.trim()).unwrap_or(beat);
            let probe = token.split(' ').take(2).collect::<Vec<_>>().join(" ");
            assert!(
                scene_texts.to_lowercase().contains(&probe.to_lowercase()),
                "shot {i} scene sections must carry its beat '{beat}', got: {scene_texts}"
            );
        }

        // 5) The LLM-built plan still passes the flow's structural gates.
        let cfg = FlowConfig::default_flow();
        validate_plan(&plan, &cfg.structure).expect("Node A plan passes validate_plan");
        let pipes = materialize_pipes(&plan, &cfg.materialize).expect("Node A plan materializes");
        assert_eq!(pipes.len(), total_shots, "one composer pipe per LLM shot");
    }

    /// Content-driven activation proof: on the LLM path (`content_driven=true`)
    /// a shot whose beats carry closed-vocab shot-size prefixes gets a
    /// beat-driven sub-timeline (the beat's size sets the slice's camera
    /// state; the table's pacing weight sets the slice's window width).
    /// On the template path (`content_driven=false`) the same beats are
    /// IGNORED — the pinned cycling journey is used instead. This is the
    /// "content drives activation" guarantee.
    #[test]
    fn content_driven_sub_slices_activate_only_on_the_llm_path() {
        let e = entry("a girl follows the river road north at dusk");
        let seed = e.to_seed();

        // A rich LLM novel: 1 scene, 3 shots, each with one beat that names
        // a closed-vocab shot size (wide → medium → close-up).
        let beat_wide = "wide: the hall opens, senators seated - a low ambient hum";
        let beat_med = "medium: a senator rises, robes catch the light";
        let beat_cu = "close-up: the speaker's hand grips the podium";

        let novel = crate::generation::video_flow::engine::types::VisualNovel {
            film: crate::generation::video_flow::engine::types::FilmLook {
                title: "Council".into(),
                logline: "a chamber of senators at a crossroads".into(),
                style: "cinematic natural light".into(),
                world: "the Grand Council chamber".into(),
                palette: "amber wood, cool stone".into(),
                time_of_day: "midday".into(),
                weather: "clear".into(),
            },
            scenes: vec![
                crate::generation::video_flow::engine::types::NovelScene {
                    title: "The Chamber".into(),
                    prose: "a wide chamber of senators, the air still".into(),
                    shots: vec![
                        crate::generation::video_flow::engine::types::NovelShot {
                            prose: "the hall opens".into(),
                            beats: vec![beat_wide.to_string()],
                        },
                        crate::generation::video_flow::engine::types::NovelShot {
                            prose: "a senator rises".into(),
                            beats: vec![beat_med.to_string()],
                        },
                        crate::generation::video_flow::engine::types::NovelShot {
                            prose: "the speaker grips the podium".into(),
                            beats: vec![beat_cu.to_string()],
                        },
                    ],
                }
            ],
        };

        // The LLM path: content_driven=true → beats drive the sub-slices.
        let llm_run = EngineRun::build_with_novel(
            seed.clone(),
            novel.clone(),
            &e.time_of_day,
            &e.weather,
            ExpansionSource::Llm,
            None,
        );

        // Each shot's S3 spec should have sub-slices whose camera state
        // matches the beat's parsed shot size, and the V7 invariant holds
        // (every slice adds a real concern delta against the shot base).
        for (i, spec) in llm_run.specs.iter().enumerate() {
            let beat = [beat_wide, beat_med, beat_cu][i];
            let parsed_size = beat.split_once(':').unwrap().0.trim();
            assert!(
                !spec.sub_timeline.is_empty(),
                "shot {i} must have at least one sub-slice"
            );
            let sl = &spec.sub_timeline[0];
            let cam = sl.state.as_ref().and_then(|s| s.camera.as_ref());
            assert_eq!(
                cam.map(|c| c.size.as_str()),
                Some(parsed_size),
                "shot {i} sub-slice camera size must match the beat's parsed prefix '{parsed_size}', got {:?}",
                cam.map(|c| c.size.as_str())
            );
            // absorbed_beats carries the beat text (content-driven path).
            assert!(
                sl.absorbed_beats.iter().any(|b| b.contains(parsed_size)),
                "shot {i} sub-slice must carry its beat text in absorbed_beats"
            );
        }

        // The template path: content_driven=false → cycling journey, NOT
        // the beat-driven one. Same beats, different structure.
        let tmpl_run = EngineRun::build_with_novel(
            seed,
            novel,
            &e.time_of_day,
            &e.weather,
            ExpansionSource::Template,
            None,
        );
        // The cycling journey does NOT use absorbed_beats (empty on all slices).
        for spec in &tmpl_run.specs {
            for sl in &spec.sub_timeline {
                assert!(
                    sl.absorbed_beats.is_empty(),
                    "template path must NOT carry absorbed_beats (cycling journey)"
                );
            }
        }
        // And the cycling journey's camera states are the per-shot-index
        // cycling values, NOT the beat-driven parsed sizes.
        // shot g=0 cycling = close-up→medium→wide (the g=0 template).
        let tmpl_sl0 = &tmpl_run.specs[0].sub_timeline[0];
        let tmpl_cam0 = tmpl_sl0.state.as_ref().and_then(|s| s.camera.as_ref());
        assert_eq!(
            tmpl_cam0.map(|c| c.size.as_str()),
            Some("close-up"),
            "template path shot 0 slice 0 uses the cycling g=0 camera path (close-up), NOT the beat's 'wide'"
        );
    }

    /// P3 (2026-11-10): the LLM's ANGLE / MOTION language — the exact
    /// prefixes from the "forest show" run ("tracking shot", "low angle",
    /// "pull-back") — must be V7-clean: every slice carries a real
    /// concern delta, no slice state is empty, the beat texts all survive
    /// in absorbed_beats, and the leading slice carries a motion delta
    /// (the old "slice 1 is a no-op" shape cannot recur).
    #[test]
    fn angle_and_motion_beat_language_is_v7_clean() {
        use crate::generation::video_flow::engine::types::VisualNovel;

        let e = entry("a girl follows the river road north at dusk");
        let seed = e.to_seed();
        let beats = vec![
            "tracking shot: feet hit gravel — rhythmic crunch".to_string(),
            "low angle: a dog looks up — ears twitch at faint engine hum".to_string(),
            "pull-back: the path curves into trees — shadows lengthen".to_string(),
        ];
        let novel = VisualNovel {
            film: crate::generation::video_flow::engine::types::FilmLook {
                title: "Forest Chase".into(),
                logline: "a dog flees through the forest".into(),
                style: "cinematic natural light".into(),
                world: "the forest".into(),
                palette: "green, amber".into(),
                time_of_day: "midday".into(),
                weather: "clear".into(),
            },
            scenes: vec![
                crate::generation::video_flow::engine::types::NovelScene {
                    title: "The Chase".into(),
                    prose: "the chase through the pines".into(),
                    shots: vec![
                        crate::generation::video_flow::engine::types::NovelShot {
                            prose: "feet hit gravel".into(),
                            beats: beats.clone(),
                        }
                    ],
                }
            ],
        };
        let run = EngineRun::build_with_novel(
            seed,
            novel,
            &e.time_of_day,
            &e.weather,
            ExpansionSource::Llm,
            None,
        );
        let spec = &run.specs[0];
        let slices = &spec.sub_timeline;
        assert!(
            slices.len() >= 3,
            "three beats must yield >= 3 slices, got {}",
            slices.len()
        );
        // Slice 0 (the old "slice 1") must carry a NON-EMPTY state: the
        // tracking-shot beat lands a closed-vocab motion delta.
        let s0 = slices[0]
            .state
            .as_ref()
            .expect("slice 0 state present");
        assert!(
            s0.motion.as_ref().is_some_and(|m| !m.r#move.is_empty()),
            "the tracking-shot beat must land a closed-vocab motion delta on slice 0"
        );
        // V7 is clean: no no-op slice anywhere in this shot.
        let v7: Vec<_> = run
            .verify
            .issues
            .iter()
            .filter(|i| i.starts_with("V7"))
            .collect();
        assert!(
            v7.is_empty(),
            "angle/motion beat language must be V7-clean, got {v7:?}"
        );
        // Beat texts all survive in absorbed_beats.
        let all: Vec<&String> = slices.iter().flat_map(|s| s.absorbed_beats.iter()).collect();
        for b in &beats {
            assert!(
                all.iter().any(|a| *a == b),
                "beat '{b}' must be carried by some slice"
            );
        }
    }

    /// P2 guarantee layer: even a beat prefix that resolves to NEITHER a
    /// closed-vocab size NOR a known alias / motion word gets a DISTINCT
    /// synthesized concern delta (idx-rotated, tag-closed) — a sub-slice
    /// can never be a V7 no-op because of what the LLM chose to say.
    #[test]
    fn unknown_beat_prefix_gets_a_distinct_synthesized_state() {
        let vocab = crate::generation::video_flow::engine::tag_vocabulary::TagVocabulary::new();
        let a = beat_profiles::synth_unknown_beat_state("orbiting drone", 0, &vocab);
        let b = beat_profiles::synth_unknown_beat_state("orbiting drone", 1, &vocab);
        let sig = |c: &crate::generation::video_flow::engine::types::CameraConcern,
                   l: &crate::generation::video_flow::engine::types::LensConcern| {
            (c.size.clone(), l.focal_mm)
        };
        let sa = sig(a.camera.as_ref().unwrap(), a.lens.as_ref().unwrap());
        let sb = sig(b.camera.as_ref().unwrap(), b.lens.as_ref().unwrap());
        assert_ne!(
            sa, sb,
            "two unknown beats in one shot must differ (idx rotation)"
        );
        // Tag-closed: folded over a default base, V2 must be clean.
        let base = crate::generation::video_flow::engine::types::Concerns::default();
        let folded = axes::fold(&base, &[Some(a.clone()), Some(b.clone())]);
        assert!(
            vocab.validate_concerns(&folded[1]).is_empty(),
            "synth state must stay tag-closed, got {:?}",
            vocab.validate_concerns(&folded[1])
        );
    }

    /// P1 resolvers: closed-vocab sizes pass through, angle language maps
    /// to size + a distinct camera angle, motion words map to a
    /// closed-vocab motion delta, unknown prefixes fall to `None` from
    /// BOTH resolvers (the P2 synth then catches them).
    #[test]
    fn beat_prefix_resolvers_are_total_over_llm_language() {
        let vocab = crate::generation::video_flow::engine::tag_vocabulary::TagVocabulary::new();
        assert_eq!(
            beat_profiles::resolve_beat_size("close-up", &vocab),
            Some("close-up")
        );
        assert_eq!(
            beat_profiles::resolve_beat_size("wide", &vocab),
            Some("wide")
        );
        assert_eq!(
            beat_profiles::resolve_beat_size("low angle", &vocab),
            Some("wide")
        );
        assert_eq!(beat_profiles::alias_angle("low angle"), Some("low"));
        assert_eq!(
            beat_profiles::resolve_beat_size("worms-eye view", &vocab),
            Some("close-up")
        );
        assert_eq!(beat_profiles::alias_angle("worms-eye view"), Some("low"));
        // Motion words → closed-vocab motion delta (zoom, move, speed).
        let m = beat_profiles::motion_prefix_delta("tracking shot").expect("tracking shot");
        assert_eq!((m.0.as_str(), m.1.as_str(), m.2.as_str()), ("static", "track", "normal"));
        let z = beat_profiles::motion_prefix_delta("crash zoom").expect("crash zoom");
        assert_eq!((z.0.as_str(), z.1.as_str(), z.2.as_str()), ("crash", "static", "fast"));
        // Unknown → None from both (the P2 synth catches it).
        assert_eq!(
            beat_profiles::resolve_beat_size("the camera shakes", &vocab),
            None
        );
        assert_eq!(beat_profiles::motion_prefix_delta("the camera shakes"), None);
    }

    /// The Order 66 council opening (the beat_profiles grammar source): a
    /// content-driven LLM novel whose beats are wide→close-up→medium gets
    /// pacing-weighted slice windows (wide = 1.5×, close-up = 0.8×, medium
    /// = 1.0×), and the verify V1–V7 invariants pass end-to-end.
    #[test]
    fn order_66_council_content_driven_sub_slices() {
        use crate::generation::video_flow::engine::types::VisualNovel;

        let e = entry("a girl follows the river road north at dusk");
        // clip_s = 10s for the order_66 shot (matches the golden fixture).
        let e2 = EngineEntry {
            scale: crate::generation::video_flow::engine::types::SeedScale {
                scenes: 1,
                shots_per_scene: 1,
                clip_s: [10, 10],
            },
            ..e
        };
        let seed2 = e2.to_seed();

        // The Order 66 LLM novel: one shot, three beats (wide→close-up→medium).
        let beats = vec![
            "wide: the hall is quiet, senators seated - a low ambient hum".to_string(),
            "close-up: Qui-Gon's hand goes to the lightsaber - the hum drops out".to_string(),
            "medium: the clones turn as one, blades raised - first blaster crack".to_string(),
        ];
        let novel = VisualNovel {
            film: crate::generation::video_flow::engine::types::FilmLook {
                title: "Order 66".into(),
                logline: "The Council falls as the Order begins".into(),
                style: "dark, tense".into(),
                world: "the Grand Council chamber, Coruscant".into(),
                palette: "steel blue, amber instrument glow".into(),
                time_of_day: "midday".into(),
                weather: "clear".into(),
            },
            scenes: vec![
                crate::generation::video_flow::engine::types::NovelScene {
                    title: "The Chamber".into(),
                    prose: "a wide chamber of senators, the air still".into(),
                    shots: vec![
                        crate::generation::video_flow::engine::types::NovelShot {
                            prose: "the chamber falls silent".into(),
                            beats: beats.clone(),
                        }
                    ],
                }
            ],
        };

        let run = EngineRun::build_with_novel(
            seed2,
            novel,
            &e2.time_of_day,
            &e2.weather,
            ExpansionSource::Llm,
            None,
        );

        // V1–V7 verify must pass: every slice adds a concern delta.
        assert!(
            run.verify.verified,
            "order_66 content-driven run must pass S5 verify: {:?}",
            run.verify.issues
        );

        let spec = &run.specs[0];
        // Pacing weights: wide=1.5, close-up=0.8, medium=1.0 → total=3.3.
        // clip=10s → slice widths: 10×1.5/3.3=4.5s, 10×0.8/3.3=2.4s, 10×1.0/3.3=3.0s.
        // Rounded: [0,4],[4,7],[7,10].
        let slices = &spec.sub_timeline;
        assert_eq!(slices.len(), 3, "three content-driven slices for three beats");
        let width = |i: usize| slices[i].to_s - slices[i].from_s;
        // Pacing weights: wide=1.5, close-up=0.8, medium=1.0 → the WIDE
        // (establishing) slice gets the widest window, the close-up the
        // narrowest. This is the pacing curve, in seconds.
        assert!(
            width(0) >= width(1) && width(0) >= width(2),
            "the wide/establishing slice (weight 1.5) should be the widest, got [{},{},{}]",
            width(0),
            width(1),
            width(2)
        );
        assert!(
            width(1) <= width(2),
            "close-up (weight 0.8) slice should be no wider than medium (weight 1.0), got {}s vs {}s",
            width(1),
            width(2)
        );
        // Camera states match the beat's parsed prefix.
        let cam0 = slices[0].state.as_ref().and_then(|s| s.camera.as_ref());
        let cam1 = slices[1].state.as_ref().and_then(|s| s.camera.as_ref());
        let cam2 = slices[2].state.as_ref().and_then(|s| s.camera.as_ref());
        assert_eq!(cam0.map(|c| c.size.as_str()), Some("wide"), "slice 0 = wide");
        assert_eq!(cam1.map(|c| c.size.as_str()), Some("close-up"), "slice 1 = close-up");
        assert_eq!(cam2.map(|c| c.size.as_str()), Some("medium"), "slice 2 = medium");
        // absorbed_beats carries all three beat texts.
        let all_beats: Vec<&str> = slices.iter().flat_map(|s| s.absorbed_beats.iter().map(|b| b.as_str())).collect();
        assert_eq!(all_beats.len(), 3, "all three beats must be carried in absorbed_beats");
        for b in &beats {
            assert!(
                all_beats.iter().any(|a| a == b),
                "beat '{b}' must be present in absorbed_beats"
            );
        }
    }

    /// Cross-pipe continuity + the over-detail squish guard: every pipe's
    /// global_style carries a bounded `continuity:` line that names the
    /// through-line (the film's principal subject), the per-scene locus, and
    /// whether it continues the previous shot; and the per-slice Scene arcs
    /// are LEAN (a long LLM beat is capped so a verbose beat can't squash
    /// the model).
    #[test]
    fn every_pipe_carries_a_continuity_line_and_lean_scene_arcs() {
        use crate::generation::video_flow::engine::types::VisualNovel;
        use crate::generation::video_flow::plan::VideoTag;

        let mut e = entry("a girl follows the river road north at dusk");
        // Match the 1-scene × 2-shot novel below so V3 counts hold.
        e.scale = crate::generation::video_flow::engine::types::SeedScale {
            scenes: 1,
            shots_per_scene: 2,
            clip_s: [8, 10],
        };
        let seed = e.to_seed();
        let beats = vec![
            "close-up: the officer's hand grips the console - the hum drops out".to_string(),
            "medium: a long, long, long, long, long beat with many descriptive words that must be capped before it reaches the model".to_string(),
        ];
        let novel = VisualNovel {
            film: crate::generation::video_flow::engine::types::FilmLook {
                title: "Bridge".into(),
                logline: "the officer commands the deck".into(),
                style: "cinematic natural light".into(),
                world: "the command deck".into(),
                palette: "steel blue".into(),
                time_of_day: "midday".into(),
                weather: "clear".into(),
            },
            scenes: vec![
                crate::generation::video_flow::engine::types::NovelScene {
                    title: "The Deck".into(),
                    prose: "a wide deck, consoles lit".into(),
                    shots: vec![
                        crate::generation::video_flow::engine::types::NovelShot {
                            prose: "the deck is quiet".into(),
                            beats: beats.clone(),
                        },
                        crate::generation::video_flow::engine::types::NovelShot {
                            prose: "the deck stirs".into(),
                            beats: beats.clone(),
                        },
                    ],
                }
            ],
        };

        let run = EngineRun::build_with_novel(
            seed,
            novel,
            &e.time_of_day,
            &e.weather,
            ExpansionSource::Llm,
            None,
        );
        assert!(
            run.verify.verified,
            "continuity-augmented run must still pass S5 verify: {:?}",
            run.verify.issues
        );

        let plan = run.plan_from_engine(1);
        assert_eq!(plan.pipes.len(), 2, "one pipe per shot");

        // 1) Both pipes carry a `continuity:` line naming the same principal
        //    subject ("officer" from the logline).
        for (i, pipe) in plan.pipes.iter().enumerate() {
            assert!(
                pipe.global_style.contains("continuity:"),
                "pipe {i} global_style must carry a continuity line, got: {}",
                pipe.global_style
            );
            assert!(
                pipe.global_style.to_lowercase().contains("officer"),
                "pipe {i} continuity line must name the principal 'officer', got: {}",
                pipe.global_style
            );
        }
        // 2) The two pipes differ in their continuity marker: pipe 0 is the
        //    film-opener; pipe 1 "continues the previous shot".
        assert!(
            plan.pipes[0].global_style.contains("the film opens here"),
            "pipe 0 is the opener: {}",
            plan.pipes[0].global_style
        );
        assert!(
            plan.pipes[1].global_style.contains("continues the previous shot"),
            "pipe 1 continues: {}",
            plan.pipes[1].global_style
        );

        // 3) Lean scene arcs: every Scene section stays short enough that a
        //    verbose beat can't dump a clause and squash the model.
        for (i, pipe) in plan.pipes.iter().enumerate() {
            for s in &pipe.sections {
                if s.tag == VideoTag::Scene {
                    let words = s.prompt.split_whitespace().count();
                    assert!(
                        words <= 24,
                        "pipe {i} scene arc must stay lean (<=24 words), got {words}: '{}' — a too-tight detail dump makes the model squash",
                        s.prompt
                    );
                }
            }
        }
    }

    /// Phase 1b proof: a MULTI-scene entry run (tree attached, the entry
    /// builder's default) is TREE-DRIVEN — the S2 scene color temperature
    /// comes from the branch's chained open-K pair (NOT the legacy hardcoded
    /// 5000K), scene-entry shots carry the branch's energy-driven
    /// transition_in, and the branch's final shot closes with its
    /// transition_out. This is the "the tree actually reshapes S2/S3" pin
    /// (the single-scene `engine_plan_structure_is_pinned_exactly` pin is
    /// insensitive to branch boundaries and stays green on either path).
    #[test]
    fn tree_drives_s2_s3_on_the_entry_path() {
        use crate::generation::video_flow::engine::tree::leaf_to_concerns;

        let idea = "a red fox darts through the tall pine forest at dusk as golden light spills across the meadow";
        let mut e = entry(idea);
        e.scale = crate::generation::video_flow::engine::types::SeedScale {
            scenes: 3,
            shots_per_scene: 2,
            clip_s: [8, 10],
        };
        let run = e.build_run();
        let tree = run.tree.as_ref().expect("entry runs always carry a tree");
        assert_eq!(tree.branches.len(), 3, "3 scenes -> 3 branches");

        // S2: the scene's color temperature is the branch's OPEN K (the
        // chained arc, NOT the legacy hardcoded 5000K default).
        for (i, sc) in run.scenes.iter().enumerate() {
            assert_eq!(
                sc.light.color_temp_k,
                tree.branches[i].temp_open_k,
                "scene {i} light temp must be the tree branch's open K"
            );
            assert_ne!(
                sc.light.color_temp_k, 5000,
                "tree-driven scene {i} temp must differ from the legacy 5000K pin (got {})",
                sc.light.color_temp_k
            );
        }
        // The #3 fix pinned end-to-end: a cut between two scenes never
        // flickers — scene i's open K is exactly scene i-1's branch close K.
        for i in 1..run.scenes.len() {
            assert_eq!(
                run.scenes[i].light.color_temp_k,
                tree.branches[i].temp_open_k,
            );
            assert_eq!(
                tree.branches[i].temp_open_k,
                tree.branches[i - 1].temp_close_k,
                "branch open K must equal the previous branch close K (chained arc)"
            );
        }

        // S3: scene-entry shots carry the branch's energy-driven transition_in
        // (branch 0 = hard_cut opener; interior branches are energy-derived,
        // not a uniform crossfade).
        assert_eq!(run.specs[0].transition_in, "hard_cut", "scene 0 entry = hard_cut opener");
        let spec_at = |si: usize, ki: usize| {
            let g = si * run.novel.scenes[si].shots.len() + ki;
            &run.specs[g]
        };
        assert_eq!(
            spec_at(1, 0).transition_in,
            tree.branches[1].transition_in,
            "scene 1 entry shot carries the branch's transition_in"
        );
        assert_eq!(
            spec_at(2, 0).transition_in,
            tree.branches[2].transition_in,
            "scene 2 entry shot carries the branch's transition_in"
        );
        // The #4 fix: the three scene-entry transitions are NOT a uniform
        // "all crossfade" — the energy curve picks distinct intents.
        assert_eq!(tree.branches[2].transition_in, "hard_cut", "energy drop turn->resolving picks hard_cut");

        // The branch's LAST shot closes with its transition_out.
        assert_eq!(
            spec_at(0, 1).transition_out,
            tree.branches[0].transition_out,
            "branch 0 final shot closes with its transition_out"
        );

        // The leaf-resolved base camera (tree, not the g%N cycling table):
        // the branch-0 shots ride the establishing_wide leaf's closed-vocab
        // resolution (wide / deep / rule_of_thirds), the mood band still
        // stamps the base motion on top of the leaf's motion intent.
        let leaf0 = &tree.branches[0].leaves[0];
        let (cam, _lens, _mot) = leaf_to_concerns(leaf0, 35);
        assert_eq!(
            run.specs[0].concerns.camera.size, cam.size,
            "shot 0 base camera size must be the leaf's establishing_wide resolution"
        );
        assert_eq!(
            run.specs[0].concerns.camera.framing, cam.framing,
            "shot 0 base framing must be the leaf's resolution"
        );
        // Run stays S5-verified end-to-end on the tree-driven path.
        assert!(
            run.verify.verified,
            "tree-driven 3-scene run must stay verified: {:?}",
            run.verify.issues
        );
    }

    /// Phase 1b legacy pin: a run WITHOUT a tree (old docs; the plain
    /// `build_with_novel` bridge, `tree = None`) keeps the byte-stable
    /// pre-tree S2/S3 structure — the hardcoded 5000K scene temp, the
    /// per-shot `g % N` cycling camera table, and the uniform band
    /// transitions (no branch-boundary overrides). This is the
    /// `tree:None` fallback the tree docs' serde default relies on.
    #[test]
    fn legacy_no_tree_structure_is_pinned_exactly() {
        let e = entry("a girl follows the river road north at dusk");
        let seed = e.to_seed();
        // The module-private template novel (seed_tests may reach `build_novel`
        // through `super::*`): the legacy S1 shape at the entry's scale.
        let novel = build_novel(&seed, &e.time_of_day, &e.weather);
        let run = EngineRun::build_with_novel(
            seed,
            novel,
            &e.time_of_day,
            &e.weather,
            ExpansionSource::Template,
            None,
        );
        assert!(run.tree.is_none(), "legacy bridge leaves tree:None");
        // Legacy S2: the hardcoded 5000K scene temp (the pre-tree pin).
        assert_eq!(
            run.scenes[0].light.color_temp_k, 5000,
            "tree:None keeps the 5000K legacy scene temp"
        );
        // Legacy S3: shot 0 enters on the pre-mood hard_cut and closes on the
        // uniform crossfade — no branch-boundary override (no tree).
        let sp = &run.specs[0];
        assert_eq!(sp.transition_in, "hard_cut", "legacy shot 0 entry = hard_cut");
        assert_eq!(sp.transition_out, "crossfade", "legacy shot 0 out = crossfade");
        // Legacy S3 base camera: the per-shot cycling table by REFERENCE
        // (shot g=0 → the cycling establishing values), NOT the leaf's
        // role-resolved camera.
        assert_eq!(
            run.specs[0].concerns.camera,
            shot_camera(0),
            "tree:None shot 0 base camera must be the cycling table value"
        );
        assert_eq!(
            run.specs[1].concerns.camera,
            shot_camera(1),
            "tree:None shot 1 base camera must be the cycling table value"
        );
        // Run stays S5-verified on the legacy path.
        assert!(
            run.verify.verified,
            "tree:None legacy run must stay verified: {:?}",
            run.verify.issues
        );
    }
}
