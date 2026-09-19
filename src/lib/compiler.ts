// Prompt compiler for VisionMachine composer
// Converts PipePayload to structured prompt string per TAG_SPECIFICATIONS

import type { TagType, TagSpecification, PipeRow } from '$types';
import { TAG_SPECIFICATIONS } from '$types';

/**
 * Compile a PipeRow (pipe) into a structured prompt string
 * Order: global elements first, then segments sorted by frameStart
 */
export function compilePrompt(pipe: PipeRow): string {
  // Defensive: a partial/legacy pipe (missing elements array) must never
  // crash the live preview.
  if (!pipe || !Array.isArray(pipe.elements)) return '';
  const lines: string[] = [];
  
  // Global elements first (new two-layer model)
  for (const el of pipe.elements) {
    if ('tag' in el && el.tag === 'global_style') {
      // prompt is the primary source; value is the legacy fallback.
      const el2 = el as any;
      const text = (el2.prompt ?? el2.value ?? '').trim();
      if (text && el.enabled !== false) {
        lines.push(text);
      }
    } else if ('tag' in el && el.tag === 'sound') {
      const el2 = el as any;
      const text = (el2.prompt ?? '').trim();
      if (text && el.enabled !== false) {
        lines.push(text);
      }
    }
  }
  
  // Segments from timeline element sorted by frame start
  const timeline = pipe.elements.find(e => 'tag' in e && e.tag === 'timeline');
  if (timeline && 'segments' in timeline && timeline.segments) {
    const sorted = [...timeline.segments].sort((a, b) => a.frameStart - b.frameStart);
    for (const seg of sorted) {
      for (const tag of seg.tags) {
        const spec = TAG_SPECIFICATIONS[tag.tag];
        if (spec) {
          const value = tag.prompt || String(tag.value);
          lines.push(constructRule(spec, value));
        }
      }
    }
  }
  
  return lines.join('\n');
}

/**
 * Construct prompt text based on tag specification rules
 */
export function constructRule(spec: TagSpecification, value: string): string {
  switch (spec.constructRule) {
    case 'plain':
      return value;
    case 'json':
      return JSON.stringify({ tag: spec.name.toLowerCase(), value });
    case 'markdown':
      return `- **${spec.name}**: ${value}`;
    case 'xml':
      return `<${spec.name.toLowerCase()}>${value}</${spec.name.toLowerCase()}>`;
    default:
      return value;
  }
}

/**
 * Generate preview text for tools panel
 */
export function getCompilerPreview(pipe: PipeRow): string {
  return compilePrompt(pipe);
}

/**
 * Get all tags in order for a pipe
 */
export function getOrderedTags(pipe: PipeRow): Array<{
  tag: TagType;
  name: string;
  value: string;
  frameStart?: number;
  frameEnd?: number;
}> {
  if (!pipe || !Array.isArray(pipe.elements)) return [];
  const result: any[] = [];
  
  // Add global + sound prompts
  const global = pipe.elements.find(e => 'tag' in e && e.tag === 'global_style') as any;
  if (global && global.enabled !== false) {
    const text = (global.prompt ?? global.value ?? '').trim();
    if (text) {
      result.push({ tag: 'scene' as TagType, name: 'Global', value: text });
    }
  }
  const sound = pipe.elements.find(e => 'tag' in e && e.tag === 'sound') as any;
  if (sound && sound.enabled !== false) {
    const text = (sound.prompt ?? '').trim();
    if (text) {
      result.push({ tag: 'scene' as TagType, name: 'Sound', value: text, frameStart: sound.frameStart, frameEnd: sound.frameEnd });
    }
  }
  
  // Add segments from timeline sorted by frame
  const timeline = pipe.elements.find(e => 'tag' in e && e.tag === 'timeline');
  if (timeline && 'segments' in timeline && timeline.segments) {
    const sorted = [...timeline.segments].sort((a, b) => a.frameStart - b.frameStart);
    for (const seg of sorted) {
      for (const tag of seg.tags) {
        const spec = TAG_SPECIFICATIONS[tag.tag];
        result.push({
          tag: tag.tag,
          name: spec?.name || tag.tag,
          value: tag.prompt || String(tag.value),
          frameStart: tag.frameStart,
          frameEnd: tag.frameEnd,
        });
      }
    }
  }
  
  return result;
}
