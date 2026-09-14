// Prompt engine (domain) — summarizes a pipe's zones and their tags into the
// single final prompt string used by the generation request ({ prompt: "..." }).
// Pure and unit-testable; no UI coupling.
//
// Output layout:
//   <heuristics> — simple pre-summary block (style, scenes, zones, keyframes, subjects)
//   <tag frames="s-e" zone="n">content</tag> — one section per tag (repeated
//   tag types allowed), content rendered per TAG_SPECIFICATIONS.constructRule.

import type { PipeRow, TagType } from '$types';
import { TAG_SPECIFICATIONS } from '$types';
import { constructRule } from '$lib/compiler';

/** Section element name for a tag type (lowercase spec name, e.g. "camera"). */
export function sectionName(tag: TagType): string {
  return TAG_SPECIFICATIONS[tag]?.name.toLowerCase() ?? tag;
}

/** Collect every zone (segment) of the pipe's timeline element, frame-sorted. */
export function getSortedZones(pipe: PipeRow): Array<{ zoneIndex: number; frameStart: number; frameEnd: number; tags: Array<any> }> {
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

/** The simple summarize flow for the pre-heuristics block. */
export function buildHeuristics(pipe: PipeRow): string {
  const lines: string[] = [];

  const global = pipe.elements.find((e) => 'tag' in e && e.tag === 'global_style') as any;
  if (global && global.enabled !== false && global.value && global.value.trim()) {
    lines.push(`style: ${global.value.trim()}`);
  }

  const scenes: string[] = [];
  for (const zone of getSortedZones(pipe)) {
    for (const tag of zone.tags) {
      if (tag.tag === 'scene' && tag.prompt?.trim()) scenes.push(tag.prompt.trim());
    }
  }
  if (scenes.length > 0) lines.push(`scenes: ${scenes.join('; ')}`);

  const zones = getSortedZones(pipe);
  if (zones.length > 0) {
    const ranges = zones.map((z) => `f${z.frameStart}–f${z.frameEnd}`).join(' · ');
    lines.push(`zones: ${zones.length} (${ranges})`);
  }

  if (pipe.keyframes.length > 0) {
    const kfs = [...pipe.keyframes]
      .sort((a, b) => a.frame - b.frame)
      .map((k) => `k${k.slotIndex}@f${k.frame}(${k.type})`)
      .join(' · ');
    lines.push(`keyframes: ${kfs}`);
  }

  if ((pipe.subjectReferences ?? []).length > 0) {
    const types = (pipe.subjectReferences ?? []).map((s) => s.type ?? 'url').join(', ');
    lines.push(`subjects: ${(pipe.subjectReferences ?? []).length} (${types})`);
  }

  return lines.join('\n');
}

/**
 * Summarize a pipe into its final prompt string:
 * `<heuristics>` block + one `<..>` section per tag.
 */
export function summarizePipe(pipe: PipeRow): string {
  const parts: string[] = [];

  const heuristics = buildHeuristics(pipe);
  parts.push(
    heuristics
      ? `<heuristics>\n${heuristics}\n</heuristics>`
      : '<heuristics>empty</heuristics>',
  );

  for (const zone of getSortedZones(pipe)) {
    for (const tag of zone.tags) {
      const spec = TAG_SPECIFICATIONS[tag.tag as TagType];
      if (!spec) continue;
      const content = tag.prompt?.trim() ? tag.prompt : String(tag.value);
      const name = sectionName(tag.tag as TagType);
      parts.push(
        `<${name} frames="${tag.frameStart}-${tag.frameEnd}" zone="${zone.zoneIndex}">${constructRule(spec, content)}</${name}>`,
      );
    }
  }

  return parts.join('\n');
}
