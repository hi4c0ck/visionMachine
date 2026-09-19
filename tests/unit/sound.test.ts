/**
 * Unit tests for the Sound Element Service (global-alike) + global/sound prompts.
 * Same coverage shape as global.test.ts: create, resize, snap, clamp, toggle,
 * remove, prompt updates, persist.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

import {
  sessions,
  addPipe,
  addGlobalElement,
  addSoundElement,
  updateSoundRange,
  toggleSoundElement,
  removeSoundElement,
  updateGlobalPrompt,
  updateSoundPrompt,
} from '../../src/lib/composerStore';
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

function pipeOf(session: SessionData): PipeRow {
  const pipe = session.pipes[0];
  if (!pipe) throw new Error('no pipe');
  return pipe;
}

describe('Sound Element Service', () => {
  beforeEach(() => {
    sessions.clear();
    vi.clearAllMocks();
  });

  // ── addSoundElement ─────────────────────────────────────────────────────

  describe('addSoundElement', () => {
    it('creates a sound element spanning the given range', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = pipeOf(session);
      const result = await addSoundElement(session.id, pipe.id, 0, 120);

      expect(result.errors).toHaveLength(0);
      expect(pipe.elements[0].tag).toBe('sound');
      expect(pipe.elements[0].frameStart).toBe(0);
      expect(pipe.elements[0].frameEnd).toBe(120);
      expect(pipe.elements[0].enabled).toBe(true);
    });

    it('snaps frame boundaries to 8n', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = pipeOf(session);
      await addSoundElement(session.id, pipe.id, 5, 125);

      expect(pipe.elements[0].frameStart).toBe(0);
      expect(pipe.elements[0].frameEnd).toBe(120);
    });

    it('coexists with a global element on the same pipe', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = pipeOf(session);
      await addGlobalElement(session.id, pipe.id, 0, 120);
      await addSoundElement(session.id, pipe.id, 0, 120);

      expect(pipe.elements).toHaveLength(2);
      expect(pipe.elements.map((e) => e.tag)).toEqual(['global_style', 'sound']);
    });
  });

  // ── updateSoundRange ────────────────────────────────────────────────────

  describe('updateSoundRange', () => {
    it('resizes the sound element', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = pipeOf(session);
      await addSoundElement(session.id, pipe.id, 0, 120);
      const soundId = pipe.elements[0].id;

      const result = await updateSoundRange(session.id, pipe.id, soundId, 16, 96);

      expect(result.errors).toHaveLength(0);
      expect(pipe.elements[0].frameStart).toBe(16);
      expect(pipe.elements[0].frameEnd).toBe(96);
    });

    it('clamps to pipe bounds', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = pipeOf(session);
      await addSoundElement(session.id, pipe.id, 0, 120);
      const soundId = pipe.elements[0].id;

      await updateSoundRange(session.id, pipe.id, soundId, -10, 200);

      expect(pipe.elements[0].frameStart).toBe(0);
      expect(pipe.elements[0].frameEnd).toBe(120);
    });
  });

  // ── toggle / remove ─────────────────────────────────────────────────────

  describe('toggleSoundElement', () => {
    it('flips the enabled flag', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = pipeOf(session);
      await addSoundElement(session.id, pipe.id, 0, 120);
      const soundId = pipe.elements[0].id;

      await toggleSoundElement(session.id, pipe.id, soundId);
      expect(pipe.elements[0].enabled).toBe(false);

      await toggleSoundElement(session.id, pipe.id, soundId);
      expect(pipe.elements[0].enabled).toBe(true);
    });
  });

  describe('removeSoundElement', () => {
    it('removes only the sound element, keeping siblings', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = pipeOf(session);
      await addGlobalElement(session.id, pipe.id, 0, 120);
      await addSoundElement(session.id, pipe.id, 0, 120);
      const soundId = pipe.elements[1].id;

      const result = await removeSoundElement(session.id, pipe.id, soundId);

      expect(result.errors).toHaveLength(0);
      expect(pipe.elements).toHaveLength(1);
      expect(pipe.elements[0].tag).toBe('global_style');
    });
  });

  // ── prompt updates ──────────────────────────────────────────────────────

  describe('updateGlobalPrompt', () => {
    it('stores the prompt on the global element', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = pipeOf(session);
      await addGlobalElement(session.id, pipe.id, 0, 120);
      const globalId = pipe.elements[0].id;

      const result = await updateGlobalPrompt(session.id, pipe.id, globalId, 'cinematic');

      expect(result.errors).toHaveLength(0);
      expect((pipe.elements[0] as any).prompt).toBe('cinematic');
    });

    it('clears the prompt when given whitespace', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = pipeOf(session);
      await addGlobalElement(session.id, pipe.id, 0, 120);
      const globalId = pipe.elements[0].id;

      await updateGlobalPrompt(session.id, pipe.id, globalId, 'cinematic');
      await updateGlobalPrompt(session.id, pipe.id, globalId, '   ');

      expect((pipe.elements[0] as any).prompt).toBeUndefined();
    });
  });

  describe('updateSoundPrompt', () => {
    it('stores the prompt on the sound element', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = pipeOf(session);
      await addSoundElement(session.id, pipe.id, 0, 120);
      const soundId = pipe.elements[0].id;

      const result = await updateSoundPrompt(session.id, pipe.id, soundId, 'rain');

      expect(result.errors).toHaveLength(0);
      expect((pipe.elements[0] as any).prompt).toBe('rain');
    });
  });

  // ── persist ─────────────────────────────────────────────────────────────

  describe('persist', () => {
    it('round-trips a sound element through a save/load cycle', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = pipeOf(session);
      await addSoundElement(session.id, pipe.id, 0, 120);
      await updateSoundPrompt(session.id, pipe.id, pipe.elements[0].id, 'rain');
      await toggleSoundElement(session.id, pipe.id, pipe.elements[0].id);

      const savedPipes = JSON.parse(JSON.stringify(session.pipes));
      sessions.clear();

      const restoredSession = createMockSession(savedPipes);
      sessions.set(session.id, restoredSession);

      const restored = restoredSession.pipes[0].elements[0];
      expect(restored.tag).toBe('sound');
      expect(restored.enabled).toBe(false);
      expect((restored as any).prompt).toBe('rain');
    });
  });
});
