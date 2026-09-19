/**
 * Unit tests for promptEngine.ts — nested, properly-closed prompt compiler.
 */
import { describe, it, expect } from 'vitest';
import {
  summarizePipe,
  getSortedZones,
  sectionName,
  tagPositionCues,
} from '../../src/lib/promptEngine';
import type {
  PipeRow,
  GlobalElement,
  SoundElement,
  TimelineElement,
  Segment,
  TagElement,
} from '../../src/types/app';

function makeTag(
  tag: TagElement['tag'],
  frameStart: number,
  frameEnd: number,
  extra?: Partial<TagElement>,
): TagElement {
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

  it('summarizes a missing pipe as the empty marker', () => {
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

describe('promptEngine.summarizePipe', () => {
  it('emits top-level <global_style> and <audio> as properly-closed elements', () => {
    const global: GlobalElement = {
      id: 'g1', tag: 'global_style', frameStart: 0, frameEnd: 121, enabled: true, prompt: 'cinematic noir',
    };
    const sound: SoundElement = {
      id: 's1', tag: 'sound', frameStart: 0, frameEnd: 121, enabled: true, prompt: 'rain on glass',
    };
    const pipe = makePipe({ elements: [global as any, sound as any] });
    const out = summarizePipe(pipe);
    expect(out).toContain('<global_style>cinematic noir</global_style>');
    expect(out).toContain('<audio>rain on glass</audio>');
    // Both properly closed — one open + one close per element.
    expect(out.match(/<global_style>/g)).toHaveLength(1);
    expect(out.match(/<\/global_style>/g)).toHaveLength(1);
    expect(out.match(/<audio>/g)).toHaveLength(1);
    expect(out.match(/<\/audio>/g)).toHaveLength(1);
  });

  it('skips disabled or empty top-level elements', () => {
    const off: GlobalElement = {
      id: 'g1', tag: 'global_style', frameStart: 0, frameEnd: 121, enabled: false, prompt: 'off style',
    };
    const empty: SoundElement = {
      id: 's1', tag: 'sound', frameStart: 0, frameEnd: 121, enabled: true,
    };
    const out = summarizePipe(makePipe({ elements: [off as any, empty as any] }));
    expect(out).not.toContain('global_style');
    expect(out).not.toContain('audio');
  });

  it('wraps each segment in a <segments length="…"> container with closed XML tag pairs', () => {
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
    const pipe = makePipe({ elements: [timeline as any] });

    const out = summarizePipe(pipe, { unit: 'frames', fps: 24 });
    // One <segments> container, properly closed.
    expect(out.match(/<segments length="72f">/g)).toHaveLength(1);
    expect(out.match(/<\/segments>/g)).toHaveLength(1);
    // The <segments> block is nested inside a bare <timeline> container (no fps attr).
    expect(out).toContain('<timeline>\n');
    expect(out).toContain('</timeline>');
    expect(out.match(/<timeline/g)).toHaveLength(1);
    expect(out.match(/<\/timeline>/g)).toHaveLength(1);
    // Tags inside are closed XML pairs, uniform (no constructRule shaping).
    expect(out).toContain('<scene>Mountain approach</scene>');
    expect(out).toContain('<camera>30</camera>');
    expect(out.match(/<scene>/g)).toHaveLength(1);
    expect(out.match(/<\/scene>/g)).toHaveLength(1);
    expect(out.match(/<camera>/g)).toHaveLength(1);
    expect(out.match(/<\/camera>/g)).toHaveLength(1);
  });

  it('renders seconds length attribute when unit=seconds', () => {
    const z1: Segment = {
      id: 'z1',
      frameStart: 0,
      frameEnd: 72,
      tags: [makeTag('scene', 0, 72, { prompt: 'A' })],
    };
    const timeline: TimelineElement = { id: 't1', tag: 'timeline', segments: [z1] };
    const pipe = makePipe({ elements: [timeline as any] });

    // 72 frames / 24 fps = 3 seconds → "3s".
    const out = summarizePipe(pipe, { unit: 'seconds', fps: 24 });
    expect(out).toContain('<segments length="3s">');
  });

  it('orders segments by frameStart regardless of stored order', () => {
    const za: Segment = { id: 'za', frameStart: 72, frameEnd: 121, tags: [makeTag('scene', 72, 121, { prompt: 'B' })] };
    const zb: Segment = { id: 'zb', frameStart: 0, frameEnd: 72, tags: [makeTag('scene', 0, 72, { prompt: 'A' })] };
    const timeline: TimelineElement = { id: 't1', tag: 'timeline', segments: [za, zb] };
    const pipe = makePipe({ elements: [timeline as any] });

    const out = summarizePipe(pipe, { unit: 'frames', fps: 24 });
    // zb (frame 0) must come before za (frame 72).
    expect(out.indexOf('<scene>A</scene>')).toBeLessThan(out.indexOf('<scene>B</scene>'));
    expect(out).toContain('<segments length="72f">');
    expect(out).toContain('<segments length="49f">');
  });

  it('emits an empty marker for a bare pipe', () => {
    expect(summarizePipe(makePipe(), { unit: 'frames', fps: 24 })).toBe('<heuristics>empty</heuristics>');
  });

  it('renders an empty segment as a closed <segments> with no body', () => {
    const z1: Segment = { id: 'z1', frameStart: 0, frameEnd: 72, tags: [] };
    const timeline: TimelineElement = { id: 't1', tag: 'timeline', segments: [z1] };
    const pipe = makePipe({ elements: [timeline as any] });

    const out = summarizePipe(pipe, { unit: 'frames', fps: 24 });
    expect(out).toBe('<timeline>\n<segments length="72f">\n\n</segments>\n</timeline>');
  });

  it('wraps all segments in a single <timeline fps> container', () => {
    const za: Segment = { id: 'za', frameStart: 0, frameEnd: 72, tags: [makeTag('scene', 0, 72, { prompt: 'A' })] };
    const zb: Segment = { id: 'zb', frameStart: 72, frameEnd: 121, tags: [makeTag('scene', 72, 121, { prompt: 'B' })] };
    const tl: TimelineElement = { id: 't1', tag: 'timeline', segments: [za, zb] };
    const pipe = makePipe({ elements: [tl as any] });

    const out = summarizePipe(pipe, { unit: 'frames', fps: 24 });
    // Exactly one <timeline> wraps both <segments> blocks.
    expect(out.match(/<timeline/g)).toHaveLength(1);
    expect(out.match(/<\/timeline>/g)).toHaveLength(1);
    expect(out.match(/<segments /g)).toHaveLength(2);
    // Each block keeps its own length, in chronological order.
    expect(out).toContain('<segments length="72f">');
    expect(out).toContain('<segments length="49f">');
  });

  it('inlines position cues into the tag content (after / for-along)', () => {
    // Zone 0–72. A camera tag 12–48 → starts 12 frames (0.5s @ 24fps) in, ends
    // 24 frames (1s) before the zone end → cues: "after 0.5s", "for 1s along".
    const z1: Segment = {
      id: 'z1',
      frameStart: 0,
      frameEnd: 72,
      tags: [makeTag('camera', 12, 48, { value: 30 })],
    };
    const timeline: TimelineElement = { id: 't1', tag: 'timeline', segments: [z1] };
    const pipe = makePipe({ elements: [timeline as any] });

    const out = summarizePipe(pipe, { unit: 'frames', fps: 24 });
    // Cues prefix the content inside the SAME closed pair.
    expect(out).toContain('<camera>after 0.5s, for 1s along - 30</camera>');
    // Still properly closed: exactly one open + one close.
    expect(out.match(/<camera>/g)).toHaveLength(1);
    expect(out.match(/<\/camera>/g)).toHaveLength(1);
  });

  it('emits no cues for a tag spanning the full zone', () => {
    const z1: Segment = {
      id: 'z1',
      frameStart: 0,
      frameEnd: 72,
      tags: [makeTag('scene', 0, 72, { prompt: 'Mountain approach' })],
    };
    const timeline: TimelineElement = { id: 't1', tag: 'timeline', segments: [z1] };
    const pipe = makePipe({ elements: [timeline as any] });

    const out = summarizePipe(pipe, { unit: 'frames', fps: 24 });
    expect(out).toContain('<scene>Mountain approach</scene>');
    expect(out).not.toContain('after');
    expect(out).not.toContain('along');
  });

  it('tagPositionCues returns both cues when both edges differ', () => {
    const cues = tagPositionCues(
      { frameStart: 12, frameEnd: 48 },
      { frameStart: 0, frameEnd: 72 },
      24,
    );
    expect(cues).toEqual(['after 0.5s', 'for 1s along']);
  });

  it('tagPositionCues returns [] when the tag matches the zone exactly', () => {
    expect(tagPositionCues({ frameStart: 0, frameEnd: 72 }, { frameStart: 0, frameEnd: 72 }, 24)).toEqual([]);
  });

  it('tagPositionCues returns only "after" when start differs but end matches', () => {
    expect(tagPositionCues({ frameStart: 36, frameEnd: 72 }, { frameStart: 0, frameEnd: 72 }, 24)).toEqual(['after 1.5s']);
  });

  it('tagPositionCues returns only "for-along" when end differs but start matches', () => {
    expect(tagPositionCues({ frameStart: 0, frameEnd: 36 }, { frameStart: 0, frameEnd: 72 }, 24)).toEqual(['for 1.5s along']);
  });
});
