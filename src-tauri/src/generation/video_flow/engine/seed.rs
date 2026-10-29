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
    pub fn build(seed_in: FilmSeed) -> Self {
        let seed = normalize_seed(seed_in);

        // S1: visual novel — one film + scenes + shots with beats.
        let novel = build_novel(&seed);

        // S2: scene specs — one per novel scene, look seeded from the novel film.
        let scenes: Vec<SceneSpec> = novel.scenes.iter().enumerate().map(|(i, sc)| build_scene_spec(i, sc, &novel)).collect();

        // S3: shot specs — one per novel shot, concern-grouped defaults.
        let (specs, timeline) = build_specs_and_timeline(&seed, &novel, &scenes);

        // S3′/S4: molecules — derived from (scene, spec pair), prompts filled.
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
            verify: VerifyReport { verified: false, issues: Vec::new(), frames: Vec::new(), total_frames: 0 },
            gates: Vec::new(),
        };
        run.verify = verify(&run);
        run.gates = Self::gate_states();
        run
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
fn build_novel(seed: &FilmSeed) -> VisualNovel {
    let style_hint = if seed.genre.style.is_empty() { "cinematic" } else { seed.genre.style.as_str() };
    let film_title = if seed.title.is_empty() { "Untitled" } else { seed.title.as_str() };
    let scenes: Vec<NovelScene> = (0..seed.scale.scenes)
        .map(|i| {
            let scene_num = i + 1;
            let shot_count = seed.scale.shots_per_scene as usize;
            let shots: Vec<NovelShot> = (0..shot_count)
                .map(|k| {
                    let shot_no = k + 1;
                    NovelShot {
                        prose: format!(
                            "scene {scene_num} shot {shot_no}: {film_title} — {style_hint}; {} content, {style_hint}",
                            if k == 0 { "establishing" } else { "developing" }
                        ),
                        beats: vec![
                            format!("scene {scene_num}.shot {shot_no} opens: {style_hint}"),
                            format!("scene {scene_num}.shot {shot_no} develops: {style_hint}"),
                        ],
                    }
                })
                .collect();
            NovelScene {
                title: format!("Scene {scene_num}"),
                prose: format!("Scene {scene_num} of {film_title} — {style_hint}."),
                shots,
            }
        })
        .collect();
    VisualNovel {
        film: crate::generation::video_flow::engine::types::FilmLook {
            title: film_title.to_string(),
            logline: seed.idea.clone(),
            style: seed.genre.style.clone(),
            world: seed.genre.style.clone(),
            palette: "neutral".into(),
            time_of_day: "midday".into(),
            weather: "clear".into(),
        },
        scenes,
    }
}

/// S2 Node A′ — per-scene base look. Seeded from the novel film + scene title.
fn build_scene_spec(index: usize, sc: &NovelScene, novel: &VisualNovel) -> SceneSpec {
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
        ambience: sc.title.clone(),
        tempo: "medium".into(),
        effects_base: Vec::new(),
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
            let concerns = Concerns {
                camera: CameraConcern {
                    size: "medium".into(),
                    angle: "eye".into(),
                    framing: "rule_of_thirds".into(),
                    dof: "medium".into(),
                },
                lens: LensConcern { focal_mm: 35, distortion: None },
                motion: MotionConcern {
                    zoom: "static".into(),
                    r#move: "static".into(),
                    speed: "normal".into(),
                },
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
        FilmSeed {
            title: self.title.clone(),
            idea: self.idea.clone(),
            input_text: self.input_text.clone(),
            genre: self.genre.clone(),
            ratio: self.ratio.clone(),
            scale: self.scale.clone(),
        }
    }

    /// Build an S0→S5 run, injecting the G0 look axes into the seed-driven novel.
    pub fn build_run(&self) -> EngineRun {
        let mut seed = self.to_seed();
        // Inject the look axes into a style suffix so S1/S2 carry them.
        if !seed.genre.style.is_empty() && (self.time_of_day != "midday" || self.weather != "clear") {
            seed.genre.style = format!(
                "{}; {} setting, {}",
                seed.genre.style,
                self.time_of_day,
                self.weather,
            );
        } else {
            seed.genre.style = format!(
                "{}; {} setting, {}",
                if seed.genre.style.is_empty() { "cinematic" } else { &seed.genre.style },
                self.time_of_day,
                self.weather,
            );
        }
        let mut run = EngineRun::build(seed);
        // Patch the novel film + scenes with the G0 look axes (they drove S1 seeding).
        run.novel.film.time_of_day = self.time_of_day.clone();
        run.novel.film.weather = self.weather.clone();
        for sc in &mut run.scenes {
            sc.time_of_day = self.time_of_day.clone();
            sc.weather = self.weather.clone();
        }
        // Re-verify to catch any regression.
        run.verify = verify(&run);
        run
    }
}
