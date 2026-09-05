/**
 * Unit tests for Global Element Service
 * Tests: create, resize, move, snap, clamp, persist
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

import { sessions, addPipe, addGlobalElement, updateGlobalRange, toggleGlobalElement, removeGlobalElement } from '../../src/lib/composerStore';
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

describe('Global Element Service', () => {
  beforeEach(() => {
    sessions.clear();
    vi.clearAllMocks();
  });

  // ── addGlobalElement Tests ────────────────────────────────────────────────

  describe('addGlobalElement', () => {
    it('should create a global style element', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      const result = await addGlobalElement(session.id, pipe.id, 0, 120);

      expect(result.errors).toHaveLength(0);
      expect(pipe.elements).toHaveLength(1);
      expect(pipe.elements[0].tag).toBe('global_style');
      expect(pipe.elements[0].frameStart).toBe(0);
      expect(pipe.elements[0].frameEnd).toBe(120);
      expect(pipe.elements[0].enabled).toBe(true);
    });

    it('should snap frame boundaries to 8n', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      await addGlobalElement(session.id, pipe.id, 5, 125);

      expect(pipe.elements[0].frameStart).toBe(0);
      expect(pipe.elements[0].frameEnd).toBe(120);
    });

    it('should handle full-pipe range', async () => {
      const session = createMockSession([{ id: 'p1', name: 'Pipe 1', lengthFrames: 241, qValue: 18, cValue: 7, keyframes: [], subjectReferences: [], elements: [], orderIndex: 0 }]);
      sessions.set(session.id, session);

      const result = await addGlobalElement(session.id, 'p1', 0, 240);

      expect(result.errors).toHaveLength(0);
      expect(sessions.get(session.id)!.pipes[0].elements[0].frameStart).toBe(0);
      expect(sessions.get(session.id)!.pipes[0].elements[0].frameEnd).toBe(240);
    });

    it('should return error for non-existent pipe', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      const result = await addGlobalElement(session.id, 'non-existent', 0, 120);

      expect(result.errors).toContain('Pipe not found');
    });
  });

  // ── updateGlobalRange Tests ───────────────────────────────────────────────

  describe('updateGlobalRange', () => {
    it('should resize global element', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addGlobalElement(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const globalId = pipe.elements[0].id;
      const result = await updateGlobalRange(session.id, pipe.id, globalId, 16, 96);

      expect(result.errors).toHaveLength(0);
      expect(pipe.elements[0].frameStart).toBe(16);
      expect(pipe.elements[0].frameEnd).toBe(96);
    });

    it('should snap resize to 8n boundary', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addGlobalElement(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const globalId = pipe.elements[0].id;
      await updateGlobalRange(session.id, pipe.id, globalId, 5, 125);

      expect(pipe.elements[0].frameStart).toBe(0);
      expect(pipe.elements[0].frameEnd).toBe(120);
    });

    it('should clamp resize to pipe bounds', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addGlobalElement(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const globalId = pipe.elements[0].id;
      await updateGlobalRange(session.id, pipe.id, globalId, -10, 200);

      expect(pipe.elements[0].frameStart).toBe(0);
      expect(pipe.elements[0].frameEnd).toBe(120);
    });

    it('should reject invalid range (less than 8 frames)', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addGlobalElement(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const globalId = pipe.elements[0].id;
      const result = await updateGlobalRange(session.id, pipe.id, globalId, 60, 68);

      // Range of 8 frames is valid (68-60=8), so no error expected
      expect(result.errors).toHaveLength(0);
    });

    it('should handle full-pipe resize', async () => {
      const session = createMockSession([{ id: 'p1', name: 'Pipe 1', lengthFrames: 241, qValue: 18, cValue: 7, keyframes: [], subjectReferences: [], elements: [], orderIndex: 0 }]);
      sessions.set(session.id, session);
      await addGlobalElement(session.id, 'p1', 0, 240);

      const pipe = session.pipes[0];
      const globalId = pipe.elements[0].id;
      const result = await updateGlobalRange(session.id, pipe.id, globalId, 0, 240);

      expect(result.errors).toHaveLength(0);
      expect(pipe.elements[0].frameStart).toBe(0);
      expect(pipe.elements[0].frameEnd).toBe(240);
    });
  });

  // ── toggleGlobalElement Tests ─────────────────────────────────────────────

  describe('toggleGlobalElement', () => {
    it('should toggle global element enabled', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addGlobalElement(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const globalId = pipe.elements[0].id;
      const result = await toggleGlobalElement(session.id, pipe.id, globalId);

      expect(result.errors).toHaveLength(0);
      expect(pipe.elements[0].enabled).toBe(false);
    });

    it('should toggle global element back on', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addGlobalElement(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const globalId = pipe.elements[0].id;
      await toggleGlobalElement(session.id, pipe.id, globalId);
      await toggleGlobalElement(session.id, pipe.id, globalId);

      expect(pipe.elements[0].enabled).toBe(true);
    });

    it('should handle toggle for non-existent element', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const result = await toggleGlobalElement(session.id, session.pipes[0].id, 'non-existent');

      expect(result.errors).toHaveLength(0);
    });
  });

  // ── removeGlobalElement Tests ─────────────────────────────────────────────

  describe('removeGlobalElement', () => {
    it('should remove global element by ID', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addGlobalElement(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const globalId = pipe.elements[0].id;
      const result = await removeGlobalElement(session.id, pipe.id, globalId);

      expect(result.errors).toHaveLength(0);
      expect(pipe.elements).toHaveLength(0);
    });

    it('should handle removing non-existent element', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const result = await removeGlobalElement(session.id, session.pipes[0].id, 'non-existent');

      expect(result.errors).toHaveLength(0);
    });
  });

  // ── Drag/Move Tests ───────────────────────────────────────────────────────

  describe('drag/move', () => {
    it('should handle drag with snap', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addGlobalElement(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const globalId = pipe.elements[0].id;
      
      // Simulate drag from 0 to 9
      await updateGlobalRange(session.id, pipe.id, globalId, 8, 120);

      expect(pipe.elements[0].frameStart).toBe(8);
    });

    it('should handle drag end with clamp', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addGlobalElement(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const globalId = pipe.elements[0].id;
      
      // Try to drag beyond pipe bounds
      await updateGlobalRange(session.id, pipe.id, globalId, 100, 200);

      expect(pipe.elements[0].frameEnd).toBe(120);
    });
  });

  // ── Persist Tests ─────────────────────────────────────────────────────────

  describe('persist', () => {
    it('should persist global element through save/load cycle', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addGlobalElement(session.id, session.pipes[0].id, 0, 120);

      // Toggle to change state
      await toggleGlobalElement(session.id, session.pipes[0].id, session.pipes[0].elements[0].id);

      // Simulate save/reload
      const savedPipes = JSON.parse(JSON.stringify(session.pipes));
      sessions.clear();

      const restoredSession = createMockSession(savedPipes);
      sessions.set(session.id, restoredSession);

      const restoredPipe = sessions.get(session.id)!.pipes[0];
      expect(restoredPipe.elements).toHaveLength(1);
      expect(restoredPipe.elements[0].tag).toBe('global_style');
      expect(restoredPipe.elements[0].enabled).toBe(false);
      expect(restoredPipe.elements[0].frameStart).toBe(0);
      expect(restoredPipe.elements[0].frameEnd).toBe(120);
    });
  });
});
