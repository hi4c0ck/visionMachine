/**
 * Pure module tests for the experimental "compose pipes" boundary-trim
 * map builder (src/lib/composeTrim.ts). No Tauri runtime needed — the
 * "first pipe is never trimmed" rule + the master-gate ON/OFF behavior
 * are the two invariants this map is the single source of truth for.
 */
import { describe, it, expect } from 'vitest';
import { buildTrimBoundaryMap, trimWillReencode } from '$lib/composeTrim';
import type { PipeRow } from '$types';

function pipe(id: string, orderIndex: number, trimBoundary?: boolean): PipeRow {
  return {
    id,
    name: `Pipe ${orderIndex + 1}`,
    lengthFrames: 121,
    qValue: 18,
    cValue: 7,
    keyframes: [],
    subjectReferences: [],
    elements: [],
    orderIndex,
    trimBoundary,
  } as PipeRow;
}

describe('buildTrimBoundaryMap', () => {
  it('returns an empty map when the master gate is OFF', () => {
    const pipes = [pipe('p1', 0, true), pipe('p2', 1, true), pipe('p3', 2, true)];
    expect(buildTrimBoundaryMap(pipes, false)).toEqual({});
  });

  it('never trims the first pipe (index 0 in timeline order)', () => {
    const pipes = [pipe('p1', 0, true), pipe('p2', 1, true)];
    const map = buildTrimBoundaryMap(pipes, true);
    expect(map['p1']).toBeUndefined();
    expect(map['p2']).toBe(true);
  });

  it('trims only interior pipes whose own switch is ON', () => {
    const pipes = [
      pipe('p1', 0),
      pipe('p2', 1, true),
      pipe('p3', 2, false),
      pipe('p4', 3, true),
    ];
    const map = buildTrimBoundaryMap(pipes, true);
    expect(map).toEqual({ p2: true, p4: true });
  });

  it('respects orderIndex, not array position (out-of-order input)', () => {
    const pipes = [
      pipe('p2', 1, true), // array[0] but NOT the timeline head
      pipe('p1', 0, true), // timeline head — never trimmed
      pipe('p3', 2, true),
    ];
    const map = buildTrimBoundaryMap(pipes, true);
    // p1 is the timeline head → excluded even though its switch is ON.
    expect(map['p1']).toBeUndefined();
    expect(map['p2']).toBe(true);
    expect(map['p3']).toBe(true);
  });

  it('returns an empty map for zero pipes', () => {
    expect(buildTrimBoundaryMap([], true)).toEqual({});
  });

  it('returns an empty map for a single pipe (nothing interior)', () => {
    expect(buildTrimBoundaryMap([pipe('p1', 0, true)], true)).toEqual({});
  });
});

describe('trimWillReencode', () => {
  it('is false for an empty map', () => {
    expect(trimWillReencode({})).toBe(false);
  });

  it('is true when any pipe is trimmed', () => {
    expect(trimWillReencode({ p2: true })).toBe(true);
  });
});
