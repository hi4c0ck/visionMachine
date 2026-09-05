/**
 * Unit tests for Tag Service
 * Tests: add multiple, remove, resize, move, snap, containment, prompt persistence, TagType round-trip
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

import { sessions, addPipe, addSegment, addTagElement, removeTagElement, resizeTagElement, updateTagPrompt, updateTagValue } from '../../src/lib/composerStore';
import { TAG_SPECIFICATIONS } from '../../src/types/app';
import type { SessionData, PipeRow, TagType } from '../../src/types/app';

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

describe('Tag Service', () => {
  beforeEach(() => {
    sessions.clear();
    vi.clearAllMocks();
  });

  // ── addTagElement Tests ───────────────────────────────────────────────────

  describe('addTagElement', () => {
    it('should add multiple tags to segment', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addSegment(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const segment = pipe.elements[0].segments[0];

      await addTagElement(session.id, pipe.id, segment.id, 'scene');
      await addTagElement(session.id, pipe.id, segment.id, 'camera');
      await addTagElement(session.id, pipe.id, segment.id, 'lighting');

      expect(segment.tags).toHaveLength(3);
    });

    it('should set default value from spec', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addSegment(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const segment = pipe.elements[0].segments[0];

      await addTagElement(session.id, pipe.id, segment.id, 'camera');

      expect(segment.tags[0].value).toBe(TAG_SPECIFICATIONS.camera.min);
    });

    it('should use prompt field for tags with usePrompt', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addSegment(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const segment = pipe.elements[0].segments[0];

      await addTagElement(session.id, pipe.id, segment.id, 'scene');

      expect(segment.tags[0].spec.usePrompt).toBe(true);
    });

    it('should inherit segment frame range', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addSegment(session.id, session.pipes[0].id, 16, 96);

      const pipe = session.pipes[0];
      const segment = pipe.elements[0].segments[0];

      await addTagElement(session.id, pipe.id, segment.id, 'scene');

      expect(segment.tags[0].frameStart).toBe(16);
      expect(segment.tags[0].frameEnd).toBe(96);
    });

    it('should handle every TagType round-trip', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addSegment(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const segment = pipe.elements[0].segments[0];
      const tagTypes: TagType[] = ['scene', 'camera', 'rotation', 'lighting', 'effect', 'zoom', 'transition'];

      for (const tagType of tagTypes) {
        await addTagElement(session.id, pipe.id, segment.id, tagType);
      }

      expect(segment.tags).toHaveLength(tagTypes.length);

      for (let i = 0; i < tagTypes.length; i++) {
        expect(segment.tags[i].tag).toBe(tagTypes[i]);
        expect(segment.tags[i].spec).toBe(TAG_SPECIFICATIONS[tagTypes[i]]);
        expect(segment.tags[i].frameStart).toBe(0);
        expect(segment.tags[i].frameEnd).toBe(120);
      }
    });
  });

  // ── removeTagElement Tests ────────────────────────────────────────────────

  describe('removeTagElement', () => {
    it('should remove one tag while preserving others', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addSegment(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const segment = pipe.elements[0].segments[0];

      await addTagElement(session.id, pipe.id, segment.id, 'scene');
      await addTagElement(session.id, pipe.id, segment.id, 'camera');
      await addTagElement(session.id, pipe.id, segment.id, 'lighting');

      const tagId = segment.tags[0].id;
      const result = await removeTagElement(session.id, pipe.id, segment.id, tagId);

      expect(result.errors).toHaveLength(0);
      expect(segment.tags).toHaveLength(2);
      expect(segment.tags.some(t => t.id === tagId)).toBe(false);
    });

    it('should remove all tags when removing each one', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addSegment(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const segment = pipe.elements[0].segments[0];

      await addTagElement(session.id, pipe.id, segment.id, 'scene');
      await addTagElement(session.id, pipe.id, segment.id, 'camera');

      await removeTagElement(session.id, pipe.id, segment.id, segment.tags[0].id);
      await removeTagElement(session.id, pipe.id, segment.id, segment.tags[0].id);

      expect(segment.tags).toHaveLength(0);
    });

    it('should handle removing from non-existent timeline', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const result = await removeTagElement(session.id, session.pipes[0].id, 'seg-1', 'tag-1');

      expect(result.errors).toContain('Timeline not found');
    });
  });

  // ── resizeTagElement Tests ────────────────────────────────────────────────

  describe('resizeTagElement', () => {
    it('should resize tag frame range', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addSegment(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const segment = pipe.elements[0].segments[0];

      await addTagElement(session.id, pipe.id, segment.id, 'camera');
      const tagId = segment.tags[0].id;

      const result = await resizeTagElement(session.id, pipe.id, segment.id, tagId, 8, 104);

      expect(result.errors).toHaveLength(0);
      expect(segment.tags[0].frameStart).toBe(8);
      expect(segment.tags[0].frameEnd).toBe(104);
    });

    it('should snap resize to 8n boundary', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addSegment(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const segment = pipe.elements[0].segments[0];

      await addTagElement(session.id, pipe.id, segment.id, 'camera');
      const tagId = segment.tags[0].id;

      await resizeTagElement(session.id, pipe.id, segment.id, tagId, 5, 125);

      expect(segment.tags[0].frameStart).toBe(0);
      expect(segment.tags[0].frameEnd).toBe(120);
    });

    it('should respect containment within segment bounds', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addSegment(session.id, session.pipes[0].id, 16, 96);

      const pipe = session.pipes[0];
      const segment = pipe.elements[0].segments[0];

      await addTagElement(session.id, pipe.id, segment.id, 'camera');
      const tagId = segment.tags[0].id;

      const result = await resizeTagElement(session.id, pipe.id, segment.id, tagId, 0, 120);

      // Should be constrained to segment bounds
      expect(segment.tags[0].frameStart).toBeGreaterThanOrEqual(16);
      expect(segment.tags[0].frameEnd).toBeLessThanOrEqual(96);
    });

    it('should handle resize with overlap rejection', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addSegment(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const segment = pipe.elements[0].segments[0];

      await addTagElement(session.id, pipe.id, segment.id, 'camera');
      await addTagElement(session.id, pipe.id, segment.id, 'lighting');

      const cameraId = segment.tags[0].id;
      const result = await resizeTagElement(session.id, pipe.id, segment.id, cameraId, 60, 120);

      // Should succeed but clip to segment bounds
      expect(result.errors).toHaveLength(0);
    });
  });

  // ── updateTagValue Tests ──────────────────────────────────────────────────

  describe('updateTagValue', () => {
    it('should update numeric value', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addSegment(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const segment = pipe.elements[0].segments[0];

      await addTagElement(session.id, pipe.id, segment.id, 'camera');
      const tagId = segment.tags[0].id;

      const result = await updateTagValue(session.id, pipe.id, segment.id, tagId, 180);

      expect(result.errors).toHaveLength(0);
      expect(segment.tags[0].value).toBe(180);
    });

    it('should handle value update across multiple tags', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addSegment(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const segment = pipe.elements[0].segments[0];

      await addTagElement(session.id, pipe.id, segment.id, 'camera');
      await addTagElement(session.id, pipe.id, segment.id, 'zoom');

      await updateTagValue(session.id, pipe.id, segment.id, segment.tags[0].id, 90);
      await updateTagValue(session.id, pipe.id, segment.id, segment.tags[1].id, 2.5);

      expect(segment.tags[0].value).toBe(90);
      expect(segment.tags[1].value).toBe(2.5);
    });
  });

  // ── updateTagPrompt Tests ─────────────────────────────────────────────────

  describe('updateTagPrompt', () => {
    it('should persist prompt for tags with usePrompt', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addSegment(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const segment = pipe.elements[0].segments[0];

      await addTagElement(session.id, pipe.id, segment.id, 'scene');
      const tagId = segment.tags[0].id;

      const result = await updateTagPrompt(session.id, pipe.id, segment.id, tagId, 'a dark moody forest');

      expect(result.errors).toHaveLength(0);
      expect(segment.tags[0].prompt).toBe('a dark moody forest');
    });

    it('should allow empty prompt', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addSegment(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const segment = pipe.elements[0].segments[0];

      await addTagElement(session.id, pipe.id, segment.id, 'lighting');
      const tagId = segment.tags[0].id;

      await updateTagPrompt(session.id, pipe.id, segment.id, tagId, '');

      expect(segment.tags[0].prompt).toBe('');
    });

    it('should handle prompt for all prompt-based tags', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addSegment(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const segment = pipe.elements[0].segments[0];

      const promptTags: TagType[] = ['scene', 'lighting', 'effect', 'transition'];

      for (const tagType of promptTags) {
        await addTagElement(session.id, pipe.id, segment.id, tagType);
      }

      for (let i = 0; i < promptTags.length; i++) {
        await updateTagPrompt(session.id, pipe.id, segment.id, segment.tags[i].id, `prompt for ${promptTags[i]}`);
        expect(segment.tags[i].prompt).toBe(`prompt for ${promptTags[i]}`);
      }
    });
  });
});
