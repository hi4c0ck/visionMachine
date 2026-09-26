import { describe, it, expect } from 'vitest';
import type { PipeRow } from '../../src/types';
import {
  computeSessionVideoLayout,
  localFrameForPipe,
  pipeStartForPipe,
} from '../../src/lib/sessionVideoLayout';

function pipe(id: string, len: number, orderIndex: number): PipeRow {
  return {
    id,
    name: id,
    lengthFrames: len,
    qValue: 18,
    cValue: 7,
    orderIndex,
    // Minimal required fields — the layout math only reads lengthFrames + orderIndex.
    ...(null as unknown as PipeRow),
  } as unknown as PipeRow;
}

describe('computeSessionVideoLayout', () => {
  it('returns null for an empty pipe list', () => {
    expect(computeSessionVideoLayout([])).toBeNull();
  });

  it('single pipe: start 0, frameToPipe clamps to the last pipe', () => {
    const pipes = [pipe('a', 241, 0)];
    const layout = computeSessionVideoLayout(pipes)!;
    expect(layout.starts).toEqual([0]);
    // Any global frame belongs to the (only) pipe.
    expect(layout.frameToPipe(0)).toBe(0);
    expect(layout.frameToPipe(240)).toBe(0);
    // Overshoot clamps to the last pipe, not out-of-bounds.
    expect(layout.frameToPipe(999)).toBe(0);
  });

  it('two pipes of 241f: boundary frame 241 belongs to the SECOND pipe', () => {
    const pipes = [pipe('a', 241, 0), pipe('b', 241, 1)];
    const layout = computeSessionVideoLayout(pipes)!;
    expect(layout.starts).toEqual([0, 241]);
    // Global 240 is still in pipe a (0..240); global 241 is the first frame of pipe b.
    expect(layout.frameToPipe(240)).toBe(0);
    expect(layout.frameToPipe(241)).toBe(1);
    // Last frame of pipe b (481) and overshoot (9999) both clamp to pipe b.
    expect(layout.frameToPipe(481)).toBe(1);
    expect(layout.frameToPipe(9999)).toBe(1);
  });

  it('out-of-order orderIndex: starts is aligned to pipes array, not concat order', () => {
    // pipes array order is [a, b] but concat order is b (orderIndex 0) then a (orderIndex 1).
    const pipes = [pipe('a', 100, 1), pipe('b', 200, 0)];
    const layout = computeSessionVideoLayout(pipes)!;
    // b (orderIndex 0) starts at 0; a (orderIndex 1) starts at 200.
    // starts is aligned to the pipes array: starts[0] = a's start = 200, starts[1] = b's start = 0.
    expect(layout.starts).toEqual([200, 0]);
    // Global 0..199 → b (index 1 in pipes); 200..299 → a (index 0 in pipes).
    expect(layout.frameToPipe(0)).toBe(1);
    expect(layout.frameToPipe(199)).toBe(1);
    expect(layout.frameToPipe(200)).toBe(0);
    expect(layout.frameToPipe(299)).toBe(0);
  });

  it('missing orderIndex defaults to 0 (concat order falls back to array order)', () => {
    const a = { id: 'a', name: 'a', lengthFrames: 100, qValue: 18, cValue: 7 } as unknown as PipeRow;
    const b = { id: 'b', name: 'b', lengthFrames: 200, qValue: 18, cValue: 7 } as unknown as PipeRow;
    const layout = computeSessionVideoLayout([a, b])!;
    // No orderIndex → both default to 0 → stable sort keeps array order.
    expect(layout.starts).toEqual([0, 100]);
  });
});

describe('localFrameForPipe', () => {
  it('clamps the global frame into the pipe\'s local range', () => {
    const pipes = [pipe('a', 241, 0), pipe('b', 241, 1)];
    const layout = computeSessionVideoLayout(pipes)!;
    // Global 300 → pipe b (local 300-241=59); pipe a clamps to its last frame (240).
    expect(localFrameForPipe(layout, pipes, 1, 300)).toBe(59);
    expect(localFrameForPipe(layout, pipes, 0, 300)).toBe(240);
    // Global 0 → pipe a local 0; pipe b clamps to 0.
    expect(localFrameForPipe(layout, pipes, 0, 0)).toBe(0);
    expect(localFrameForPipe(layout, pipes, 1, 0)).toBe(0);
  });

  it('returns 0 for an out-of-range pipe index', () => {
    const pipes = [pipe('a', 241, 0)];
    const layout = computeSessionVideoLayout(pipes)!;
    expect(localFrameForPipe(layout, pipes, 99, 100)).toBe(0);
  });
});

describe('pipeStartForPipe', () => {
  it('returns the raw spliced start (0 when no layout / plain composer mode)', () => {
    const pipes = [pipe('a', 241, 0), pipe('b', 241, 1)];
    const layout = computeSessionVideoLayout(pipes)!;
    expect(pipeStartForPipe(layout, pipes, 0)).toBe(0);
    expect(pipeStartForPipe(layout, pipes, 1)).toBe(241);
    // null layout (composer mode) → 0 offset for every pipe.
    expect(pipeStartForPipe(null, pipes, 0)).toBe(0);
    expect(pipeStartForPipe(null, pipes, 1)).toBe(0);
  });

  it('local→global round-trip: local + start lands back in the owning pipe', () => {
    const pipes = [pipe('a', 241, 0), pipe('b', 241, 1), pipe('c', 241, 2)];
    const layout = computeSessionVideoLayout(pipes)!;
    // Pick a global frame in pipe c (e.g. 500 → local 500-482=18).
    const global = 500;
    const owning = layout.frameToPipe(global);
    expect(owning).toBe(2);
    const local = localFrameForPipe(layout, pipes, owning, global);
    expect(local).toBe(18);
    // Round-trip: local + pipeStart must equal the original global frame.
    expect(local + pipeStartForPipe(layout, pipes, owning)).toBe(global);
  });
});
