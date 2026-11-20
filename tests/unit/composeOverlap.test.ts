/**
 * Item 10: signed per-boundary overlap — the composeTrim helpers + the
 * trim-aware session-video layout. Pins the sign semantics end-to-end:
 * negative cuts the PREVIOUS pipe's tail, positive cuts the NEW pipe's
 * head, 0 = classic lossless splice; the playhead layout subtracts the
 * same cuts so the mapping stays correct after a trimmed compose.
 */
import { describe, it, expect } from 'vitest';
import type { PipeRow } from '../../src/types';
import {
  OVERLAP_STOPS,
  snapOverlap,
  buildOverlapPayload,
  setAllBoundaries,
  overlapWillReencode,
} from '../../src/lib/composeTrim';
import { computeSessionVideoLayout } from '../../src/lib/sessionVideoLayout';

function pipe(id: string, len: number, orderIndex: number): PipeRow {
  return { id, name: id, lengthFrames: len, orderIndex } as unknown as PipeRow;
}

describe('snapOverlap', () => {
  it('keeps the stops verbatim', () => {
    for (const s of OVERLAP_STOPS) expect(snapOverlap(s)).toBe(s);
  });
  it('snaps arbitrary values to the nearest stop', () => {
    expect(snapOverlap(-20)).toBe(-24);
    expect(snapOverlap(-11)).toBe(-8);
    expect(snapOverlap(3)).toBe(0);
    expect(snapOverlap(6)).toBe(8);
  });
});

describe('buildOverlapPayload', () => {
  it('all-zero → null (the classic lossless path)', () => {
    expect(buildOverlapPayload({ p1: 0, p2: 0 })).toBeNull();
    expect(buildOverlapPayload({})).toBeNull();
  });
  it('only non-zero boundaries ride, snapped', () => {
    expect(buildOverlapPayload({ p1: 0, p2: 8, p3: -16 })).toEqual({ p2: 8, p3: -16 });
    expect(buildOverlapPayload({ p2: 7 })).toEqual({ p2: 8 });
  });
});

describe('setAllBoundaries (top-tier master)', () => {
  it('keys every boundary by the NEW pipe in orderIndex order', () => {
    const pipes = [pipe('c', 100, 2), pipe('a', 100, 0), pipe('b', 100, 1)];
    expect(setAllBoundaries(pipes, -8)).toEqual({ b: -8, c: -8 });
  });
  it('the first selected pipe gets no key (nothing precedes it)', () => {
    expect(setAllBoundaries([pipe('a', 100, 0)], 8)).toEqual({});
  });
  it('snaps the master value', () => {
    expect(setAllBoundaries([pipe('a', 100, 0), pipe('b', 100, 1)], 5)).toEqual({ b: 8 });
  });
});

describe('overlapWillReencode', () => {
  it('any non-zero boundary re-encodes; all-zero is lossless', () => {
    expect(overlapWillReencode({ p1: 0 })).toBe(false);
    expect(overlapWillReencode({ p1: -8 })).toBe(true);
    expect(overlapWillReencode({ p1: 8 })).toBe(true);
  });
});

describe('computeSessionVideoLayout — trim-aware (item 10)', () => {
  const pipes = [pipe('a', 120, 0), pipe('b', 120, 1), pipe('c', 120, 2)];

  it('no overlap → the classic sum (byte-identical legacy behavior)', () => {
    const layout = computeSessionVideoLayout(pipes)!;
    expect(layout.starts).toEqual([0, 120, 240]);
    expect(layout.frameToPipe(119)).toBe(0);
    expect(layout.frameToPipe(120)).toBe(1);
    expect(layout.frameToPipe(240)).toBe(2);
  });

  it('positive boundary cuts the NEW pipe head → later starts shift left', () => {
    // b loses 8 head frames: b spans [120, 232), c starts at 232.
    const layout = computeSessionVideoLayout(pipes, { b: 8 })!;
    expect(layout.starts).toEqual([0, 120, 232]);
    expect(layout.frameToPipe(231)).toBe(1);
    expect(layout.frameToPipe(232)).toBe(2);
  });

  it('negative boundary cuts the PREVIOUS pipe tail → earlier start shifts', () => {
    // b: -16 → a loses 16 tail frames: a spans [0,104), b starts at 104.
    const layout = computeSessionVideoLayout(pipes, { b: -16 })!;
    expect(layout.starts).toEqual([0, 104, 224]);
    expect(layout.frameToPipe(103)).toBe(0);
    expect(layout.frameToPipe(104)).toBe(1);
  });

  it('mixed signs + a key on the first pipe (ignored)', () => {
    // a: -24 key ignored (no predecessor); b: +8 head; c: -8 → b tail.
    const layout = computeSessionVideoLayout(pipes, { a: -24, b: 8, c: -8 })!;
    // a: 120 whole; b: 120 − 8 head − 8 tail = 104; c: 120 whole.
    expect(layout.starts).toEqual([0, 120, 224]);
    expect(layout.frameToPipe(223)).toBe(1);
    expect(layout.frameToPipe(224)).toBe(2);
  });

  it('null overlap behaves like absent', () => {
    const layout = computeSessionVideoLayout(pipes, null)!;
    expect(layout.starts).toEqual([0, 120, 240]);
  });
});