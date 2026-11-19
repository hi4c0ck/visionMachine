# Director Mode — User Manual

VisionMachine v0.7.11 · Director mode turns a short creative idea into a
verified, regeneration-ready set of composer pipes — one pipe per shot —
through a chain of versioned steps. It speaks the language of a film set:
slates, takes, script pages, cue sheets, and contact sheets.

> Screenshots marked **capture pending** are filled from the live app in the
> final release pass; the layout described is the shipped v0.7.11 layout.

---

## 1. Opening Director

Select a session, then open the **Director** tab in the workspace. The panel
has three tabs:

| Tab | What it shows |
|---|---|
| **Hot path** | The run controls: idea, look controls, film structure, step chain, run log, timeline preview |
| **Extract** | The concrete structural text of the last run — one cue-sheet block per section |
| **Scoreboard** | The read-first quality board: weak spots, golden drift, critic A/B, learning strip |

A diagonal clapper stripe runs across the top of the Director frame on every
tab — that's the slate. Everything below it is the production.

<!-- SCREENSHOT PENDING: director-overview.png — full Director panel, hot path tab, post-run state -->

## 2. Setting up a run (the G0 entry)

On the Hot path:

1. **Idea** — type a short creative premise, e.g. *"a red fox darts through
   the tall pine forest at dusk"*. This is the ground truth every later step
   traces back to.
2. **Look controls** — genre/style, aspect ratio, time of day, weather.
3. **Scale** — scenes × shots-per-scene × clip seconds. This is your *goal
   length*: the engine treats it as the runtime budget and resolves the
   actual counts from your content (a dense idea earns more shots; the
   badge on the structure card reflects the same resolution).
4. **Mood slider** — Subtle ↔ Balanced ↔ Cinematic. The mood sets the look
   band (clip length, transitions, effects, contrast). Since v0.7.11 it no
   longer dictates pacing by itself — see §6.

### The Film Structure card

Below the entry sits the **S0.5 structural tree**: the driver character,
target runtime, branch roles (open / develop / close), energy bars, and the
chained color-temperature arc. You can pin manual overrides — driver, scene
count, shots per scene, target seconds, per-branch transitions — and the run
honors them. The `driver · target ~40s · auto 3×3` badge is live data, not
decoration: it is the exact scale the run will use.

<!-- SCREENSHOT PENDING: director-structure.png — Film Structure card with pins -->

## 3. Running — the step chain

Press **Run**. The ⑤ STEP CHAIN heading becomes a slate take line:

- **TAKE K** — the flow version of this run (every run is kept; takes never
  overwrite each other).
- **{frames}f · 24fps · {runtime}s** — the verified totals.
- A rotated **↻ RETAKE {step}** stamp appears when the take is a re-run from
  a specific step.

While the run is live, a film-leader ring spins in the heading and each step
row carries a **tally lamp**:

| Lamp | Meaning |
|---|---|
| 🟢 green glow | step verified ok |
| 🟠 dim amber | untrained stub (honest placeholder — see Scoreboard) |
| 🔴 red | step failed |

The steps, in order: **intent → expand → structure → critic → lower →
verify**. The run log streams progress so nothing looks frozen — including
while the LLM writes the novel (when a text provider is configured; without
one, the deterministic template path runs and always works).

<!-- SCREENSHOT PENDING: director-running.png — step chain mid-run, leader ring + lamps -->

## 4. Reading the result

### The script page

Each scene renders as a script-page card: uppercase mono slugline, a
**REV {K}** revision stamp, the prose in a comfortable reading column, and
numbered beats with accent ticks. Shot counts and hand-off lines carry the
continuity between scenes.

### One pipe per shot

The run materializes **one composer pipe per shot**, lengthed to that shot's
own clip — no dead tails. Each pipe's timeline is a set of **window zones**:
every story beat gets its own `<segments>` window with its scene, camera,
lighting, motion, and transition tags nested inside at their own sub-ranges
(new in v0.7.11 — previously everything collapsed into one long block). The
prompt sent to the video model preserves that nested structure.

### Extract — the cue sheet

The Extract tab lists every section of the plan as a cue-sheet row. Alongside
the full text (never truncated) you get department chips:

- **SC / CAM / LGT / MOT / TRN / FX** — which department the cue belongs to
- **4500K** gel chip with a luminance dot on lighting cues
- **35mm** lens chip on camera cues
- **→ fast** motion vector glyph + speed on motion cues

From here you can **copy all**, **save**, **regenerate pipes** into the
composer, or **diff** against a previous take.

<!-- SCREENSHOT PENDING: director-extract.png — Extract tab with cue-sheet chips -->

## 5. Scoreboard — the contact sheet

The Scoreboard answers four questions before you trust a run:

1. **Weak spot** — exposure strips with 10% tick marks. A dashed edge means
   the critic model is *untrained* (the score is a stub, honestly marked);
   solid edges mean a trained critic scored it.
2. **Golden drift** — the golden set renders as sprocketed film frames with
   a grade ring: dashed while the critic version is 0, solid once trained.
   Drift chips show movement against the baseline.
3. **Critic A/B** — split-dailies comparison: **REEL A** vs **REEL B** picks
   over the same run.
4. **Learning strip** — the dailies ledger: full runs carry a **PRINT**
   stamp, re-runs a rotated **↻ RETAKE** stamp, with provenance sentences.

<!-- SCREENSHOT PENDING: director-scoreboard.png — Scoreboard with strips + goldens -->

## 6. Pacing that reads your intent (new in v0.7.11)

Motion is no longer a fixed band stamp. The engine resolves the run's
**dynamics** from context:

- **Info density** — how many story beats you pack per second of your goal
  length. A sparse, long goal → *narrative* pacing (slow moves, long holds).
  A dense, short goal → *kinetic* pacing (fast moves, short holds).
- **Intent** — action words in your idea/style (chase, thriller, escape…)
  raise the energy one level; calm words (quiet, portrait…) lower it.
- **Mood** — the Subtle band stays restrained; a high mood no longer forces
  slow crane moves on everything.

In kinetic runs the motion layer is **staggered** against the camera window,
so the layers shift against each other — the dynamic feel a trailer needs —
instead of moving in lockstep.

## 7. Re-runs and persistence

- **Re-run from any step** (C11): pick the step, run again — the take line
  shows the RETAKE stamp and only the downstream steps re-execute.
- **Everything survives a restart**: your entry draft, look controls, mood,
  scratch edits, every take (`flow.v{N}.json` coexist), the signal ledger,
  and the golden baseline. Reopen the session and the Director is exactly
  where you left it.
- **Seed card**: export the whole film plan as one shareable file.

## 8. Troubleshooting

| Symptom | What it means |
|---|---|
| Amber lamps on critic steps | The critic model is untrained — scores are honest stubs, not failures |
| "still 2 scenes despite target 40s" | Fixed since the content-aware scale resolver — the badge now reflects the consumed scale |
| LLM run fell back to template | The run log records *why*; the template result is always valid |
| A take looks wrong | Diff it against the previous take in Extract, or re-run from the offending step |

---

*Related: [Session Generation & Progress](session-generation.md) ·
[Director technical reference](../director-mode-how-it-works.md)*