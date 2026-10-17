# VisionMachine — Visual Language Template Lab

> Development-only exploration. **Do not** merge into the production startup path.
> This document ships with the `src/design-lab/` gallery so a reviewer can read the
> rationale next to the rendered output.

## 1. Purpose

Explore and compare three radically cleaner visual languages for VisionMachine
without changing features, underlying behavior, data, or the color palette.
The goal is to eliminate the dated desktop appearance produced by:

- rounded containers around every section,
- card-inside-card nesting,
- heavy separators / bars as generic section dividers,
- chunky pill-shaped timeline elements,
- controls that read as individually assembled widgets.

The target is a modern, breathable, coherent creative workspace: **less
interface chrome, more workspace**.

The three templates are rendered from **one shared fixture** and **one shared
DOM** (`DesignFrame.svelte`). All differences are pure visual grammar, applied
by CSS scoped under `[data-template="a|b|c"]`:

| Layer | File | Responsibility |
|---|---|---|
| Structural skeleton + coordinate invariant | `design-lab.css` | app layout, zero-padding timeline coordinate canvas, media wrappers |
| Template A grammar | `template-a.css` | Open Canvas |
| Template B grammar | `template-b.css` | Editorial Workspace |
| Template C grammar | `template-c.css` | Precision Instrument |
| Shared fixture | `fixture.ts` | deterministic session/pipe/keyframes/timeline state |
| Gallery shell + switcher | `DesignLab.svelte` | fixed-viewport stage, switcher, compare mode |

**Shared palette.** Every template paints from the existing design-system
variables (`--bg-*`, `--accent`, `--tag-*`, `--border`…). No template
introduces a new accent color, gradient, shadow, or effect to win the
comparison.

**Color-variable inconsistencies found during inspection (documented, not fixed):**
- `--panel-left-bg` / `--panel-center-bg` / `--panel-right-bg` are sketch-coded
  rgba tints (yellow/red/pink at ~5–6% opacity) that leak colored backgrounds
  into the three workspace columns. These contribute to the "assembled
  widgets" feel. The gallery neutralizes them by painting nav/composer/
  inspector from `--bg-secondary`/`--bg-tertiary`.
- `--surface-color` aliases `--bg-tertiary`, so a "raised" surface and a
  "tertiary" background are the same value — there is no real elevation step
  between raised regions and the canvas.
- `--font-mono` is referenced but never defined in `design-system.css`, so
  `var(--font-mono, monospace)` silently falls back to the browser default.
  The gallery defines `--dl-font-mono` explicitly; promoting a defined
  `--font-mono` is a good first migration step.

## 2. Templates

### A — Open Canvas (preferred baseline)

**Concept.** An uninterrupted creative workspace. Hierarchy is established
through alignment, whitespace, typography, and restrained tonal difference —
not repeated boxes.

- **Structure.** Preserve the high-level composition (navigation, preview,
  composer, inspector). Remove unnecessary rounded outer containers around
  regions; use a continuous workspace surface; subtle vertical hairlines only
  where adjacent regions need a boundary.
- **Containers/surfaces.** No card around every section; no nested cards
  around thumbnails/rows. Outlines kept only for genuinely discrete objects,
  focused inputs, selection, dialogs, floating menus. Remove redundant child
  backgrounds when the parent already provides the surface.
- **Geometry.** Square region geometry; one small-radius convention for
  controls; ordinary timeline spans nearly rectangular (small radius only
  where it aids legibility); no pill shapes on long-duration spans.
- **Typography.** Natural capitalization; no decorative uppercase; weight +
  spacing distinguish sections/labels/metadata; monospace reserved for
  timecodes, frame numbers, seeds.
- **Keyframes.** Thumbnails sit directly on the canvas (no outer frame /
  nested surface); selection is a precise 1px outline; empty slots are
  actionable but quiet.
- **Timeline.** Fine-grained, subordinate ruler; reduced outlines around
  tracks/regions; compact well-defined spans; zones vs tags distinguished by
  hierarchy + geometry; subtle fills, clear labels, precise selection edges;
  playhead easy to locate without excessive weight.
- **Inspector.** Compact aligned groups on a continuous surface; whitespace
  + occasional hairline rules; no per-control cards; quiet secondary metadata;
  consistent input geometry.
- **Impression.** Calm, open, premium, contemporary, visually effortless.

### B — Editorial Workspace

**Concept.** A design-led workspace inspired by editorial layouts and modern
graphic systems. Uses whitespace, typographic hierarchy, and precise alignment
more assertively than A.

- **Structure.** Clear typographic hierarchy across navigation, section
  headers, selected-object heading, and technical metadata. Generous spacing
  between major regions; tighter spacing within related control groups.
  Preview + keyframe imagery dominate; alignment across preview/timeline/
  inspector forms one coherent grid. No uniform collection of equally-weighted
  rectangles.
- **Geometry/surfaces.** Mostly flat surfaces, sparse separators; rectangular
  media framing; simple selection outlines; restrained input borders; raised
  surfaces reserved for menus/transient overlays.
- **Typography.** Important headings gain presence through size + weight, not
  uppercase; secondary metadata deliberately quiet; readable timeline text;
  technical type reserved for timing/numeric values; no excessive vertical
  height or decoration.
- **Timeline.** Labels scanned by consistent placement + clear alignment;
  major zones vs individual instructions distinguished by scale, spacing, line
  weight; minimal ruler noise; long spans communicate duration through
  geometry, not heavy color.
- **Impression.** Editorial, spacious, modern, intentionally composed,
  expressive through layout rather than decoration.

### C — Precision Instrument

**Concept.** A highly controlled creative instrument in the spirit of
professional production equipment / technical editors. More compact than the
others, but **not** the old-fashioned boxed-control aesthetic.

- **Structure.** Keep the existing regions and information density. A
  disciplined grid + precise alignment; functional relationships shown via
  indentation, shared baselines, consistent labels. More visible separators
  than A, fewer than the current design. Prioritize compact controls, technical
  readability, precise temporal relationships.
- **Geometry/surfaces.** Rectangular timeline spans, precise alignment marks,
  restrained boundaries; minimal rounded containers; consistent thin borders
  for editable controls + active selection; no decorative machining, faux-metal
  surfaces, excessive shadows, or simulated hardware.
- **Typography/measurement.** Compact but comfortably readable labels;
  monospace for timing, frame positions, numeric outputs; time divisions and
  temporal relationships easy to inspect; technical density organized, not
  indiscriminately compressed.
- **Timeline.** Stronger ruler measurement structure than A; precise, minimal
  ticks; resize handles visible on hover/during interaction; crisp
  selected-vs-unselected; readable when many tags share a zone.
- **Impression.** Precise, powerful, engineered, compact, professional.

## 3. Common constraints (all templates)

- **No palette change.** Same design-system variables across all three.
- **Avoid:** rounded card per region; card-in-card nesting; heavy horizontal
  bars as section separators; excessive uppercase; oversized section headers
  in dense areas; oversized routine-action buttons; decorative shadows on
  ordinary elements; blur/glass/glow; decorative gradients as hierarchy;
  unnecessary icons/badges/ornaments; per-component ad-hoc corner radii.
- **Preserve functional clarity:** interactive controls still look
  interactive; selection is identifiable; keyboard focus is visible; disabled
  elements are distinguishable; error/warning/loading/success states stay
  clear; drag handles are discoverable; text keeps adequate contrast; theme
  support keeps working.
- **No behavior change:** application data, generation logic, and timeline
  coordinate math are untouched. The frame→pixel invariant (frame 0 → 0px,
  frame N-1 → width, zero-left-padding lanes) is re-implemented verbatim via
  the real `frameGeometry` module so the gallery can't drift from the app.

## 4. Responsive composition

Primary evaluation viewport is **1440 × 900**. Also tested at **1280 × 800**
and a narrower **1120 × 700** via the gallery's viewport switcher.

- At 1440×900, all critical controls and the principal composer content are
  visible without unnecessary scrolling.
- At smaller widths: preview + composer stay primary; secondary side regions
  (nav, inspector) contract; timeline labels avoid wrapping that would obscure
  temporal relationships; interactive targets never shrink below accessible
  sizes; deliberate scroll/collapse is preferred over uniform compression.
- No template may fall back to card-based layout to "solve" responsiveness.

The gallery renders the stage at a fixed pixel box and lets columns scroll
internally (nav/inspector `overflow-y: auto`), which is the deliberate
contract: the composer is the fixed-width primary workspace; the columns are
the ones that give ground.

## 5. Mapping experimental styling → current components & CSS

| Gallery construct | Production source | What the migration touches |
|---|---|---|
| `.dl-frame` (top strip, media, controls) | `Frame.svelte` | strip height, media framing, control chip treatment |
| `.dl-nav` (project/session/profile) | `ProjectsPanel.svelte` + `ProfilePanel.svelte` | panel padding, item geometry, separators |
| `.dl-pipe` (pipe card + header + ops) | `ComposerPanel.svelte` (`.pipe`, `.pipe-header`), `PipeHeader.svelte` | card radius/border, active emphasis |
| `.dl-row-keyframes` / `.dl-row-subjects` chips | `ComposerRows/KeyframesRow.svelte`, `SubjectRefsRow.svelte` + `composer-row.css` | chip card vs float-on-canvas, header case |
| `.dl-timeline` (ruler, global/sound lanes, zone lane, tag lanes, grips) | `ComposerTimeline/TimelineSection.svelte` + `composer-timeline.css` + `FrameRuler.svelte` | span radius/fill, tick density, grip reveal, lane padding (must stay zero for the coordinate invariant) |
| `.dl-inspector` (preview, settings, focus, stats) | `ToolsPanel.svelte` | section card vs hairline groups, stat cells, input geometry |
| column borders / backgrounds | `Workspace.svelte` `.left-column`, `.composer-area` + `design-system.css` panel vars | neutralize sketch-coded panel tints, hairline separators |
| global variables | `css/design-system.css` | define `--font-mono`, add an elevation token, align `--surface-color` |

**Refactor order (lowest-risk first):**
1. `design-system.css` — define `--font-mono`, add `--surface-raised`, and
   introduce a `--radius-*` scale. Pure additive; no layout impact.
2. `Workspace.svelte` — replace the sketch-coded `--panel-*-bg` column
   backgrounds with neutral surfaces; convert column borders to hairlines.
3. `composer-row.css` + `KeyframesRow` / `SubjectRefsRow` — stop the chip card
   frames; let thumbnails float on the pipe surface; natural-case headers.
4. `ComposerPanel.svelte` `.pipe` — remove the rounded card + 2px glow active
   ring; use the template's selection treatment.
5. `composer-timeline.css` — the largest surface: square the spans, quiet the
   ruler, make grips precise marks, keep zero-left-padding lanes (the
   invariant). This is the file that most strongly encodes the "dated" feel.
6. `ToolsPanel.svelte` — collapse the per-section cards into hairline groups;
   quiet the stat cells; consistent input geometry.
7. `Frame.svelte` — media framing + control chip polish.

## 6. Evaluation (1–5, against the brief's criteria)

Scores reflect the underlying visual grammar, not a color preference.

| # | Criterion | A Open Canvas | B Editorial | C Precision |
|---|---|---|---|---|
| 1 | Visual coherence (one environment, not components) | **5** | 4 | 4 |
| 2 | Breathing room (whitespace without waste) | **5** | 4 | 3 |
| 3 | Information hierarchy (primary / metadata / secondary) | 4 | **5** | 4 |
| 4 | Timeline legibility (zones, tags, selection, playhead) | 4 | 4 | **5** |
| 5 | Content emphasis (imagery over chrome) | 4 | **5** | 3 |
| 6 | Control clarity (recognizable without tooltips) | **5** | 4 | 4 |
| 7 | Professional finish (contemporary, not reskinned legacy) | **5** | 4 | 4 |
| 8 | Information density (a complex shot stays efficient) | 4 | 3 | **5** |
| 9 | Consistency (systematic geometry/spacing/treatment) | **5** | 4 | **5** |
| 10 | Implementation feasibility (no core rewrite) | **5** | 4 | 4 |
| | **Total (max 50)** | **45** | **42** | **43** |

### Recommendation

**Carry forward Template A — Open Canvas.**

Reasons, weighted by the brief's priorities (coherence, readability,
density, implementation cost):

- **Coherence + finish.** A is the only template that reads as *one*
  environment rather than a set of components: a continuous surface, one
  radius convention, hairline-only separators, weight-driven type. That is
  exactly the brief's "one thoughtfully composed instrument" target.
- **Readability.** The subordinate fine ruler + quiet 1px playhead +
  compact rectangular spans make zones/tags/selection/playhead
  immediately distinguishable, which is the central readability requirement.
- **Content emphasis.** Letting keyframe thumbnails float on the canvas puts
  the generated imagery — the actual product value — in front of the chrome.
- **Density.** A keeps full information density (nothing is hidden) while
  losing the card clutter; it is more efficient than B's generous spacing for
  a complex shot.
- **Implementation cost.** A's grammar maps to the fewest destructive edits
  (additive token additions, removing card frames, quieting the ruler), so it
  can be introduced without rewriting `frameGeometry`, `dragMath`, the store,
  or generation logic — the highest feasibility score.

**B is the strongest alternative** where imagery dominance and an
expressive, composed grid are the priority; it is the natural "step up" if A
feels too restrained. **C is the right call** if the user base needs the
densest, most technical readout (stronger ruler, organized density) — but it
is the one closest to re-approaching the legacy boxed aesthetic if overdone,
so adopt it selectively (borrow C's ruler + grip treatment) rather than
wholesale.

Suggested path: land A as the new baseline, then cherry-pick C's ruler
measurement structure and B's type scale into it.

## 7. Isolation & safety notes

- The gallery is reachable **only** in a dev build via `#/design-lab`
  (`import.meta.env.DEV` gate in `App.svelte`), so production startup is
  unchanged and no experimental template setting is persisted to user projects.
- The fixture is deterministic and DB-independent (`fixture.ts`); no
  generation or persistence logic is duplicated or mocked as functional.
- No new runtime dependencies were added.
- The frame→pixel coordinate invariant is preserved: timeline placement uses
  the real `createFrameGeometry` / `frameToPx` / `rangeWidthPx` from
  `$lib/frameGeometry` against one shared zero-padding coordinate element.
