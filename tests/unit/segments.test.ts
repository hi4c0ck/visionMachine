/**
 * Unit tests for Segment Service
 * Tests: add, remove, resize, move, overlap rejection, range preservation
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

import { sessions, addPipe, addSegment, removeSegment, resizeSegment } from '../../src/lib/composerStore';
import type { SessionData, PipeRow } from '../../src/types/app';

function createMockSession(pipes: PipeRow[] = []): SessionData {
  return {
    id: 's1',
    name: 'Test',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    directoryPath: 'C:/t',
    pipes,
    fps: 24,
    resolution: '720p',
    orientation: 'horizontal',
    totalGeneratedFrames: 0,
  };
}

describe('Segment Service', () => {
  beforeEach(() => {
    sessions.clear();
    vi.clearAllMocks();
  });

  // ── addSegment Tests ──────────────────────────────────────────────────────

  describe('addSegment', () => {
    it('should add 1 segment to timeline', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      const result = await addSegment(session.id, pipe.id, 0, 120);

      expect(result.errors).toHaveLength(0);
      expect(pipe.elements).toHaveLength(1);
      expect(pipe.elements[0].tag).toBe('timeline');
      expect(pipe.elements[0].segments).toHaveLength(1);
      expect(pipe.elements[0].segments[0].frameStart).toBe(0);
      expect(pipe.elements[0].segments[0].frameEnd).toBe(120);
    });

    it('should add 2 segments without overlap', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      await addSegment(session.id, pipe.id, 0, 56);
      const result = await addSegment(session.id, pipe.id, 64, 120);

      expect(result.errors).toHaveLength(0);
      expect(pipe.elements[0].segments).toHaveLength(2);
      expect(pipe.elements[0].segments[0].frameEnd).toBe(56);
      expect(pipe.elements[0].segments[1].frameStart).toBe(64);
    });

    it('should add 3 segments sequentially', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      await addSegment(session.id, pipe.id, 0, 40);
      await addSegment(session.id, pipe.id, 48, 80);
      const result = await addSegment(session.id, pipe.id, 88, 120);

      expect(result.errors).toHaveLength(0);
      expect(pipe.elements[0].segments).toHaveLength(3);
    });

    it('should add 4 segments when space allows', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      await addSegment(session.id, pipe.id, 0, 32);
      await addSegment(session.id, pipe.id, 40, 64);
      await addSegment(session.id, pipe.id, 72, 96);
      const result = await addSegment(session.id, pipe.id, 104, 120);

      expect(result.errors).toHaveLength(0);
      expect(pipe.elements[0].segments).toHaveLength(4);
    });

    it('should reject overlapping segments', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      await addSegment(session.id, pipe.id, 0, 120);
      const result = await addSegment(session.id, pipe.id, 40, 80);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('overlap');
      expect(pipe.elements[0].segments).toHaveLength(1);
    });

    it('should preserve adjacent ranges', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      await addSegment(session.id, pipe.id, 0, 56);
      await addSegment(session.id, pipe.id, 64, 120);

      const seg1 = pipe.elements[0].segments[0];
      const seg2 = pipe.elements[0].segments[1];

      expect(seg1.frameStart).toBe(0);
      expect(seg1.frameEnd).toBe(56);
      expect(seg2.frameStart).toBe(64);
      expect(seg2.frameEnd).toBe(120);
    });

    it('should snap frames to 8n boundary', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      await addSegment(session.id, pipe.id, 5, 125);

      expect(pipe.elements[0].segments[0].frameStart).toBe(0);
      expect(pipe.elements[0].segments[0].frameEnd).toBe(120);
    });

    it('should ensure minimum span of 8 frames', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      const result = await addSegment(session.id, pipe.id, 0, 5);

      expect(result.errors).toHaveLength(0);
      expect(pipe.elements[0].segments[0].frameEnd - pipe.elements[0].segments[0].frameStart).toBeGreaterThanOrEqual(8);
    });

    it('should auto-create timeline if missing', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      const result = await addSegment(session.id, pipe.id, 0, 120);

      expect(result.errors).toHaveLength(0);
      const timeline = pipe.elements.find((e: any) => e.tag === 'timeline');
      expect(timeline).toBeDefined();
      expect(timeline.segments).toHaveLength(1);
    });

    it('should return error for non-existent pipe', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      const result = await addSegment(session.id, 'non-existent', 0, 120);

      expect(result.errors).toContain('Pipe not found');
    });
  });

  // ── removeSegment Tests ───────────────────────────────────────────────────

  describe('removeSegment', () => {
    it('should remove a segment by ID', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      await addSegment(session.id, pipe.id, 0, 60);
      await addSegment(session.id, pipe.id, 64, 120);

      const segmentId = pipe.elements[0].segments[0].id;
      const result = await removeSegment(session.id, pipe.id, segmentId);

      expect(result.errors).toHaveLength(0);
      expect(pipe.elements[0].segments).toHaveLength(1);
    });

    it('should preserve remaining segments order', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      await addSegment(session.id, pipe.id, 0, 40);
      await addSegment(session.id, pipe.id, 48, 80);
      await addSegment(session.id, pipe.id, 88, 120);

      const firstId = pipe.elements[0].segments[0].id;
      await removeSegment(session.id, pipe.id, firstId);

      expect(pipe.elements[0].segments).toHaveLength(2);
      expect(pipe.elements[0].segments[0].frameStart).toBe(48);
      expect(pipe.elements[0].segments[1].frameStart).toBe(88);
    });

    it('should handle removing last segment', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      await addSegment(session.id, pipe.id, 0, 120);

      const segmentId = pipe.elements[0].segments[0].id;
      await removeSegment(session.id, pipe.id, segmentId);

      expect(pipe.elements[0].segments).toHaveLength(0);
    });

    it('should return error for non-existent pipe', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      const result = await removeSegment(session.id, 'non-existent', 'seg-1');

      expect(result.errors).toContain('Pipe not found');
    });
  });

  // ── resizeSegment Tests ───────────────────────────────────────────────────

  describe('resizeSegment', () => {
    it('should resize segment frame range', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      await addSegment(session.id, pipe.id, 0, 120);

      const segmentId = pipe.elements[0].segments[0].id;
      const result = await resizeSegment(session.id, pipe.id, segmentId, 8, 104);

      expect(result.errors).toHaveLength(0);
      expect(pipe.elements[0].segments[0].frameStart).toBe(8);
      expect(pipe.elements[0].segments[0].frameEnd).toBe(104);
    });

    it('should snap resize to 8n boundary', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      await addSegment(session.id, pipe.id, 0, 120);

      const segmentId = pipe.elements[0].segments[0].id;
      await resizeSegment(session.id, pipe.id, segmentId, 5, 125);

      expect(pipe.elements[0].segments[0].frameStart).toBe(0);
      expect(pipe.elements[0].segments[0].frameEnd).toBe(120);
    });

    it('should reject resize causing overlap', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      await addSegment(session.id, pipe.id, 0, 60);
      await addSegment(session.id, pipe.id, 64, 120);

      const segmentId = pipe.elements[0].segments[0].id;
      const result = await resizeSegment(session.id, pipe.id, segmentId, 50, 120);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('overlap');
    });

    it('should clamp resize to pipe bounds', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      await addSegment(session.id, pipe.id, 0, 60);

      const segmentId = pipe.elements[0].segments[0].id;
      await resizeSegment(session.id, pipe.id, segmentId, -10, 200);

      expect(pipe.elements[0].segments[0].frameStart).toBe(0);
      expect(pipe.elements[0].segments[0].frameEnd).toBe(120);
    });

    it('should preserve adjacent segments when resizing', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      await addSegment(session.id, pipe.id, 0, 40);
      await addSegment(session.id, pipe.id, 48, 80);
      await addSegment(session.id, pipe.id, 88, 120);

      const midId = pipe.elements[0].segments[1].id;
      const result = await resizeSegment(session.id, pipe.id, midId, 48, 80);

      expect(result.errors).toHaveLength(0);
      expect(pipe.elements[0].segments[0].frameEnd).toBe(40);
      expect(pipe.elements[0].segments[2].frameStart).toBe(88);
    });
  });
});
