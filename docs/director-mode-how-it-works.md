# Director Mode — How It Works

> A working explanation of the Director's-harness flow: the S0→S5 pipeline, the
> S0.5 structural tree, the scene-understanding / duration engine, the
> content-aware scale resolver (commit `195be96`), the mood + beat + dwell
> arsenal, the three seams that made composition "too crude," and what
> `195be96` closed vs. what is deferred.
>
> Grounded in the code as of `feature/text-video-flow` (post `195be96`):
> - Rust: `src-tauri/src/generation/video_flow/` (`mod.rs`, `engine/`),
>   `src-tauri/src/commands/director.rs`
> - Frontend: `src/components/Director/`, `src/lib/directorStore/`
> - Companion docs: `director-harness-ui-system.md` (UI contract),
>   `video-flow-solutions-map.md`, `video-flow-case-decision-map.md`,
>   `agnes-model-catalog.md` (the i2v media chain).

---

## 1. What the Director mode actually is

The Director is the **tabbed composer** that turns a short creative idea into a
solid, regeneration-ready set of composer pipes, through a chain of
versioned, isolated steps. The user types an *idea* ("a red fox darts through
the tall pine forest at dusk…") plus a few look controls, and the flow produces
a deterministic, fully-verified plan of one pipe per shot.

Two production paths share the same S2–S5 spine:

- **Template path** — LLM-free, deterministic, always available. The
  "product path the UI drives today."
- **LLM path (Node A)** — when the session has a configured text provider, an
  LLM *writes the S1 novel* and the same deterministic S2–S5 bridge runs
  around it. Failure is never silent: a failed LLM run keeps the template run
  and records *why* it fell back (`ExpansionSource::Template` + a note).

Everything the engine emits is **tag-closed by construction** (only values
from the `TagVocabulary`), so an S5 verification (`V1..V7`) is always clean on
the deterministic path — that is what the Scoreboard's "verified ✓" chip
depends on.

---

## 2. The S0→S5 flow

From `mod.rs::run_full_with_entry` + `seed.rs` + `commands/director.rs`:

```
① DIRECTION   G0 entry (idea + genre/ratio/scale + time-of-day + weather +
               mood) + the S0.5 STRUCTURAL TREE
      ↓
 S0 IntentSnapshot   raw text → clauses + entry text (ground truth)
      ↓
 S1 EXPAND           Node A → VisualNovel
                     • template: build_novel (deterministic, saturated)
                     • LLM:      llm::expand_node_a (provider text model)
      ↓
 S2 STRUCTURE        one SceneSpec per novel scene (base look)
                     + the S2 division timeline
      ↓
 S3 SHOT SHEETS      one ShotSpec per novel shot (concern-grouped)
                     + sub-timeline (sub-slices)
      ↓
 S3′ MOLECULES       ShotMolecule = the delta form a shot inherits from
                     its scene; S4 DERIVE fills image/video prompts
      ↓
 S4 PROMPT BUILD     derive_full(scene, molecule) → concrete prompts
                     → plan_from_engine → one composer pipe per shot
      ↓
 S5 VERIFY           V1..V7 invariants; gate states G0..G4 stamped
      ↓
   composer apply   director_apply_flow[_edited|_scoped] → materialize
                     into the session's composer (one copy at a time)
```

`commands/director.rs::director_run_flow` is the orchestrator. It emits a
fixed sequence of progress events (`intent → expand → structure → critic →
lower → verify`) so the run log never looks frozen while the LLM writes the
novel.

### The structural tree is attached at S0.5

Before the novel is written (template) or requested (LLM brief), the engine
builds the **S0.5 structural tree** (`tree.rs::build_structural_tree`). It is a
pure, LLM-free "brain" layer: it fixes the **shape** and leaves the **content**
to whoever writes the novel. The tree is stored on `EngineRun.tree`
(`#[serde(default)]` → old docs load `None` and keep the legacy per-shot
cycling tables, byte-stable).

---

## 3. The S0.5 structural tree (`tree.rs`)

Design rule (agreed with the author): **the tree is a BRIEF, not a cage.** It
fixes:

- scene/shot **counts** (the run scale),
- per-branch **roles** (`establishing / developing / turn / resolving`),
- the **energy curve** (0..=1 per branch, derived from role),
- per-boundary **transition intent** (chosen from the energy delta + mood
  bias — *not* a modulo cycle),
- a **chained color-temperature arc** (`open[i+1] == close[i]` exactly, so a
  cut in a continuous scene never flickers warm↔cool),
- a **target runtime** (seconds),
- the **continuity thread** ("who/where carries across cuts").

It does **not** invent prose, environment, character, or beats — those stay
with the content source. Every value the tree emits is a member of the closed
`TagVocabulary` and obeys the engine caps, so a tree-carrying run stays
S5-verifiable by construction.

Key types: `TreeRoot` (thesis, driver, target_duration_s, energy, temp_arc,
continuity_thread), `TreeBranch` (role, shots, narrative, transitions,
leaves, temp_open/close_k, energy), `TreeLeaf` (intent, camera_role,
motion_intent, beat_hints), `TreeOverrides` (user pins), `Driver`
(closed: `action / atmosphere / character / exploration / neutral`).

Manual-override rule: an **absent** pin = the tree's auto value wins; a
**present** pin wins over the auto value. The wire is snake_case (matching the
TS mirror in `engine.ts`), so a multi-word pin like `shots_per_scene` or
`temp_arc` reaches Rust under the same key the UI writes.

Helper surfaces:

- `leaf_to_concerns` — turns a leaf's `camera_role` + `motion_intent` into
  closed-vocab camera/lens/motion concerns (replaces the `g % N` cycling
  tables on the tree path).
- `brief_block` — the compact brief injected into the LLM Node A prompt, with
  a **soft narrative hint per scene** (`branch_narrative_hint`, "hint, not a
  cage": it steers story direction but never overrides the FilmSeed idea).

---

## 4. The three seams that made composition "too crude"

Before `195be96`, a rich multi-clause idea with a target budget still produced
frozen, flat output. The diagnosis (three broken seams):

### Seam 1 — scene/shot **COUNT** was frozen at the G0 default

`default_engine_entry` ships `scale = { scenes: 1, shots_per_scene: 2,
clip_s: [8,10] }` (`mod.rs`). The run used that literally. `suggest_scale`
(computed from the idea's word/clause count) produced an "auto 3×3"-style
number, but it was shown **only as a badge** in `StructurePanel`
("driver character · target ~40s · auto 3×3") and **never consumed in the run
path**. So a 4-clause idea read as 1 scene × 2 shots ≈ 16s, no matter the
content.

### Seam 2 — shot **DURATION** was flat

In `seed.rs::build_specs_and_timeline`, every shot got

```
clip = match mood { Some(p) => p.clip_range[0].clamp(4,10),
                    None  => seed.scale.clip_s[0].clamp(4,10) }
```

i.e. a **flat constant** — the mood band's min (8s for `balanced`). The
art-director arsenal (`TreeBranch.energy`, `MoodProfile.clip_range` **range**,
`beat_profiles.pacing_weight`) did **not** drive duration. The whole film was
`n_shots × 8s`, not shaped by the energy curve.

### Seam 3 — the "stupid 2–3s inserts"

Those came from `shot_sub_slices`: it splits a **fixed 8s clip** into sub-slice
windows weighted by `pacing_weight` (wide=1.5 → ~4s, close-up=0.8 → ~2s). That
is real pacing machinery, but it is *relative to a flat clip* — so the
composition looked like a series of short inserts instead of a deliberate
arc.

**The user's ask:** "We need real understanding in episode-duration
improvement; composition should not be built on stupid 2–3s inserts; we have
a whole art-director arsenal." → fix the understanding, **not** with a hard
clamp.

---

## 5. The content-aware scale resolver (`195be96`)

`195be96` added `tree.rs::resolve_run_scale` — the single place that decides
the run's scene/shot numbers — plus `tree_caps()` (single source of caps) and
`role_dwell_weight()` (the art-director dwell table, written + tested, wired
in the next seam). The rule is **SOFT**: the target is a *budget that steers
the shape*, never a hard clamp on the user's content.

```
resolve_run_scale(intent, entry, overrides, caps) -> SeedScale
```

Three ordered rules:

1. **Pin wins per field.** An explicit `overrides.scenes` /
   `overrides.shots_per_scene` always wins for its field, and is **never**
   overridden by the budget.
2. **Content adopts the default.** When the G0 entry scale is the *untouched
   1×2 default* and nothing is pinned, the run adopts the content-derived
   `suggest_scale` — a rich 4-clause idea reads as ~3 scenes, not 1. If the
   entry scale is *explicit* (not the default), the user's choice is honored
   even when content would suggest more.
3. **Target = soft budget.** A pinned `target_duration_s` soft-fits the shape
   to the budget at the mood band's clip length: `clips_needed =
   ceil(target / clip_eff)`.
   - **Grow** first the scene count (a scene carries the dramatic role — the
     beats live there), then the intra-scene cuts, up to the closed caps.
   - **Trim** only `shots_per_scene` (down to 1); scenes are *content* and
     survive.
   - The run lands as close to the target as the closed engine caps allow.

The caps come from `tag_vocabulary.rs` (single source via `tree_caps()`):
`CLIP_S (4,10)`, `SHOTS_PER_SCENE_MAX 5`, `SCENES_MAX 24`,
`COLOR_TEMP_K (2500,10000)`, `MAX_REFS 4`.

`build_structural_tree` now calls `resolve_run_scale` (replacing the old
`effective_scale`), so the tree's shape and the run agree.

### Single resolution point (`director.rs`)

The **decisive** design choice: `director_run_flow` resolves the entry scale
**once** and feeds that resolved entry to **both** the template run
(`run_full_with_entry`) **and** the LLM path (Node A hard counts +
`repair_counts` + V3). So the LLM's hard scene/shot counts, the count repair,
and V3 all see *the same numbers* — one resolution, no divergence. A rich
prompt can never silently collapse back to the 1×2 default.

New tests (5): `resolve_default_entry_adopts_content_scale`,
`resolve_explicit_entry_scale_wins_over_content`,
`resolve_pins_win_and_survive_target`, `resolve_target_budget_grows_default_scale`,
`role_dwell_weights_are_ordered` — 365/365 lib tests green.

---

## 6. The mood + beat + dwell arsenal

### Mood bands (`seed.rs::MoodProfile::for_mood`, the M4 slider)

One `0..=100` "Subtle ↔ Cinematic" slider maps onto three closed bands. Each
band drives the deterministic S2/S3 seeding (clip length, transitions, base
motion, effects, contrast, default camera move) **and** one Node A prompt line.

| band | mood | clip | transitions (in0 / default) | base move | speed | effects | contrast |
|---|---|---|---|---|---|---|---|
| subtle | 0–33 | [6,8] | hard_cut / cut_on_action | static | fast | 0 | medium |
| balanced | 34–66 | [8,10] | hard_cut / crossfade | pan | normal | 1 | medium |
| cinematic | 67–100 | [10,12] | match_cut / crossfade | crane | slow | 3 | high |

All emitted values stay in the closed vocab; `clip_range[0]` is clamped to the
`4..10` engine cap (so cinematic's 12s max lands at 10s). Mood-50 (balanced)
is the pre-M4 pin and stays byte-stable for old docs.

### Beat profiles (`beat_profiles.rs` + `harness/config/beat_profiles.json`)

The **activation key** is the closed-vocab **shot-size prefix** parsed from a
Node A beat (`"<size>: <subject> <motion> — <detail>"`). The table maps each
size to a concern state (lens / DoF / framing / lighting / motion) + a
`pacing_weight` (wide 1.5, medium 1.0, close-up 0.8, over-the-shoulder 1.0).
Content drives activation: a shot whose beats parse a size gets beat-driven
sub-slices; one that doesn't falls back to the per-shot **cycling** journey
(the guaranteed structure, sibling-variety by the global shot index). The JSON
is embedded via `include_str!` — no runtime IO; a malformed table fails at
compile time.

### Role dwell (`tree.rs::role_dwell_weight`) — written, tested, **deferred**

The art-director "where the time goes" table:

```
establishing 1.5 · turn 1.5 · developing 1.0 · resolving 0.8
```

This is **P4** — distributing a run's target budget across scenes by role
weight so duration follows the energy shape, not a flat band. It was
implemented but **reverted** in `195be96` because it broke the **S5 V6
invariant**: `plan_from_engine` (the marker-bridge structure step) tiles its
per-pipe frame ranges off its **own grid**, not the per-scene clips — so the
sum of generated pipe lengths (`1248f`) no longer matched the cumulative S3
shot clips (`1152f`). P4 is documented in `seed.rs` (the "P4 NOTE" block) as
the **next seam**: it needs the structure step to tile per-pipe frames off the
same per-scene clips. Until then, every shot keeps the flat band clip
(byte-stable); P1/P2 (content-aware count + soft target budget) already make a
rich idea read at the right length instead of the frozen 1×2.

---

## 7. The deterministic spine (S2–S5, `seed.rs`)

- `build_novel` (S1): saturated visual language. The idea gets **one** home
  (the film logline); each shot prose is composed from its camera concern + a
  cycling sensory axis + the G0 look axes (never an echo of the whole idea);
  `idea_units` spreads the author's real content across shots round-robin
  (never tail-repeats one fragment).
- `build_scene_spec` (S2): one SceneSpec per scene; color temperature from the
  owning branch's chained open-K pair (the tree's #3 fix), the hardcoded 5000K
  is the `tree:None` legacy fallback.
- `build_specs_and_timeline` (S3 + S2 division): one ShotSpec per shot; the
  tree's leaves drive base camera/lens via `leaf_to_concerns`; the mood band
  stamps base motion + effects + contrast on top; sub-slices are
  content-driven (LLM) or cycling (template). The S2 division total = the
  cumulative shot-clip length (what V6 compares generated pipes against).
- `shot_sub_slices` / `shot_sub_slices_cycling`: the beat-driven or
  per-shot-index sub-slice journeys; V7 no-op slices are always collapsed so
  every emitted slice adds a real concern delta.
- `plan_from_engine` (S4 → concrete pipes): **one pipe per shot**, each split
  into concern sections (`scene / camera / motion / lighting / transition /
  effect`), delta-driven (a concern emits a windowed section only where it
  changes). The sustained base + genre ambience bed live once in
  `global_style`; a bounded `continuity:` line names the film's principal so a
  generated clip keeps the through-line. Each pipe is lengthed to its own
  shot's S3 clip (no dead tail) — the LENGTH FIDELITY the pinned test
  `engine_plan_structure_is_pinned_exactly` guards.
- `verify` (S5): V1 shape, V2 tag-closure, V3 counts, V4 frame floor,
  V5 invariants (identity lock + no on-screen text), V6 length comparison,
  V7 no-op sub-slice.

---

## 8. The LLM path (Node A, `llm.rs`)

`expand_node_a` makes one chat-completions call against the session's text
provider (OpenAI-compatible, `response_format: json_schema`), with the harness
Node A system prompt, the strict `VisualNovel` schema, and `repair_counts` to
the seed scale. Two attempts (the harness `llm.json` retry); on a
`response_format` capability error the retry drops it and asks for plain JSON.
Failure is **never silent**: any error returns a named reason and the caller
keeps the template run + records the fallback.

`repair_counts` deterministically truncates / repeats the LLM's novel to
`entry.scale` so S2–S5 counts stay consistent. Because `director_run_flow`
resolves the scale *once* before this call, Node A's **hard counts** and the
repair target are the same content-aware numbers the template path used.

`node_a_request_body` injects the S0.5 `brief_block` + a **soft duration
conformance line** ("aim your prose to pace toward it, but the scene/shot
COUNTS below are hard") — the "brief, not a cage" rule. `tree == None` keeps
the prompt byte-stable (the `node_a_body_matches_fixture_contract` pin).

---

## 9. The i2v media chain (from `79be072`, see `agnes-model-catalog.md`)

The image→video handoff is a distinct, documented fix:

- The Agnes image API returns **`url` XOR `b64_json`** (exclusive — the stored
  responses prove it; top-level `return_base64` does *not* stack).
- The platform-outputs CDN 403s the **desktop client** (IP/CloudFront-gated,
  not expiring — confirmed across reqwest/curl/chrome UAs, fresh and old
  URLs), but the provider's **video backend** fetches the CDN URL
  server-side fine (the "fluent chain").
- `79be072` restored the **url-mode** chain, made local materialization
  **best-effort** (a CDN 403 degrades the local cache, never the task), and
  kept the `data:`-URI inliner (`4a05fd7`) as a last-resort for local-only
  media. Task success is decoupled from the CDN download policy.

---

## 10. The frontend (`src/components/Director/` + `src/lib/directorStore/`)

- `DirectorPanel.svelte` — slim **parent** owning all Director shared state +
  business logic; renders four presentational children:
  `hot/DirectorHotPath`, `adv/DirectorAdvanced`, `ext/ExtractTab`,
  `ext/ScoreboardTab`. Keeps a **deep-frozen** single shared default template
  (one-copy-at-a-time) and session value copies; debounced scratch
  persistence (`director_save_scratch`), `hydrateScratch` / `applyScratchEdits`.
- `hot/StructurePanel.svelte` — the **S0.5 "Film Structure"** card: renders the
  tree (driver, target runtime, branch roles, energy bars, chained temp arc,
  advisory hints) + the **manual-override PINS** (driver / scenes /
  shots-per-scene / target s / per-branch transition) written back via
  `bind:overrides`. The "driver character · target ~40s · auto 3×3" badge is
  `tree.root.target_duration_s` + `tree.auto_scale` (the two fields that,
  before `195be96`, were decorative and did not steer the run).
- `adv/MoodSlider.svelte` — the M4 Subtle↔Cinematic band selector.
- `ext/ExtractTab.svelte` — the concrete structural text (one block per plan
  section, copy-all / save / regenerate-pipes / diff).
- `ext/ScoreboardTab.svelte` — the four-question read-first board
  (weak spot / golden drift / critic A/B / learning strip) + the golden set.
- `hot/RunLog.svelte`, `hot/TimelinePreview.svelte` — run progress + a
  timeline preview of the verified frames.
- `directorStore/entryDraft.ts` — G0 entry draft persistence (localStorage,
  `_owner` session validation). Default scale `{ scenes:1,
  shots_per_scene:2, clip_s:[8,10] }` — the frozen default that
  `resolve_run_scale` now adopts content for.
- `directorStore/engine.ts` — the TS mirror of the tree / entry types;
  `seedCard.ts` — the shareable one-file film-plan snapshot.

Persistence on disk (`commands/director.rs`): `flow.v{N}.json` (coexisting,
never overwritten), `flow_signals.jsonl` (append-only), `golden.json` (one
baseline per `flow_version`, one-copy-at-a-time), `director_scratch.json`
(opaque UI-owned JSON).

---

## 11. Invariants to keep true

- **Exactly one final producer per rendered state** — each rendered value has
  a single writer; the frozen default template is the single copy.
- **Non-blocking UI thread** — the Director run keeps the DB lock window small
  around path resolution and never holds it across the LLM network call.
- **One resolution of the run scale** — `resolve_run_scale` runs once in
  `director_run_flow`; every downstream layer (template run, Node A hard
  counts, `repair_counts`, V3) reads the same numbers.
- **Tag-closure** — everything the engine emits is a `TagVocabulary` member,
  so S5 stays verifiable by construction.
- **P4 dwell is deferred** — until `plan_from_engine` tiles per-pipe frames
  off the per-scene clips, per-scene role-dwell clip distribution stays
  unwired (documented in `seed.rs`), keeping S5 V6 byte-stable.

---

## 12. Quick reference

| Symptom | Root | Fix / status |
|---|---|---|
| "still 2 scenes despite target 40s" | Seam 1: count frozen at G0 1×2 | `resolve_run_scale` adopts content + soft budget (`195be96`) |
| "composition is 2–3s inserts" | Seam 2: flat `band clip` + Seam 3: pacing on a fixed clip | content-aware count + soft budget closed two of three; **P4 dwell** is the remaining structure-step seam |
| "auto 3×3 badge didn't do anything" | `auto_scale` was display-only | the resolver now *is* the consumed source; the badge reflects the same `suggest_scale` |
| "i2v first_frame not fetchable" | CDN 403 client-egress gate; url XOR b64 | `79be072` restored url chain + best-effort local cache; `data:` inliner as last resort |
| "S5 V6 drifts 1248f ≠ 1152f" | P4 distributed clips but `plan_from_engine` tiled its own grid | P4 reverted + documented; wire per-pipe frames off per-scene clips next |

---

## 13. Known failure class: illegal filename chars in pipe titles (fix `b6f1a3…`)

**Symptom (from `logs/VisionMachine.log`, 2026-11-10 00:52):**

```
[Generation] video task 89132e88 job task_GGf2… completed        ← provider job DID finish
[Generation] task 89132e88 stage Final video failed: create
  C:\...\forest show\Scene 1: Departure · shot 1\images:
  Синтаксическая ошибка в имени файла… (os error 123)
[Generation] task 89132e88 failed at stage 1
```

**Root cause.** An LLM Node A scene title — `"Scene 1: Departure"` (the natural
"Scene N: …" pattern) — flows through `plan_from_engine` into the composer pipe
title (`"{scene} · shot N"`), which becomes a **filesystem dir component** via
`pipe_media_dirs`. The old `safe_dir_name` only stripped `../` traversal
(`Path::file_name()`); `:` survived it, but `:` is reserved on NTFS
(drive letters / alternate data streams), so `create_dir_all` threw
`ERROR_INVALID_NAME` (os error 123). The provider job was already done — only
the local artifact write failed. Intermittent by content: a run whose LLM
scenes were "The Departure" (no colon) created folders fine on disk.

**Architectural fix (data boundary, no UI/LLM-prompt workaround).** One shared
scrub rule, `media.rs::scrub_file_component`, now defends **both** name→path
sanitizers (`safe_dir_name` for pipe/task/ref components, `safe_session_name`
for the session dir) so they cannot drift apart:

- drops every NTFS-illegal character: `< > : " \ / | ? *`
- drops control chars; trims a trailing run of `.` / ` ` (NTFS strips these
  on create anyway)
- suffixes bare reserved device names (`NUL`, `CON`, `COM1`–`COM9`,
  `LPT1`–`LPT9`) with `_`
- keeps legal non-ASCII (`·`, Cyrillic, CJK) — readability of LLM-authored
  titles is preserved: `Scene 1: Departure · shot 1` → `Scene 1 Departure · shot 1`

Pinned by `safe_dir_name_scrubs_windows_illegal_chars` +
`scrub_file_component_drops_only_illegal_chars` (367/367 lib green).
