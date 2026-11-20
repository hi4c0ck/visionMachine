# Director production-identity batch (D1–D10)

Design-quality batch from the approved inspiration frames F1–F3
(`cache/scratch/director-design-inspo/`, 2026-11-18). Thesis: the Director
mode speaks the physical language of film production — slates, takes,
dailies, cue sheets, contact sheets — instead of generic dashboard chrome.

**View-layer only.** No store, command, or pipe-mechanic changes. Every
item adds chrome or re-skins existing markup; the union of rendered data
text is unchanged (chips are additive, full section text stays). Colors
come from the existing token ladder (`--accent-color`, `--success-color`,
`--warning-color`, `--danger-color`, `--border-color`, `--bg-*`,
`--text-*`, `--tag-*` lanes, `--font-mono`). No new color family, no new
font family (the Courier Prime slugline experiment from F2 is NOT in this
batch — sluglines use `--font-mono`).

Branch: `feat/director-production-identity` off `feat/director-b15-novel-sanize`.
One commit for the batch. No pushes. Desktop build only on request.

## F1 — THE SLATE (Director hot path)

### D1 · Clapper band
`DirectorPanel.svelte` — `.director-root::before`: a 10px diagonal-stripe
band at the very top of the Director frame (all tabs). Stripes =
`--accent-color` over the root bg, `repeating-linear-gradient(-55deg, …)`,
opacity ≈ .8, hairline bottom border. ONE place, never repeated elsewhere.
- Accept: band renders above the tab content on all three tabs; no markup
  change; no layout shift beyond the 10px band.

### D2 · Slate take line
`DirectorHotPath.svelte` — ⑤ STEP CHAIN heading: the plain
`· {doc?.flowVersion}` meta becomes a slate-cell group:
`TAKE {K}` hero numeral (accent, mono, ~18px) · `{total_frames}f · 24fps ·
{runtime}s` (from `engine.verify.total_frames`, runtime = frames/24) ·
`flow.v{K}` doc chip · a rotated `↻ RETAKE {step}` stamp when
`doc.rerunFrom` is set. Pre-run (no doc): heading unchanged (`· —`).
`runDurationLabel` stays. All data from existing `engine`/`doc` props.
- Accept: post-run shows TAKE K + frames/runtime cells; a C11 re-run doc
  shows the RETAKE stamp; pre-run renders exactly as before.

### D3 · Tally lamps
`DirectorHotPath.svelte` — step rows (`.step`) and compact pips
(`.step-pip`): a lamp dot before the step name. `step-ok` → green glow
(`--success-color`), `step-mut` → dim amber (`--warning-color`, the
untrained-stub state), `step-fail` → red (`--danger-color`). The lamp
REPLACES the `border-left` state stripe (same information, new grammar).
- Accept: every step row/pip carries a lamp; state colors map 1:1 to the
  old border colors; no state text changes.

### D4 · Leader ring
`DirectorHotPath.svelte` — while `running`, a 22px film-leader ring in the
⑤ heading: conic-gradient sweep (`--accent-color`), CSS rotation
animation, center numeral optional. Additive; RunLog unchanged.
- Accept: ring appears only while running; disappears on completion;
  `prefers-reduced-motion` disables the spin.

## F2 — THE SCRIPT PAGE (Novel card + Extract)

### D5 · Script-page novel card
`DirectorHotPath.svelte` — `.scene-card`:
- header: title in `--font-mono`, uppercase, letter-spacing .06em
  (slugline grammar); a `REV {doc.flowVersion}` stamp chip right-aligned
  (only when doc exists).
- prose: reading column — line-height 1.7, max-width 68ch.
- beats: the numbered hanging gutter gets a gradient tick under the index
  (`::after`, accent → transparent, same hue family).
- Accept: all existing fields render (id, title, prose, shot count,
  hand-off, beats); two-tier layout preserved; REV chip absent pre-run.

### D6 · Cue-sheet chips
`ExtractTab.svelte` — `.extract-meta` header, additive chips after the
tag-word (full prompt text untouched):
- **dept chip**: tag → `SC`/`CAM`/`LGT`/`MOT`/`TRN`/`FX`
  (scene/camera/lighting/motion/transition/effect), mono 8px, hairline.
- **gel chip** (lighting): parse `/(\d{3,4})\s*K/` from the section text →
  `4500K` chip with a monochrome luminance dot (≤3500K bright, ≤5000K mid,
  else dim). No new hue — luminance encodes temperature.
- **lens chip** (camera): parse `/(\d{2,3})\s*mm/` → `35mm` accent chip.
- **motion vector** (motion): leading verb push/pull/pan/tilt/hold/drift →
  glyph `→ ← ↔ ↕ ■ ~` + speed word (slow/med/fast) as a tick label.
- Pure helper fns in the component script; applied to BOTH the
  localExtract path and the legacy `sections` path (same class of row).
- Accept: chips appear only when the pattern matches; a section with no
  match renders exactly as before; prompt/source text byte-unchanged.

## F3 — THE CONTACT SHEET (Scoreboard)

### D7 · Exposure strips
`ScoreboardTab.svelte` — Q1 `.bar`: 10% tick marks
(repeating-linear-gradient hairlines). `.bar-fill` gets
`class:stub={doc.criticModel?.untrained}`: stub → dashed right edge +
desaturated fill; trained → solid edge. The bar's grammar carries the
honesty rule; the B11 hint stays.
- Accept: untrained doc shows dashed edges on every bar; a trained
  criticModel flips them solid; widths/scores unchanged.

### D8 · Dailies stamps
`ScoreboardTab.svelte` — Q2 ledger: the B12 `↻ {step}` chip re-skins as a
rotated rubber stamp (rotate(-2deg), 1.5px border, accent). Full runs
(`!f.rerunFrom`) get an additive `PRINT` stamp (success family). Titles
(provenance sentences) preserved.
- Accept: re-run rows show ↻ RETAKE-style stamps, full runs show PRINT;
  no field dropped; compare picker + annotation buttons untouched.

### D9 · Contact-sheet goldens
`ScoreboardTab.svelte` — `.golden-row` → film-frame grammar: sprocket
strips top/bottom (CSS repeating-gradient holes), the base score wrapped
in a grade ring — dashed while `g.criticModelVersion === 0`, solid once
trained. All fields stay (v, base, src, critic, drift).
- Accept: rows read as sprocketed frames; ring dash state tracks the
  critic version; drift chip unchanged.

### D10 · Split-dailies A/B
`ScoreboardTab.svelte` — `.ab-row`: `head A`/`head B` labels re-skin as
`REEL A`/`REEL B` (mono, letter-spaced); each pick gets a small gradient
filmstrip decoration (CSS, accent family). Selects stay live, DIFF stays
disabled with its B13 note.
- Accept: labels read REEL A/B; selects populated exactly as before;
  diff button state + note unchanged.

## Gates (in order)
1. `npx svelte-check` — 0 errors (pre-existing warnings expected).
2. `npm test -- --run` — full vitest suite green.
3. `npm run build` — vite build ok.
No Rust changes → cargo suite unaffected (397 at branch point).

## Landing
One commit: `feat(director): D1-D10 production identity — slate, script
page, cue sheet, contact sheet`. Report the exact hash + gate counts.