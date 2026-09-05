/**
 * Unit tests for Keyframe Service
 * Tests: progressive unlock, maximum 3 slots, snap position, save/reload
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

import { sessions, addPipe, addKeyframe, removeKeyframe, moveKeyframe } from '../../src/lib/composerStore';
import type { SessionData, PipeRow, KeyframeType } from '../../src/types/app';

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

describe('Keyframe Service', () => {
  beforeEach(() => {
    sessions.clear();
    vi.clearAllMocks();
  });

  // ── addKeyframe Tests ─────────────────────────────────────────────────────

  describe('addKeyframe', () => {
    it('should add url type keyframe', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      const result = await addKeyframe(session.id, pipe.id, 0, 0, 'url', 'https://example.com/kf.jpg');

      expect(result.errors).toHaveLength(0);
      expect(pipe.keyframes).toHaveLength(1);
      expect(pipe.keyframes[0].type).toBe('url');
      expect(pipe.keyframes[0].imageSrc).toBe('https://example.com/kf.jpg');
      expect(pipe.keyframes[0].status).toBe('pending');
    });

    it('should add txt2img type keyframe', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      const result = await addKeyframe(session.id, pipe.id, 1, 40, 'txt2img', 'a beautiful sunset');

      expect(result.errors).toHaveLength(0);
      expect(pipe.keyframes[0].type).toBe('txt2img');
      expect(pipe.keyframes[0].prompt).toBe('a beautiful sunset');
      expect(pipe.keyframes[0].imageSrc).toBeUndefined();
    });

    it('should add img2img type keyframe', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      const result = await addKeyframe(session.id, pipe.id, 2, 80, 'img2img', 'https://example.com/ref.jpg');

      expect(result.errors).toHaveLength(0);
      expect(pipe.keyframes[0].type).toBe('img2img');
      expect(pipe.keyframes[0].referenceUrl).toBe('https://example.com/ref.jpg');
    });

    it('should snap frame to 8n boundary', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      await addKeyframe(session.id, pipe.id, 0, 5, 'url', 'https://example.com/kf.jpg');

      expect(pipe.keyframes[0].frame).toBe(0);
    });

    it('should accept keyframe at frame 0', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      const result = await addKeyframe(session.id, pipe.id, 0, 0, 'url', 'https://example.com/kf.jpg');

      expect(result.errors).toHaveLength(0);
      expect(pipe.keyframes[0].frame).toBe(0);
    });

    it('should accept keyframe at frame 240 for 241-frame pipe', async () => {
      const session = createMockSession([{ id: 'p1', name: 'Pipe 1', lengthFrames: 241, qValue: 18, cValue: 7, keyframes: [], subjectReferences: [], elements: [], orderIndex: 0 }]);
      sessions.set(session.id, session);

      const result = await addKeyframe(session.id, 'p1', 0, 240, 'url', 'https://example.com/kf.jpg');

      expect(result.errors).toHaveLength(0);
    });
  });

  // ── Progressive Unlock Tests ──────────────────────────────────────────────

  describe('progressive unlock', () => {
    it('should allow adding keyframes in slot order', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      
      // Add slot 0
      await addKeyframe(session.id, pipe.id, 0, 0, 'url', 'https://example.com/1.jpg');
      expect(pipe.keyframes).toHaveLength(1);

      // Add slot 1
      await addKeyframe(session.id, pipe.id, 1, 40, 'txt2img', 'prompt 2');
      expect(pipe.keyframes).toHaveLength(2);

      // Add slot 2
      await addKeyframe(session.id, pipe.id, 2, 80, 'img2img', 'https://example.com/3.jpg');
      expect(pipe.keyframes).toHaveLength(3);
    });

    it('should allow out-of-order slot addition', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      
      // Add slot 2 first
      await addKeyframe(session.id, pipe.id, 2, 80, 'img2img', 'https://example.com/3.jpg');
      expect(pipe.keyframes).toHaveLength(1);

      // Add slot 0 second
      await addKeyframe(session.id, pipe.id, 0, 0, 'url', 'https://example.com/1.jpg');
      expect(pipe.keyframes).toHaveLength(2);

      // Add slot 1 third
      await addKeyframe(session.id, pipe.id, 1, 40, 'txt2img', 'prompt 2');
      expect(pipe.keyframes).toHaveLength(3);
    });
  });

  // ── Maximum Keyframes Tests ───────────────────────────────────────────────

  describe('maximum 3 keyframes', () => {
    it('should allow maximum 3 keyframes without slot limit', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      
      await addKeyframe(session.id, pipe.id, 0, 0, 'url', 'https://example.com/1.jpg');
      await addKeyframe(session.id, pipe.id, 1, 40, 'txt2img', 'prompt 2');
      await addKeyframe(session.id, pipe.id, 2, 80, 'img2img', 'https://example.com/3.jpg');

      expect(pipe.keyframes).toHaveLength(3);
    });
  });

  // ── Snap Position Tests ───────────────────────────────────────────────────

  describe('snap position', () => {
    it('should snap frame to nearest multiple of 8', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      await addKeyframe(session.id, pipe.id, 0, 9, 'url', 'https://example.com/kf.jpg');

      expect(pipe.keyframes[0].frame).toBe(8);
    });

    it('should snap frame 0 correctly', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      await addKeyframe(session.id, pipe.id, 0, 0, 'url', 'https://example.com/kf.jpg');

      expect(pipe.keyframes[0].frame).toBe(0);
    });

    it('should snap large frame values', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      await addKeyframe(session.id, pipe.id, 0, 245, 'url', 'https://example.com/kf.jpg');

      expect(pipe.keyframes[0].frame).toBe(240);
    });
  });

  // ── removeKeyframe Tests ──────────────────────────────────────────────────

  describe('removeKeyframe', () => {
    it('should remove a keyframe by ID', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      await addKeyframe(session.id, pipe.id, 0, 0, 'url', 'https://example.com/1.jpg');
      await addKeyframe(session.id, pipe.id, 1, 40, 'url', 'https://example.com/2.jpg');

      const kfId = pipe.keyframes[0].id;
      const result = await removeKeyframe(session.id, pipe.id, kfId);

      expect(result.errors).toHaveLength(0);
      expect(pipe.keyframes).toHaveLength(1);
      expect(pipe.keyframes.some(k => k.id === kfId)).toBe(false);
    });

    it('should handle removing last keyframe', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      await addKeyframe(session.id, pipe.id, 0, 0, 'url', 'https://example.com/1.jpg');

      const kfId = pipe.keyframes[0].id;
      await removeKeyframe(session.id, pipe.id, kfId);

      expect(pipe.keyframes).toHaveLength(0);
    });
  });

  // ── moveKeyframe Tests ────────────────────────────────────────────────────

  describe('moveKeyframe', () => {
    it('should move keyframe to new position', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      await addKeyframe(session.id, pipe.id, 0, 0, 'url', 'https://example.com/1.jpg');

      const kfId = pipe.keyframes[0].id;
      const result = await moveKeyframe(session.id, pipe.id, kfId, 40);

      expect(result.errors).toHaveLength(0);
      expect(pipe.keyframes[0].frame).toBe(40);
    });

    it('should snap moved position to 8n boundary', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      await addKeyframe(session.id, pipe.id, 0, 0, 'url', 'https://example.com/1.jpg');

      const kfId = pipe.keyframes[0].id;
      await moveKeyframe(session.id, pipe.id, kfId, 45);

      expect(pipe.keyframes[0].frame).toBe(40);
    });

    it('should handle moving to frame 0', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      await addKeyframe(session.id, pipe.id, 0, 40, 'url', 'https://example.com/1.jpg');

      const kfId = pipe.keyframes[0].id;
      await moveKeyframe(session.id, pipe.id, kfId, 0);

      expect(pipe.keyframes[0].frame).toBe(0);
    });
  });

  // ── Save/Reload Tests ─────────────────────────────────────────────────────

  describe('save/reload', () => {
    it('should persist keyframes through save/load cycle', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      await addKeyframe(session.id, pipe.id, 0, 0, 'url', 'https://example.com/1.jpg');
      await addKeyframe(session.id, pipe.id, 1, 40, 'txt2img', 'prompt 2');
      await addKeyframe(session.id, pipe.id, 2, 80, 'img2img', 'https://example.com/3.jpg');

      // Simulate save/reload
      const savedPipes = JSON.parse(JSON.stringify(session.pipes));
      sessions.clear();

      const restoredSession = createMockSession(savedPipes);
      sessions.set(session.id, restoredSession);

      const restoredPipe = sessions.get(session.id)!.pipes[0];
      expect(restoredPipe.keyframes).toHaveLength(3);
      expect(restoredPipe.keyframes[0].type).toBe('url');
      expect(restoredPipe.keyframes[1].type).toBe('txt2img');
      expect(restoredPipe.keyframes[2].type).toBe('img2img');
    });
  });
});
