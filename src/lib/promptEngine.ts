// Prompt engine (domain) — compiles a pipe's global elements + timeline
// segments into the single final prompt string used by the generation request
// ({ prompt: "..." }). Pure and unit-testable; no UI coupling.
//
// Output layout (nested, properly closed):
//   <global_style>…</global_style>   — pipe-scope top-level element (as-is)
//   <audio>…</audio>                 — pipe-scope top-level element (as-is)
//   <timeline>                        — chronological container (Method 1 of
//     the Agnes Video parser, lcy362/agnes-video-generator): each <segments>
//     inside is a sequential block, offsets computed by the parser.
//   <segments length="{N}{u}">       — one per zone, in frame order; each tag
//     inside is a closed XML pair <tagname>…</tagname>, content =
//     tag.prompt ?? String(tag.value), prefixed by its relative position cues.
//
// Note: the <timeline> node carries NO fps attribute (overhead) — the session
// fps is inherited by the caller (opts.fps) and used only for seconds math
// (length units + position cues). The length attribute unit is settings-driven
// ('frames' → `121f`, 'seconds' → `5s`).
//
// Method 2 (NOT implemented — note for the follow-up):
//   <segments range="0s-5s">…</segments>
//   <segments range="5s-10s">…</segments>
//   Fixed absolute windows; each segment's start MUST equal the previous
//   segment's end (Math Gap Rule, no overlap, boundary frame carries motion
//   continuity across the cut).
//
// Segment inners (descriptor lines, continuity cues, etc.) are injected by the
// heuristic pass — see `segmentInnerHeuristics`. Currently a no-op slot: rules
// arrive as follow-ups.

import type { PipeRow, Segment, TagType } from '$types';
import { TAG_SPECIFICATIONS } from '$types';
import { getSettings } from '$lib/settings/store';

/** Segment `length` attribute unit — the settings-driven toggle. */
export type SegmentLengthUnit = 'frames' | 'seconds';

/** Section element name for a tag type (lowercase spec name, e.g. "camera"). */
export function sectionName(tag: TagType): string {
  return TAG_SPECIFICATIONS[tag]?.name.toLowerCase() ?? tag;
}

/**
 * One heuristic rule that contributes inner content to a single segment's
 * `<segments>` body. Independent rules — each contributes its own line(s);
 * no precedence/override (model a). Ordered: later rules append after
 * earlier ones. Returns lines (an empty array = contributes nothing).
 *
 * Inputs are strictly pipe-local: the segment, its ordinal position, the
 * pipe's fps (for seconds hints), and the sibling segments for context.
 */
export type SegmentInnerHeuristic = (
  input: {
    segment: Segment;
    segmentIndex: number;
    totalSegments: number;
    fps: number;
  },
) => string[];

/**
 * The heuristic pass. Currently EMPTY — this is the slot your injected rules
 * plug into. Each rule is independent (model a): it appends its own lines,
 * it never rewrites or suppresses another rule's output. To add a rule,
 * append it to this array (order = emission order).
 */
export const segmentInnerHeuristics: SegmentInnerHeuristic[] = [];

/**
 * Collect every segment of the pipe's timeline element, frame-sorted.
 * Defensive: partial/legacy pipe data must never crash prompt building.
 */
export function getSortedZones(pipe: PipeRow): Array<{ zoneIndex: number; frameStart: number; frameEnd: number; tags: Array<any> }> {
  if (!pipe || !Array.isArray(pipe.elements)) return [];
  const timeline = pipe.elements.find((e) => 'tag' in e && e.tag === 'timeline');
  if (!timeline || !('segments' in timeline)) return [];
  const zones = [...(timeline as { segments: any[] }).segments].sort((a, b) => a.frameStart - b.frameStart);
  return zones.map((zone, i) => ({
    zoneIndex: i + 1,
    frameStart: zone.frameStart,
    frameEnd: zone.frameEnd,
    tags: [...(zone.tags ?? [])].sort((a, b) => a.frameStart - b.frameStart),
  }));
}

/** Format the `length` attribute value per the chosen unit. */
function formatLength(segment: Segment, unit: SegmentLengthUnit, fps: number): string {
  const frames = Math.max(0, (segment.frameEnd ?? 0) - (segment.frameStart ?? 0));
  if (unit === 'seconds') {
    const secs = fps > 0 ? frames / fps : frames;
    // Strip trailing zero: 5.0 → "5", 3.33 → "3.3" — human-friendly.
    const rounded = Math.round(secs * 100) / 100;
    return `${String(rounded)}s`;
  }
  return `${frames}f`;
}

/**
 * Relative-time position heuristic (per tag, nested in its zone).
 * Compares the tag's frame range to its zone's range and emits cues bound
 * to that tag, in seconds (fps-converted):
 *   - tag starts later than the zone  → "after {Δ}s"      (Δ = (tagStart − segStart)/fps)
 *   - tag ends before the zone end    → "for {Δ}s along"  (Δ = (segEnd − tagEnd)/fps)
 * Both cues may apply to one tag. A tag spanning exactly the zone → no cue.
 */
export function tagPositionCues(
  tag: { frameStart?: number; frameEnd?: number },
  segment: { frameStart?: number; frameEnd?: number },
  fps: number,
): string[] {
  const cues: string[] = [];
  const tStart = tag.frameStart ?? 0;
  const tEnd = tag.frameEnd ?? 0;
  const sStart = segment.frameStart ?? 0;
  const sEnd = segment.frameEnd ?? 0;
  const safeFps = fps > 0 ? fps : 24;

  if (tStart > sStart) {
    const secs = roundSeconds((tStart - sStart) / safeFps);
    cues.push(`after ${secs}s`);
  }
  if (tEnd < sEnd) {
    const secs = roundSeconds((sEnd - tEnd) / safeFps);
    cues.push(`for ${secs}s along`);
  }
  return cues;
}

/** Round seconds to 2 dp and strip trailing zeros (3.0 → 3, 1.5 → 1.5). */
function roundSeconds(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Render a single segment's tags as closed XML pairs. Uniform rule:
 * every tag becomes `<{lowercase-name}>content</{lowercase-name}>`,
 * followed by its tag-relative position cues (from `tagPositionCues`).
 * Unknown/undeclared tag types are skipped (kept out of the prompt).
 */
function renderSegmentTags(segment: Segment, fps: number): string[] {
  const lines: string[] = [];
  for (const tag of segment.tags ?? []) {
    const spec = TAG_SPECIFICATIONS[tag.tag as TagType];
    if (!spec) continue;
    const content = tag.prompt?.trim() ? tag.prompt : String(tag.value);
    const name = sectionName(tag.tag as TagType);
    // Position cues prefix the tag's own content, inside the same closed pair:
    //   <camera>after 1.5s - 30</camera>
    //   <scene>after 2s - Mountain approach</scene>
    const cues = tagPositionCues(tag, segment, fps);
    const body = cues.length > 0 ? `${cues.join(', ')} - ${content}` : content;
    lines.push(`<${name}>${body}</${name}>`);
  }
  return lines;
}

/**
 * Compile a PipeRow into its final prompt string:
 *   1. top-level `<global_style>` / `<audio>` elements (when enabled + non-empty)
 *   2. a single `<timeline fps>` container (Method 1) holding one
 *      `<segments length="…">` block per segment, in frame order; each block
 *      holds its tags as closed XML pairs + heuristic inner lines.
 */
export function summarizePipe(pipe: PipeRow, opts?: { unit?: SegmentLengthUnit; fps?: number }): string {
  // Defensive: a missing/partial pipe yields the empty marker.
  if (!pipe || !Array.isArray(pipe.elements)) return '<heuristics>empty</heuristics>';

  const unit: SegmentLengthUnit = opts?.unit ?? getSettings().generationDefaults.segmentLengthUnit;
  const fps = opts?.fps ?? getSettings().generationDefaults.fps;
  const parts: string[] = [];

  // 1. Top-level pipe-scope elements, emitted as-is in a fixed order.
  for (const el of pipe.elements) {
    if ('tag' in el && el.tag === 'global_style') {
      const e = el as { prompt?: string; value?: string; enabled?: boolean };
      const text = (e.prompt ?? e.value ?? '').trim();
      if (text && e.enabled !== false) parts.push(`<global_style>${text}</global_style>`);
    } else if ('tag' in el && el.tag === 'sound') {
      const e = el as { prompt?: string; enabled?: boolean };
      const text = (e.prompt ?? '').trim();
      if (text && e.enabled !== false) parts.push(`<audio>${text}</audio>`);
    }
  }

  // 2. Chronological stack (Method 1): all <segments> nested in a <timeline>
  //    container — the parser computes the sequential offsets from each
  //    block's length (no explicit ranges, no fps attribute on the node).
  const zones = getSortedZones(pipe);
  if (zones.length > 0) {
    const blocks: string[] = [];
    zones.forEach((zone, i) => {
      const seg = zone as unknown as Segment;
      const body: string[] = [...renderSegmentTags(seg, fps)];
      // Heuristic inner lines (currently none — the slot for your injected rules).
      for (const rule of segmentInnerHeuristics) {
        body.push(...rule({ segment: seg, segmentIndex: i, totalSegments: zones.length, fps }));
      }
      const len = formatLength(seg, unit, fps);
      blocks.push(`<segments length="${len}">\n${body.join('\n')}\n</segments>`);
    });
    parts.push(`<timeline>\n${blocks.join('\n')}\n</timeline>`);
  }

  return parts.length > 0 ? parts.join('\n') : '<heuristics>empty</heuristics>';
}
