/**
 * Unit tests for promptEngine.ts — the final prompt string for generation.
 */
import { describe, it, expect } from 'vitest';
import {
  summarizePipe,
  buildHeuristics,
  getSortedZones,
  sectionName,
} from '../../src/lib/promptEngine';
import type { PipeRow, GlobalElement, TimelineElement, Segment, TagElement } from '../../src/types/app';

function makeTag(tag: TagElement['tag'], frameStart: number, frameEnd: number, extra?: Partial<TagElement>): TagElement {
  return {
    id: `tag-${frameStart}-${tag}`,
    tag,
    frameStart,
    frameEnd,
    value: 0,
    spec: undefined as any,
    ...extra,
  };
}

function makePipe(overrides: Partial<PipeRow> = {}): PipeRow {
  return {
    id: 'pipe1',
    name: 'Test Pipe',
    lengthFrames: 121,
    qValue: 18,
    cValue: 7,
    keyframes: [],
    subjectReferences: [],
    elements: [],
    orderIndex: 0,
    ...overrides,
  };
}

describe('promptEngine.sectionName', () => {
  it('maps tag types to lowercase section names', () => {
    expect(sectionName('scene')).toBe('scene');
    expect(sectionName('camera')).toBe('camera');
    expect(sectionName('transition')).toBe('transition');
  });
});

describe('promptEngine guards (broken pipe data)', () => {
  it('returns [] for a missing pipe in getSortedZones', () => {
    expect(getSortedZones(undefined as unknown as PipeRow)).toEqual([]);
  });

  it('returns empty heuristics for a missing pipe', () => {
    expect(buildHeuristics(undefined as unknown as PipeRow)).toBe('');
  });

  it('summarizes a missing pipe as the empty heuristics marker', () => {
    expect(summarizePipe(undefined as unknown as PipeRow)).toBe('<heuristics>empty</heuristics>');
  });
});

describe('promptEngine.getSortedZones', () => {
  it('returns zones sorted by frameStart with 1-based zone index', () => {
    const z1: Segment = { id: 'z1', frameStart: 72, frameEnd: 121, tags: [] };
    const z2: Segment = { id: 'z2', frameStart: 0, frameEnd: 72, tags: [] };
    const timeline: TimelineElement = { id: 't1', tag: 'timeline', segments: [z1, z2] };
    const pipe = makePipe({ elements: [timeline as any] });

    const zones = getSortedZones(pipe);
    expect(zones.map((z) => [z.zoneIndex, z.frameStart, z.frameEnd])).toEqual([
      [1, 0, 72],
      [2, 72, 121],
    ]);
  });

  it('returns empty for a pipe without a timeline element', () => {
    expect(getSortedZones(makePipe())).toEqual([]);
  });
});

describe('promptEngine.buildHeuristics', () => {
  it('builds the pre-summary lines from pipe content', () => {
    const global: GlobalElement = { id: 'g1', tag: 'global_style', value: 'cinematic style', enabled: true };
    const z1: Segment = {
      id: 'z1',
      frameStart: 0,
      frameEnd: 72,
      tags: [
        makeTag('scene', 0, 72, { prompt: 'Mountain approach' }),
        makeTag('camera', 0, 72, { value: 30 }),
      ],
    };
    const timeline: TimelineElement = { id: 't1', tag: 'timeline', segments: [z1] };
    const pipe = makePipe({
      elements: [global as any, timeline as any],
      keyframes: [
        { id: 'k1', frame: 0, slotIndex: 1, type: 'url', imageSrc: 'a.png', status: 'pending' },
        { id: 'k2', frame: 40, slotIndex: 2, type: 'txt2img', prompt: 'close-up', status: 'pending' },
      ],
      subjectReferences: [
        { id: 's1', imageUrl: 'x.png', useFrames: false, visible: true, type: 'url' },
        { id: 's2', imageUrl: '', useFrames: false, visible: true, type: 'txt2img', prompt: 'hero' },
      ],
    });

    const h = buildHeuristics(pipe);
    expect(h).toContain('style: cinematic style');
    expect(h).toContain('scenes: Mountain approach');
    expect(h).toContain('zones: 1 (f0–f72)');
    expect(h).toContain('keyframes: k1@f0(url) · k2@f40(txt2img)');
    expect(h).toContain('subjects: 2 (url, txt2img)');
  });

  it('defaults legacy subjects without a type to url', () => {
    const pipe = makePipe({
      subjectReferences: [{ id: 's1', imageUrl: 'x.png', useFrames: false, visible: true }],
    });
    expect(buildHeuristics(pipe)).toContain('subjects: 1 (url)');
  });

  it('returns an empty string when nothing is set', () => {
    expect(buildHeuristics(makePipe())).toBe('');
  });
});

describe('promptEngine.summarizePipe', () => {
  it('wraps heuristics in a <heuristics> block and emits one section per tag', () => {
    const z1: Segment = {
      id: 'z1',
      frameStart: 0,
      frameEnd: 72,
      tags: [
        makeTag('scene', 0, 72, { prompt: 'Mountain approach' }),
        makeTag('camera', 0, 72, { value: 30 }),
        makeTag('effect', 40, 72, { prompt: 'lens flare' }),
      ],
    };
    const timeline: TimelineElement = { id: 't1', tag: 'timeline', segments: [z1] };
    const pipe = makePipe({ elements: [timeline as any] });

    const out = summarizePipe(pipe);
    expect(out).toContain('<heuristics>');
    expect(out).toContain('</heuristics>');
    expect(out).toContain('<scene frames="0-72" zone="1">Mountain approach</scene>');
    // camera uses the json constructRule
    expect(out).toContain('<camera frames="0-72" zone="1">{"tag":"camera","value":"30"}</camera>');
    // effect uses the markdown constructRule
    expect(out).toContain('<effect frames="40-72" zone="1">- **Effect**: lens flare</effect>');
  });

  it('allows repeated same-type tags as repeated sections', () => {
    const z1: Segment = {
      id: 'z1',
      frameStart: 0,
      frameEnd: 72,
      tags: [
        makeTag('scene', 0, 32, { prompt: 'first scene' }),
        makeTag('scene', 40, 72, { prompt: 'second scene' }),
      ],
    };
    const timeline: TimelineElement = { id: 't1', tag: 'timeline', segments: [z1] };
    const pipe = makePipe({ elements: [timeline as any] });

    const out = summarizePipe(pipe);
    const matches = out.match(/<scene [^>]*>/g);
    expect(matches).toHaveLength(2);
    expect(out).toContain('<scene frames="0-32" zone="1">first scene</scene>');
    expect(out).toContain('<scene frames="40-72" zone="1">second scene</scene>');
  });

  it('emits an empty heuristics marker for a bare pipe and no tag sections', () => {
    const out = summarizePipe(makePipe());
    expect(out).toBe('<heuristics>empty</heuristics>');
  });

  it('numbers zones in frame order regardless of segment order', () => {
    const za: Segment = { id: 'za', frameStart: 72, frameEnd: 121, tags: [makeTag('scene', 72, 121, { prompt: 'B' })] };
    const zb: Segment = { id: 'zb', frameStart: 0, frameEnd: 72, tags: [makeTag('scene', 0, 72, { prompt: 'A' })] };
    const timeline: TimelineElement = { id: 't1', tag: 'timeline', segments: [za, zb] };
    const pipe = makePipe({ elements: [timeline as any] });

    const out = summarizePipe(pipe);
    expect(out.indexOf('zone="1"')).toBeLessThan(out.indexOf('zone="2"'));
    expect(out).toContain('<scene frames="0-72" zone="1">A</scene>');
    expect(out).toContain('<scene frames="72-121" zone="2">B</scene>');
  });
});
