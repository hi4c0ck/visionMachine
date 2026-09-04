/**
 * Composer Integration Tests
 * 
 * Tests the full composer pipeline with mocked Tauri backend.
 * Validates: pipe CRUD, timeline management, tag operations, keyframes, migration.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Tauri invoke BEFORE any other imports using hoisted pattern
const mockInvokeModule = vi.hoisted(() => ({
  invoke: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvokeModule.invoke,
}));

const mockInvoke = mockInvokeModule.invoke;

import {
  sessions,
  setOnUpdate,
  addPipe,
  removePipe,
  addGlobalElement,
  addTimelineElement,
  addSegment,
  removeSegment,
  addTagElement,
  removeTagElement,
  resizeTagElement,
  addKeyframe,
  removeKeyframe,
  migratePipe,
  loadSession,
  saveSession,
} from '../../src/lib/composerStore';
import type { SessionData, PipeRow, TagType } from '../../src/types/app';
import { TAG_SPECIFICATIONS } from '../../src/types/app';

describe('Composer Integration', () => {
  beforeEach(() => {
    sessions.clear();
    mockInvoke.mockClear();
    mockInvoke.mockResolvedValue(undefined);
    setOnUpdate(() => {});
  });

  // ── Helper Functions ────────────────────────────────────────────────────

  function createMockSession(pipes: PipeRow[] = []): SessionData {
    return {
      id: 'session-1',
      name: 'Test Session',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      directoryPath: 'C:/projects/test',
      pipes,
      fps: 24,
      resolution: '720p',
      orientation: 'horizontal',
      totalGeneratedFrames: 0,
    };
  }

  // ── Pipe CRUD Tests ─────────────────────────────────────────────────────

  describe('addPipe', () => {
    it('should create a new pipe with default values', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);

      const result = await addPipe(session.id);

      expect(result.errors).toHaveLength(0);
      expect(session.pipes).toHaveLength(1);
      expect(session.pipes[0].name).toBe('Pipe 1');
      expect(session.pipes[0].lengthFrames).toBe(121);
      expect(session.pipes[0].qValue).toBe(18);
      expect(session.pipes[0].cValue).toBe(7);
      expect(session.pipes[0].keyframes).toEqual([]);
      expect(session.pipes[0].elements).toEqual([]);
    });

    it('should increment pipe name numerically', async () => {
      const session = createMockSession([
        { id: 'p1', name: 'Pipe 1', lengthFrames: 121, qValue: 18, cValue: 7, keyframes: [], elements: [], orderIndex: 0 },
        { id: 'p2', name: 'Pipe 2', lengthFrames: 121, qValue: 18, cValue: 7, keyframes: [], elements: [], orderIndex: 1 },
      ]);
      sessions.set(session.id, session);

      await addPipe(session.id);

      expect(session.pipes[2].name).toBe('Pipe 3');
    });

    it('should return error for non-existent session', async () => {
      const result = await addPipe('non-existent');
      expect(result.errors).toEqual(['Session not found']);
    });
  });

  describe('removePipe', () => {
    it('should remove a pipe by ID', async () => {
      const session = createMockSession([
        { id: 'p1', name: 'Pipe 1', lengthFrames: 121, qValue: 18, cValue: 7, keyframes: [], elements: [], orderIndex: 0 },
        { id: 'p2', name: 'Pipe 2', lengthFrames: 121, qValue: 18, cValue: 7, keyframes: [], elements: [], orderIndex: 1 },
      ]);
      sessions.set(session.id, session);

      const result = await removePipe(session.id, 'p1');

      expect(result.errors).toHaveLength(0);
      expect(session.pipes).toHaveLength(1);
      expect(session.pipes[0].id).toBe('p2');
    });

    it('should reorder remaining pipes', async () => {
      const session = createMockSession([
        { id: 'p1', name: 'Pipe 1', lengthFrames: 121, qValue: 18, cValue: 7, keyframes: [], elements: [], orderIndex: 0 },
        { id: 'p2', name: 'Pipe 2', lengthFrames: 121, qValue: 18, cValue: 7, keyframes: [], elements: [], orderIndex: 1 },
        { id: 'p3', name: 'Pipe 3', lengthFrames: 121, qValue: 18, cValue: 7, keyframes: [], elements: [], orderIndex: 2 },
      ]);
      sessions.set(session.id, session);

      await removePipe(session.id, 'p2');

      expect(session.pipes[0].orderIndex).toBe(0);
      expect(session.pipes[1].orderIndex).toBe(1);
    });
  });

  // ── Global Element Tests ────────────────────────────────────────────────

  describe('addGlobalElement', () => {
    it('should add a global style element to pipe', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      const result = await addGlobalElement(session.id, pipe.id, 'dark forest atmosphere');

      expect(result.errors).toHaveLength(0);
      expect(pipe.elements).toHaveLength(1);
      expect(pipe.elements[0]).toMatchObject({
        tag: 'global_style',
        value: 'dark forest atmosphere',
        enabled: true,
      });
    });

    it('should return error for non-existent pipe', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);

      const result = await addGlobalElement(session.id, 'non-existent', 'test');
      expect(result.errors).toEqual(['Pipe not found']);
    });
  });

  // ── Timeline Element Tests ──────────────────────────────────────────────

  describe('addTimelineElement', () => {
    it('should add a timeline element to pipe', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      const result = await addTimelineElement(session.id, pipe.id);

      expect(result.errors).toHaveLength(0);
      expect(pipe.elements).toHaveLength(1);
      expect(pipe.elements[0]).toMatchObject({
        tag: 'timeline',
        segments: [],
      });
    });

    it('should not duplicate timeline element', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      
      const pipe = session.pipes[0];
      await addTimelineElement(session.id, pipe.id);
      const result = await addTimelineElement(session.id, pipe.id);

      expect(result.errors).toHaveLength(0);
      expect(pipe.elements.filter((e: any) => e.tag === 'timeline')).toHaveLength(1);
    });
  });

  // ── Segment Tests ───────────────────────────────────────────────────────

  describe('addSegment', () => {
    it('should add a segment to timeline', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addTimelineElement(session.id, session.pipes[0].id);

      const pipe = session.pipes[0];
      const result = await addSegment(session.id, pipe.id, 0, 120);

      expect(result.errors).toHaveLength(0);
      expect(pipe.elements[0].segments).toHaveLength(1);
      expect(pipe.elements[0].segments[0]).toMatchObject({
        frameStart: 0,
        frameEnd: 120,
        tags: [],
      });
    });

    it('should auto-create timeline if missing', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      const result = await addSegment(session.id, pipe.id, 0, 80);

      expect(result.errors).toHaveLength(0);
      expect(pipe.elements).toHaveLength(1);
      expect(pipe.elements[0].tag).toBe('timeline');
      expect(pipe.elements[0].segments).toHaveLength(1);
    });

    it('should snap frames to 8n boundary', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addTimelineElement(session.id, session.pipes[0].id);
      await addSegment(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const result = await addSegment(session.id, pipe.id, 5, 125);

      expect(result.errors).toHaveLength(0);
      expect(pipe.elements[0].segments[0].frameStart).toBe(0);
      expect(pipe.elements[0].segments[0].frameEnd).toBe(120);
    });
  });

  describe('removeSegment', () => {
    it('should remove a segment by ID', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addTimelineElement(session.id, session.pipes[0].id);
      await addSegment(session.id, session.pipes[0].id, 0, 60);
      await addSegment(session.id, session.pipes[0].id, 61, 120);

      const pipe = session.pipes[0];
      const segmentId = pipe.elements[0].segments[0].id;
      const result = await removeSegment(session.id, pipe.id, segmentId);

      expect(result.errors).toHaveLength(0);
      expect(pipe.elements[0].segments).toHaveLength(1);
    });
  });

  // ── Tag Element Tests ───────────────────────────────────────────────────

  describe('addTagElement', () => {
    it('should add a tag to segment', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addTimelineElement(session.id, session.pipes[0].id);
      await addSegment(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const segment = pipe.elements[0].segments[0];
      const result = await addTagElement(session.id, pipe.id, segment.id, 'scene');

      expect(result.errors).toHaveLength(0);
      expect(segment.tags).toHaveLength(1);
      expect(segment.tags[0]).toMatchObject({
        tag: 'scene',
        frameStart: 0,
        frameEnd: 120,
        spec: TAG_SPECIFICATIONS['scene'],
      });
    });

    it('should set default value from spec', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addTimelineElement(session.id, session.pipes[0].id);
      await addSegment(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const segment = pipe.elements[0].segments[0];
      
      // Camera has min: 0, max: 360
      await addTagElement(session.id, pipe.id, segment.id, 'camera');
      
      expect(segment.tags[0].value).toBe(0); // spec.min
    });

    it('should use prompt field for tags with usePrompt', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addTimelineElement(session.id, session.pipes[0].id);
      await addSegment(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const segment = pipe.elements[0].segments[0];
      
      await addTagElement(session.id, pipe.id, segment.id, 'scene');
      
      expect(segment.tags[0].prompt).toBeUndefined();
      expect(segment.tags[0].spec.usePrompt).toBe(true);
    });

    it('should return error for non-existent timeline', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const result = await addTagElement(session.id, session.pipes[0].id, 'seg-1', 'scene');
      expect(result.errors).toEqual(['Timeline not found']);
    });
  });

  describe('removeTagElement', () => {
    it('should remove a tag by ID', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addTimelineElement(session.id, session.pipes[0].id);
      await addSegment(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const segment = pipe.elements[0].segments[0];
      await addTagElement(session.id, pipe.id, segment.id, 'scene');
      await addTagElement(session.id, pipe.id, segment.id, 'camera');

      const tagId = segment.tags[0].id;
      const result = await removeTagElement(session.id, pipe.id, segment.id, tagId);

      expect(result.errors).toHaveLength(0);
      expect(segment.tags).toHaveLength(1);
    });
  });

  describe('resizeTagElement', () => {
    it('should resize tag frame range', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addTimelineElement(session.id, session.pipes[0].id);
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

    it('should snap frames to 8n boundary', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addTimelineElement(session.id, session.pipes[0].id);
      await addSegment(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const segment = pipe.elements[0].segments[0];
      await addTagElement(session.id, pipe.id, segment.id, 'camera');

      const tagId = segment.tags[0].id;
      const result = await resizeTagElement(session.id, pipe.id, segment.id, tagId, 5, 125);

      // snapTo8(5) = 0, snapTo8(125) = 120
      expect(segment.tags[0].frameStart).toBe(0);
      expect(segment.tags[0].frameEnd).toBe(120);
    });
  });

  // ── Keyframe Tests ──────────────────────────────────────────────────────

  describe('addKeyframe', () => {
    it('should add a keyframe to pipe', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      const result = await addKeyframe(session.id, pipe.id, 0, 0, 'url', 'url');

      expect(result.errors).toHaveLength(0);
      expect(pipe.keyframes).toHaveLength(1);
      expect(pipe.keyframes[0]).toMatchObject({
        slotIndex: 0,
        frame: 0,
        type: 'url',
        imageSrc: 'url',
        status: 'pending',
      });
    });

    it('should handle txt2img type', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      await addKeyframe(session.id, pipe.id, 1, 40, 'txt2img', 'a beautiful sunset');

      expect(pipe.keyframes[0].prompt).toBe('a beautiful sunset');
      expect(pipe.keyframes[0].imageSrc).toBeUndefined();
    });

    it('should handle img2img type', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      const pipe = session.pipes[0];
      await addKeyframe(session.id, pipe.id, 2, 80, 'img2img', 'https://example.com/ref.jpg');

      expect(pipe.keyframes[0].referenceUrl).toBe('https://example.com/ref.jpg');
    });
  });

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
    });
  });

  // ── Migration Tests ─────────────────────────────────────────────────────

  describe('migratePipe', () => {
    it('should not migrate already-migrated pipe', () => {
      const pipe: PipeRow = {
        id: 'p1',
        name: 'Pipe 1',
        lengthFrames: 121,
        qValue: 18,
        cValue: 7,
        keyframes: [],
        elements: [
          { id: 'e1', tag: 'timeline', segments: [] },
        ],
        orderIndex: 0,
      };

      const result = migratePipe(pipe);
      expect(result.elements).toHaveLength(1);
      expect(result.elements[0].tag).toBe('timeline');
    });

    it('should migrate legacy globalNodes', () => {
      const legacyPipe = {
        id: 'p1',
        name: 'Pipe 1',
        lengthFrames: 121,
        qValue: 18,
        cValue: 7,
        keyframes: [],
        globalNodes: [
          { id: 'gn1', tag: 'global_style', value: 'test prompt', enabled: true },
        ],
        segments: [],
        orderIndex: 0,
      };

      const result = migratePipe(legacyPipe as any);
      expect(result.elements).toHaveLength(1);
      expect(result.elements[0].tag).toBe('global_style');
      expect((result.elements[0] as any).value).toBe('test prompt');
    });

    it('should migrate legacy segments', () => {
      const legacyPipe = {
        id: 'p1',
        name: 'Pipe 1',
        lengthFrames: 121,
        qValue: 18,
        cValue: 7,
        keyframes: [],
        globalNodes: [],
        segments: [
          { id: 's1', frameStart: 0, frameEnd: 60, tags: [] },
          { id: 's2', frameStart: 61, frameEnd: 120, tags: [] },
        ],
        orderIndex: 0,
      };

      const result = migratePipe(legacyPipe as any);
      expect(result.elements).toHaveLength(1);
      expect(result.elements[0].tag).toBe('timeline');
      expect((result.elements[0] as any).segments).toHaveLength(2);
    });

    it('should handle empty legacy pipe', () => {
      const legacyPipe = {
        id: 'p1',
        name: 'Pipe 1',
        lengthFrames: 121,
        qValue: 18,
        cValue: 7,
        keyframes: [],
        orderIndex: 0,
      };

      const result = migratePipe(legacyPipe as any);
      expect(result.elements).toHaveLength(0);
    });
  });

  // ── Load/Save Session Tests ─────────────────────────────────────────────

  describe('loadSession', () => {
    it('should load session from backend', async () => {
      mockInvoke.mockResolvedValue({
        id: 'session-1',
        name: 'Test Session',
        pipes: [
          {
            id: 'pipe-1',
            name: 'Pipe 1',
            lengthFrames: 121,
            qValue: 18,
            cValue: 7,
            keyframes: [],
            elements: [],
          },
        ],
      });

      const result = await loadSession('session-1');

      expect(result.errors).toHaveLength(0);
      expect(sessions.has('session-1')).toBe(true);
      expect(sessions.get('session-1')!.pipes).toHaveLength(1);
    });

    it('should handle backend error', async () => {
      mockInvoke.mockRejectedValue(new Error('DB error'));

      const result = await loadSession('session-1');

      expect(result.errors).toEqual(['Failed to load session']);
    });

    it('should map backend pipe data to PipeRow', async () => {
      mockInvoke.mockResolvedValue({
        id: 'session-1',
        name: 'Test',
        pipes: [
          {
            id: 'pipe-1',
            name: 'Pipe 1',
            lengthFrames: 241,
            qValue: 20,
            cValue: 8,
            keyframes: [
              { id: 'kf1', frame: 0, slotIndex: 0, type: 'url', imageSrc: 'img.jpg', status: 'done' },
            ],
            elements: [
              { id: 'el1', tag: 'global_style', value: 'test', enabled: true },
              {
                id: 'el2', tag: 'timeline',
                segments: [
                  {
                    id: 'seg1', frameStart: 0, frameEnd: 120,
                    tags: [
                      { id: 'tag1', tag: 'scene', frameStart: 0, frameEnd: 120, value: 0, spec: TAG_SPECIFICATIONS['scene'] },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });

      await loadSession('session-1');
      const session = sessions.get('session-1')!;

      expect(session.pipes[0].lengthFrames).toBe(241);
      expect(session.pipes[0].qValue).toBe(20);
      expect(session.pipes[0].keyframes).toHaveLength(1);
      expect(session.pipes[0].elements).toHaveLength(2);
      expect(session.pipes[0].elements[1].tag).toBe('timeline');
    });
  });

  describe('saveSession', () => {
    it('should save session to backend', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);

      mockInvoke.mockResolvedValue(undefined);

      const result = await saveSession(session.id);

      expect(result.errors).toHaveLength(0);
      expect(mockInvoke).toHaveBeenCalledWith('save_composer', {
        input: expect.stringContaining('"session_id":"session-1"'),
      });
    });

    it('should return error for non-existent session', async () => {
      const result = await saveSession('non-existent');
      expect(result.errors).toEqual(['Session not found']);
    });
  });

  // ── Full Pipeline Integration Test ──────────────────────────────────────

  describe('Full Composer Pipeline', () => {
    it('should support complete pipe creation workflow', async () => {
      // Create session
      const session = createMockSession();
      sessions.set(session.id, session);

      // Add pipe
      let result = await addPipe(session.id);
      expect(result.errors).toHaveLength(0);

      const pipe = session.pipes[0];

      // Add global style
      result = await addGlobalElement(session.id, pipe.id, 'dark moody atmosphere');
      expect(result.errors).toHaveLength(0);
      expect(pipe.elements.some((e: any) => e.tag === 'global_style')).toBe(true);

      // Add timeline
      result = await addTimelineElement(session.id, pipe.id);
      expect(result.errors).toHaveLength(0);

      // Add segments
      result = await addSegment(session.id, pipe.id, 0, 60);
      expect(result.errors).toHaveLength(0);
      
      result = await addSegment(session.id, pipe.id, 61, 120);
      expect(result.errors).toHaveLength(0);

      const timeline = pipe.elements.find((e: any) => e.tag === 'timeline');

      // Add tags to segments
      result = await addTagElement(session.id, pipe.id, timeline.segments[0].id, 'scene');
      expect(result.errors).toHaveLength(0);
      expect(timeline.segments[0].tags).toHaveLength(1);

      result = await addTagElement(session.id, pipe.id, timeline.segments[0].id, 'camera');
      expect(result.errors).toHaveLength(0);
      expect(timeline.segments[0].tags).toHaveLength(2);

      // Resize tag
      const tagId = timeline.segments[0].tags[0].id;
      result = await resizeTagElement(session.id, pipe.id, timeline.segments[0].id, tagId, 8, 56);
      expect(result.errors).toHaveLength(0);
      expect(timeline.segments[0].tags[0].frameStart).toBe(8);

      // Add keyframes
      result = await addKeyframe(session.id, pipe.id, 0, 0, 'url', 'https://example.com/kf1.jpg');
      expect(result.errors).toHaveLength(0);
      expect(pipe.keyframes).toHaveLength(1);

      // Verify final state
      expect(pipe.elements).toHaveLength(2); // global + timeline
      expect(timeline.segments).toHaveLength(2);
      expect(timeline.segments[0].tags).toHaveLength(2);
      expect(pipe.keyframes).toHaveLength(1);
    });
  });
});
