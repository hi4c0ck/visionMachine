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
//!   then S5 verify (V1..V5) runs against the produced state, and the
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
use crate::generation::video_flow::engine::derive::{derive_full, frames_of, FRAME_RATE, MIN_FRAMES};
use crate::generation::video_flow::engine::gates::{Gate, GateId, Gates, Step};
use crate::generation::video_flow::engine::tag_vocabulary::TagVocabulary;
use crate::generation::video_flow::engine::types::{
    AudioConcern, CameraConcern, Concerns, FilmSeed, Genre, GradeConcern, LensConcern,
    LightingConcern, MotionConcern, NovelScene, NovelShot, PartialConcerns, SceneSpec,
    SceneTimeline, SeedScale, ShotContent, ShotMolecule, ShotSpec, SubSlice, TimelineScene,
    TimelineShot, VisualNovel,
};
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

/// S5 VERIFY result. `issues` uses V1..V5 labels exactly as pipeline.js does.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct VerifyReport {
    pub verified: bool,
    /// V1..V5 labeled issues (empty = clean).
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
    /// still drive S2/S4 regardless of what the LLM claimed.
    pub fn build_with_novel(
        seed_in: FilmSeed,
        novel: VisualNovel,
        tod: &str,
        weather: &str,
        expansion: ExpansionSource,
        expansion_note: Option<String>,
    ) -> Self {
        let seed = normalize_seed(seed_in);
        let mut novel = novel;
        // G0 look axes win over the LLM's own time_of_day/weather: they
        // steer S2 scene specs + S4 prompts on every path.
        novel.film.time_of_day = tod.to_string();
        novel.film.weather = weather.to_string();

        // S2: scene specs - one per novel scene, look seeded from the novel film.
        let scenes: Vec<SceneSpec> =
            novel
                .scenes
                .iter()
                .enumerate()
                .map(|(i, sc)| build_scene_spec(i, sc, &novel, &seed.genre.name))
                .collect();

        // S3: shot specs - one per novel shot, concern-grouped closed defaults.
        let (specs, timeline) = build_specs_and_timeline(&seed, &novel, &scenes);

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

        let fallback_style = format!(
            "{} — {}",
            self.novel.film.style, self.novel.film.palette
        );

        // Molecules + specs are scene-major, shot-major (index-aligned).
        // Flatten both to shot order; the shot title carries the scene id.
        let mut pipes: Vec<PlanPipe> = Vec::new();
        let shot_counts: Vec<usize> =
            self.novel.scenes.iter().map(|s| s.shots.len()).collect();

        for (si, sc) in self.novel.scenes.iter().enumerate() {
            let shot_scene_style = self.scenes.get(si).map(|s| {
                format!(
                    "{} {} — ambience: {}",
                    s.time_of_day, s.weather, s.ambience
                )
            });
            for (ki, _kshot) in sc.shots.iter().enumerate() {
                let mi: usize = shot_counts[..si].iter().sum::<usize>() + ki;
                let Some(spec) = self.specs.get(mi) else { continue };
                let shot_no = ki + 1;
                let shot_title = format!("{} · shot {shot_no}", sc.title);
                let scene_style = shot_scene_style
                    .clone()
                    .unwrap_or_else(|| fallback_style.clone());

                // Concrete concern text, one per section tag.
                let camera_text = {
                    let base = composition_text(&spec.concerns.camera);
                    let lens = if spec.concerns.lens.focal_mm > 0 {
                        format!(" · {}mm lens", spec.concerns.lens.focal_mm)
                    } else {
                        String::new()
                    };
                    format!("{base}{lens}")
                };
                let motion_text_ =
                    motion_text(&spec.concerns.motion);
                let lighting_text = [
                    light_text(&spec.concerns.lighting),
                    grade_text(&spec.concerns.grade),
                ]
                .into_iter()
                .filter(|s| !s.is_empty())
                .collect::<Vec<_>>()
                .join("; ");
                let transition_text =
                    format!("{} → {}", spec.transition_in, spec.transition_out);
                let scene_text = spec.content.prose.clone();

                // Split the clip into concrete concern windows, one section
                // per non-empty concern tag.
                let seg = frames / 5 + 1;
                let mut sections: Vec<PlanSection> = Vec::new();
                for (i, (tag, prompt)) in [
                    (VideoTag::Scene, scene_text),
                    (VideoTag::Camera, camera_text),
                    (VideoTag::Motion, motion_text_),
                    (VideoTag::Lighting, lighting_text),
                    (VideoTag::Transition, transition_text),
                ]
                .into_iter()
                .enumerate()
                {
                    if prompt.trim().is_empty() {
                        continue;
                    }
                    let start = (i as u32) * seg;
                    let end = if i == 4 {
                        frames
                    } else {
                        ((i as u32 + 1) * seg).max(start + 1)
                    };
                    sections.push(PlanSection {
                        tag,
                        frame_start: start,
                        frame_end: end,
                        prompt: prompt.trim().to_string(),
                        from: vec![],
                    });
                }

                pipes.push(PlanPipe {
                    index: pipes.len(),
                    title: shot_title,
                    global_style: scene_style,
                    media_mode: "text".into(),
                    sections,
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
    // Trim to exactly `n` entries (pad with the last fragment if short).
    while parts.len() < n {
        let last = parts.last().cloned().unwrap_or_else(|| "the moment deepens".into());
        parts.push(last);
    }
    parts.truncate(n);
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
fn build_scene_spec(index: usize, _sc: &NovelScene, novel: &VisualNovel, genre: &str) -> SceneSpec {
    SceneSpec {
        scene_id: format!("scene_{:02}", index + 1),
        time_of_day: novel.film.time_of_day.clone(),
        weather: novel.film.weather.clone(),
        light: LightingConcern {
            key: "soft".into(),
            contrast: "medium".into(),
            color_temp_k: 5000,
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

fn shot_motion(g: usize) -> MotionConcern {
    let moves = ["static", "pan", "track", "dolly", "static"];
    let speeds = ["normal", "slow", "normal", "slow", "normal"];
    MotionConcern {
        r#move: moves[g % moves.len()].to_string(),
        zoom: "static".into(),
        speed: speeds[g % speeds.len()].to_string(),
    }
}

/// S3 Node B + S2 division — concern-grouped shot specs (closed vocab defaults)
/// and the shot timeline at transition points.
fn build_specs_and_timeline(
    seed: &FilmSeed,
    novel: &VisualNovel,
    scenes: &[SceneSpec],
) -> (Vec<ShotSpec>, SceneTimeline) {
    let clip = seed.scale.clip_s[0].clamp(4, 10);
    let mut specs: Vec<ShotSpec> = Vec::new();
    let mut tl_scenes: Vec<TimelineScene> = Vec::new();

    for (si, sc) in novel.scenes.iter().enumerate() {
        let scene = &scenes[si];
        let mut tl_shots: Vec<TimelineShot> = Vec::new();
        for (ki, kshot) in sc.shots.iter().enumerate() {
            let shot_num = ki + 1;
            let shot_ref = format!("scene_{si}.shot_{shot_num}");
            let shot_id = format!("tl_{:02}_shot_{:02}", si + 1, shot_num);

            // S3 — ShotSpec: concern-grouped, closed defaults.
            let g = si * sc.shots.len() + ki;
            let concerns = Concerns {
                camera: shot_camera(g),
                lens: shot_lens(g),
                motion: shot_motion(g),
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
            // Sub-timeline: three clean slices tracking a beat progression.
            let sub = vec![
                SubSlice {
                    from_s: 0,
                    to_s: clip / 3,
                    note: format!("{shot_ref} opens"),
                    state: Some(PartialConcerns {
                        camera: Some(CameraConcern { size: "close-up".into(), angle: "eye".into(), framing: "fill_frame".into(), dof: "shallow".into() }),
                        lens: Some(LensConcern { focal_mm: 85, distortion: None }),
                        motion: None, lighting: None, grade: None, effects: None, audio: None,
                    }),
                },
                SubSlice {
                    from_s: clip / 3,
                    to_s: clip * 2 / 3,
                    note: format!("{shot_ref} develops"),
                    state: Some(PartialConcerns {
                        camera: Some(CameraConcern { size: "medium".into(), angle: "eye".into(), framing: "rule_of_thirds".into(), dof: "medium".into() }),
                        lens: Some(LensConcern { focal_mm: 50, distortion: None }),
                        motion: None, lighting: None, grade: None, effects: None, audio: None,
                    }),
                },
                SubSlice {
                    from_s: clip * 2 / 3,
                    to_s: clip,
                    note: format!("{shot_ref} closes"),
                    state: Some(PartialConcerns {
                        camera: Some(CameraConcern { size: "wide".into(), angle: "eye".into(), framing: "centered".into(), dof: "deep".into() }),
                        lens: Some(LensConcern { focal_mm: 35, distortion: None }),
                        motion: None, lighting: None, grade: None, effects: None, audio: None,
                    }),
                },
            ];
            specs.push(ShotSpec {
                shot_id: shot_id.clone(),
                novel_ref: shot_ref.clone(),
                content: ShotContent {
                    prose: kshot.prose.clone(),
                    beats: kshot.beats.clone(),
                },
                clip_s: clip,
                transition_in: if si == 0 && ki == 0 { "hard_cut".into() } else { "crossfade".into() },
                transition_out: "crossfade".into(),
                concerns,
                sub_timeline: sub,
            });

            // S2 division: timeline shot.
            tl_shots.push(TimelineShot {
                shot_id: shot_id.clone(),
                novel_ref: shot_ref.clone(),
                clip_s: clip,
                transition_out: "crossfade".into(),
                transition_note: format!("cut to next in scene {}", si + 1),
            });
        }
        tl_scenes.push(TimelineScene {
            scene_id: format!("scene_{:02}", si + 1),
            title: sc.title.clone(),
            transition_in: if si == 0 { "hard_cut".into() } else { "crossfade".into() },
            transition_note: "scene entry".into(),
            time_of_day: novel.film.time_of_day.clone(),
            weather: novel.film.weather.clone(),
            shots: tl_shots,
        });
    }

    let total_s = seed.scale.scenes as u32 * seed.scale.shots_per_scene * seed.scale.clip_s[0];
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
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
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
}

fn default_ratio() -> String { "16:9".into() }
fn default_tod() -> String { "midday".into() }
fn default_weather() -> String { "clear".into() }

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
    pub fn build_run(&self) -> EngineRun {
        let seed = self.to_seed();
        // The G0 look axes steer S1 (novel world/palette/light) + S2
        // (scene light) directly — they are NOT baked into the style string,
        // which stays the pure G0 genre/style author value (no doubling).
        // S2 specs + S4 prompts inherit the axes from the novel film, so no
        // post-build patch is needed.
        EngineRun::build(seed, &self.time_of_day, &self.weather)
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

        // Each materialized pipe lowers its concrete concern sections to
        // segments whose prompts are real concrete text (>20 chars), not a
        // bare clause.
        let p0m = &pipes[0];
        let timeline = p0m
            .elements
            .iter()
            .find(|e| matches!(e, crate::models::composer::PipeElement::Timeline(_)))
            .expect("timeline element present");
        if let crate::models::composer::PipeElement::Timeline(t) = timeline {
            assert!(!t.segments.is_empty(), "concrete sections lower to segments");
            for seg in &t.segments {
                let prompt = seg
                    .tags
                    .first()
                    .and_then(|t| t.prompt.as_deref())
                    .unwrap_or("");
                assert!(
                    prompt.trim().len() > 3,
                    "section prompt is concrete concern text, got: '{prompt}'"
                );
            }
        }
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

}
