// Prompt compiler for VisionMachine composer
// Converts PipePayload to structured prompt string per TAG_SPECIFICATIONS

import type { TagType, TagSpecification, PipeRow } from '$types';
import { TAG_SPECIFICATIONS } from '$types';

/**
 * Compile a PipeRow (pipe) into a structured prompt string
 * Order: global elements first, then segments sorted by frameStart
 */
export function compilePrompt(pipe: PipeRow): string {
  const lines: string[] = [];
  
  // Global elements first (new two-layer model)
  for (const el of pipe.elements) {
    if ('tag' in el && el.tag === 'global_style') {
      if (el.enabled !== false && el.value.trim()) {
        lines.push(el.value);
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
  const result: any[] = [];
  
  // Add global prompt
  const global = pipe.elements.find(e => 'tag' in e && e.tag === 'global_style');
  if (global && 'value' in global && global.value) {
    result.push({
      tag: 'scene' as TagType,
      name: 'Global',
      value: global.value,
    });
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
