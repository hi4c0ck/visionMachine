/**
 * Unit tests for the generation result service (src/lib/composerStore/generation.ts,
 * exposed via src/lib/composerStore/index.ts) and the save payload:
 *   - attachLastGeneration sets pipe.lastGeneration
 *   - markRefStatus flips keyframe / subject reference statuses
 *   - saveSession's invoke payload carries subject type/prompt/status and
 *     the pipe's lastGeneration
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

import { invoke } from '@tauri-apps/api/core';
import {
  sessions,
  addPipe,
  attachLastGeneration,
  markRefStatus,
  saveSession,
} from '../../src/lib/composerStore';
import type {
  SessionData,
  PipeRow,
  PipeLastGeneration,
  PipeKeyframe,
} from '../../src/types/app';

function makeKeyframe(overrides: Partial<PipeKeyframe> = {}): PipeKeyframe {
  return {
    id: 'k1',
    frame: 0,
    slotIndex: 1,
    type: 'url',
    imageSrc: 'https://example.com/k.jpg',
    status: 'pending',
    ...overrides,
  };
}

function makePipe(overrides: Partial<PipeRow> = {}): PipeRow {
  return {
    id: 'p1',
    name: 'Pipe 1',
    lengthFrames: 121,
    qValue: 18,
    cValue: 7,
    orderIndex: 0,
    keyframes: [makeKeyframe()],
    subjectReferences: [
      {
        id: 'r1',
        imageUrl: 'https://example.com/r.jpg',
        useFrames: false,
        visible: true,
        type: 'url',
        status: 'pending',
      },
    ],
    elements: [],
    lastGeneration: null,
    ...overrides,
  };
}

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

const GEN: PipeLastGeneration = {
  taskId: 't9',
  videoPath: 'C:/out/video.mp4',
  generatedAt: 1234567890,
  status: 'done',
};

describe('Generation result service', () => {
  beforeEach(() => {
    sessions.clear();
    vi.clearAllMocks();
    (invoke as ReturnType<typeof vi.fn>).mockResolvedValue({});
  });

  describe('attachLastGeneration', () => {
    it('sets pipe.lastGeneration on success', async () => {
      const session = createMockSession([makePipe()]);
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      const result = await attachLastGeneration(session.id, pipe.id, GEN);

      expect(result.errors).toEqual([]);
      expect(pipe.lastGeneration).toEqual(GEN);
    });

    it('returns an error for an unknown pipe and leaves others untouched', async () => {
      const session = createMockSession([makePipe()]);
      sessions.set(session.id, session);
      await addPipe(session.id);

      const result = await attachLastGeneration(session.id, 'nope', GEN);
      expect(result.errors).toHaveLength(1);
      expect(session.pipes[0].lastGeneration).toBeNull();
    });

    it('replaces a previous generation artifact', async () => {
      const session = createMockSession([makePipe()]);
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      await attachLastGeneration(session.id, pipe.id, GEN);
      const second: PipeLastGeneration = { ...GEN, taskId: 't10', videoPath: 'C:/out/2.mp4' };
      await attachLastGeneration(session.id, pipe.id, second);
      expect(pipe.lastGeneration).toEqual(second);
    });
  });

  describe('markRefStatus', () => {
    it('flips a keyframe status', async () => {
      const session = createMockSession([makePipe()]);
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      const result = await markRefStatus(session.id, pipe.id, 'keyframe', 'k1', 'done');

      expect(result.errors).toEqual([]);
      expect(pipe.keyframes.find((k: PipeKeyframe) => k.id === 'k1')!.status).toBe('done');
    });

    it('flips a subject reference status', async () => {
      const session = createMockSession([makePipe()]);
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      const result = await markRefStatus(session.id, pipe.id, 'subject', 'r1', 'error');

      expect(result.errors).toEqual([]);
      expect(pipe.subjectReferences[0].status).toBe('error');
    });

    it('errors when the reference id does not exist', async () => {
      const session = createMockSession([makePipe()]);
      sessions.set(session.id, session);
      await addPipe(session.id);

      const result = await markRefStatus(session.id, session.pipes[0].id, 'subject', 'nope', 'done');
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('saveSession payload', () => {
    it('carries subject type/prompt/status and pipe lastGeneration', async () => {
      const session = createMockSession([makePipe()]);
      sessions.set(session.id, session);
      const pipe = session.pipes[0];

      // Simulate state accumulated through the UI: preset subject + finished gen.
      pipe.subjectReferences[0] = {
        ...pipe.subjectReferences[0],
        type: 'txt2img',
        prompt: 'turn into water',
        status: 'done',
      };
      pipe.lastGeneration = GEN;

      const result = await saveSession(session.id);
      expect(result.errors).toEqual([]);

      expect(invoke).toHaveBeenCalledWith(
        'save_composer',
        expect.objectContaining({
          input: expect.objectContaining({
            pipes: [
              expect.objectContaining({
                id: pipe.id,
                lastGeneration: GEN,
                subjectReferences: [
                  expect.objectContaining({
                    id: 'r1',
                    type: 'txt2img',
                    prompt: 'turn into water',
                    status: 'done',
                  }),
                ],
              }),
            ],
          }),
        }),
      );
    });

    it('sends lastGeneration as null when the pipe has no artifact yet', async () => {
      const session = createMockSession([makePipe()]);
      sessions.set(session.id, session);

      const result = await saveSession(session.id);
      expect(result.errors).toEqual([]);

      const arg = (invoke as ReturnType<typeof vi.fn>).mock.calls[0][1] as {
        input: { pipes: Array<{ lastGeneration: PipeLastGeneration | null }> };
      };
      expect(arg.input.pipes[0].lastGeneration).toBeNull();
    });

    it('applies subject defaults (url/pending) when fields are absent', async () => {
      const session = createMockSession([
        makePipe({
          subjectReferences: [
            { id: 'r1', imageUrl: 'https://example.com/r.jpg', useFrames: false, visible: true },
          ],
        }),
      ]);
      sessions.set(session.id, session);

      await saveSession(session.id);

      const arg = (invoke as ReturnType<typeof vi.fn>).mock.calls[0][1] as {
        input: { pipes: Array<{ subjectReferences: Array<Record<string, unknown>> }> };
      };
      expect(arg.input.pipes[0].subjectReferences[0]).toMatchObject({
        type: 'url',
        status: 'pending',
      });
    });
  });
});
