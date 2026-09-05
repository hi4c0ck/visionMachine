/**
 * Unit tests for Subject Reference Service
 * Tests: CRUD, visibility toggle, max 5 limit, range update, full-pipe mode, save/reload
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

import { sessions, addPipe, addSubjectRef, removeSubjectRef, toggleSubjectRef, updateSubjectRefRange, updateSubjectRefUrl, updateSubjectRefUseFrames } from '../../src/lib/composerStore';
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

describe('Subject Reference Service', () => {
  beforeEach(() => {
    sessions.clear();
    vi.clearAllMocks();
  });

  // ── addSubjectRef Tests ───────────────────────────────────────────────────

  describe('addSubjectRef', () => {
    it('should add 1 subject reference', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      const result = await addSubjectRef(session.id, pipe.id, 'https://example.com/ref1.jpg', false);

      expect(result.errors).toHaveLength(0);
      expect(pipe.subjectReferences).toHaveLength(1);
      expect(pipe.subjectReferences[0].imageUrl).toBe('https://example.com/ref1.jpg');
      expect(pipe.subjectReferences[0].visible).toBe(true);
    });

    it('should add 5 subject references (maximum)', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      for (let i = 1; i <= 5; i++) {
        const result = await addSubjectRef(session.id, pipe.id, `https://example.com/ref${i}.jpg`, false);
        expect(result.errors).toHaveLength(0);
      }

      expect(pipe.subjectReferences).toHaveLength(5);
    });

    it('should reject 6th subject reference', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      for (let i = 1; i <= 5; i++) {
        await addSubjectRef(session.id, pipe.id, `https://example.com/ref${i}.jpg`, false);
      }

      const result = await addSubjectRef(session.id, pipe.id, 'https://example.com/ref6.jpg', false);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Maximum 5');
      expect(pipe.subjectReferences).toHaveLength(5);
    });

    it('should support frame-ranged references', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      const result = await addSubjectRef(session.id, pipe.id, 'https://example.com/ref.jpg', true, 8, 104);

      expect(result.errors).toHaveLength(0);
      expect(pipe.subjectReferences[0].useFrames).toBe(true);
      expect(pipe.subjectReferences[0].frameStart).toBe(8);
      expect(pipe.subjectReferences[0].frameEnd).toBe(104);
    });

    it('should snap frame boundaries to 8n', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      await addSubjectRef(session.id, pipe.id, 'https://example.com/ref.jpg', true, 5, 125);

      expect(pipe.subjectReferences[0].frameStart).toBe(0);
      expect(pipe.subjectReferences[0].frameEnd).toBe(120);
    });

    it('should return error for non-existent pipe', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      const result = await addSubjectRef(session.id, 'non-existent', 'https://example.com/ref.jpg', false);

      expect(result.errors).toContain('Pipe not found');
    });
  });

  // ── removeSubjectRef Tests ────────────────────────────────────────────────

  describe('removeSubjectRef', () => {
    it('should remove a subject reference by ID', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      await addSubjectRef(session.id, pipe.id, 'https://example.com/ref1.jpg', false);
      await addSubjectRef(session.id, pipe.id, 'https://example.com/ref2.jpg', false);

      const refId = pipe.subjectReferences[0].id;
      const result = await removeSubjectRef(session.id, pipe.id, refId);

      expect(result.errors).toHaveLength(0);
      expect(pipe.subjectReferences).toHaveLength(1);
      expect(pipe.subjectReferences.some(r => r.id === refId)).toBe(false);
    });

    it('should handle removing last reference', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      await addSubjectRef(session.id, pipe.id, 'https://example.com/ref.jpg', false);

      const refId = pipe.subjectReferences[0].id;
      await removeSubjectRef(session.id, pipe.id, refId);

      expect(pipe.subjectReferences).toHaveLength(0);
    });
  });

  // ── toggleSubjectRef Tests ────────────────────────────────────────────────

  describe('toggleSubjectRef', () => {
    it('should toggle visibility on', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      await addSubjectRef(session.id, pipe.id, 'https://example.com/ref.jpg', false);

      const refId = pipe.subjectReferences[0].id;
      await toggleSubjectRef(session.id, pipe.id, refId);

      expect(pipe.subjectReferences[0].visible).toBe(false);
    });

    it('should toggle visibility off', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      await addSubjectRef(session.id, pipe.id, 'https://example.com/ref.jpg', false);
      await toggleSubjectRef(session.id, pipe.id, pipe.subjectReferences[0].id);

      await toggleSubjectRef(session.id, pipe.id, pipe.subjectReferences[0].id);

      expect(pipe.subjectReferences[0].visible).toBe(true);
    });

    it('should handle toggling multiple references independently', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      await addSubjectRef(session.id, pipe.id, 'https://example.com/ref1.jpg', false);
      await addSubjectRef(session.id, pipe.id, 'https://example.com/ref2.jpg', false);

      await toggleSubjectRef(session.id, pipe.id, pipe.subjectReferences[0].id);

      expect(pipe.subjectReferences[0].visible).toBe(false);
      expect(pipe.subjectReferences[1].visible).toBe(true);
    });
  });

  // ── updateSubjectRefRange Tests ───────────────────────────────────────────

  describe('updateSubjectRefRange', () => {
    it('should update frame range', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      await addSubjectRef(session.id, pipe.id, 'https://example.com/ref.jpg', true, 0, 120);

      const refId = pipe.subjectReferences[0].id;
      const result = await updateSubjectRefRange(session.id, pipe.id, refId, 16, 96);

      expect(result.errors).toHaveLength(0);
      expect(pipe.subjectReferences[0].frameStart).toBe(16);
      expect(pipe.subjectReferences[0].frameEnd).toBe(96);
    });

    it('should snap range to 8n boundary', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      await addSubjectRef(session.id, pipe.id, 'https://example.com/ref.jpg', true, 0, 120);

      const refId = pipe.subjectReferences[0].id;
      await updateSubjectRefRange(session.id, pipe.id, refId, 5, 125);

      expect(pipe.subjectReferences[0].frameStart).toBe(0);
      expect(pipe.subjectReferences[0].frameEnd).toBe(120);
    });

    it('should clamp range to pipe bounds', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      await addSubjectRef(session.id, pipe.id, 'https://example.com/ref.jpg', true, 0, 120);

      const refId = pipe.subjectReferences[0].id;
      await updateSubjectRefRange(session.id, pipe.id, refId, -10, 200);

      expect(pipe.subjectReferences[0].frameStart).toBe(0);
      expect(pipe.subjectReferences[0].frameEnd).toBe(120);
    });
  });

  // ── updateSubjectRefUrl Tests ─────────────────────────────────────────────

  describe('updateSubjectRefUrl', () => {
    it('should update image URL', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      await addSubjectRef(session.id, pipe.id, 'https://example.com/old.jpg', false);

      const refId = pipe.subjectReferences[0].id;
      const result = await updateSubjectRefUrl(session.id, pipe.id, refId, 'https://example.com/new.jpg');

      expect(result.errors).toHaveLength(0);
      expect(pipe.subjectReferences[0].imageUrl).toBe('https://example.com/new.jpg');
    });
  });

  // ── updateSubjectRefUseFrames Tests ───────────────────────────────────────

  describe('updateSubjectRefUseFrames', () => {
    it('should enable frame range mode', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      await addSubjectRef(session.id, pipe.id, 'https://example.com/ref.jpg', false);

      const refId = pipe.subjectReferences[0].id;
      const result = await updateSubjectRefUseFrames(session.id, pipe.id, refId, true);

      expect(result.errors).toHaveLength(0);
      expect(pipe.subjectReferences[0].useFrames).toBe(true);
    });

    it('should disable frame range mode', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      await addSubjectRef(session.id, pipe.id, 'https://example.com/ref.jpg', true, 0, 120);

      const refId = pipe.subjectReferences[0].id;
      await updateSubjectRefUseFrames(session.id, pipe.id, refId, false);

      expect(pipe.subjectReferences[0].useFrames).toBe(false);
      expect(pipe.subjectReferences[0].frameStart).toBeUndefined();
      expect(pipe.subjectReferences[0].frameEnd).toBeUndefined();
    });
  });

  // ── Range Update Tests ────────────────────────────────────────────────────

  describe('range update', () => {
    it('should update range for frame-enabled reference', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      await addSubjectRef(session.id, pipe.id, 'https://example.com/ref.jpg', true, 0, 120);

      const refId = pipe.subjectReferences[0].id;
      await updateSubjectRefRange(session.id, pipe.id, refId, 24, 88);

      expect(pipe.subjectReferences[0].frameStart).toBe(24);
      expect(pipe.subjectReferences[0].frameEnd).toBe(88);
    });

    it('should handle full-pipe mode range', async () => {
      const session = createMockSession([{ id: 'p1', name: 'Pipe 1', lengthFrames: 241, qValue: 18, cValue: 7, keyframes: [], subjectReferences: [], elements: [], orderIndex: 0 }]);
      sessions.set(session.id, session);

      const result = await addSubjectRef(session.id, 'p1', 'https://example.com/ref.jpg', true, 0, 240);

      expect(result.errors).toHaveLength(0);
      const pipe = sessions.get(session.id)!.pipes[0];
      expect(pipe.subjectReferences[0].frameStart).toBe(0);
      expect(pipe.subjectReferences[0].frameEnd).toBe(240);
    });
  });

  // ── Save/Reload Tests ─────────────────────────────────────────────────────

  describe('save/reload', () => {
    it('should persist subject references through save/load cycle', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      await addSubjectRef(session.id, pipe.id, 'https://example.com/ref1.jpg', true, 0, 120);
      await addSubjectRef(session.id, pipe.id, 'https://example.com/ref2.jpg', false);
      await toggleSubjectRef(session.id, pipe.id, pipe.subjectReferences[0].id);

      // Simulate save/reload by cloning the session
      const savedPipes = JSON.parse(JSON.stringify(session.pipes));
      sessions.clear();

      const restoredSession = createMockSession(savedPipes);
      sessions.set(session.id, restoredSession);

      const restoredPipe = sessions.get(session.id)!.pipes[0];
      expect(restoredPipe.subjectReferences).toHaveLength(2);
      expect(restoredPipe.subjectReferences[0].imageUrl).toBe('https://example.com/ref1.jpg');
      expect(restoredPipe.subjectReferences[0].visible).toBe(false);
      expect(restoredPipe.subjectReferences[1].imageUrl).toBe('https://example.com/ref2.jpg');
      expect(restoredPipe.subjectReferences[1].visible).toBe(true);
    });
  });
});
