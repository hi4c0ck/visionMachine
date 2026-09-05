/**
 * Unit tests for Rust/Backend Conversion
 * Tests: Scene, Camera, Rotation, Lighting, Effect, Zoom, Transition round-trips
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

import { sessions, addPipe, addSegment, addTagElement } from '../../src/lib/composerStore';
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

// Simulate Rust conversion function
function convertSegmentToRustFormat(
  segment: any,
  tags: any[]
): Record<string, any> {
  const result: Record<string, any> = {};
  
  for (const tag of tags) {
    const spec = TAG_SPECIFICATIONS[tag.tag as TagType];
    if (!spec) continue;
    
    const entry: Record<string, any> = {
      frameStart: tag.frameStart,
      frameEnd: tag.frameEnd,
    };
    
    if (spec.usePrompt) {
      entry.prompt = tag.prompt || '';
    } else {
      entry.value = tag.value;
    }
    
    result[tag.tag] = entry;
  }
  
  return result;
}

describe('Rust Conversion', () => {
  beforeEach(() => {
    sessions.clear();
    vi.clearAllMocks();
  });

  // ── Scene Conversion Tests ────────────────────────────────────────────────

  describe('Scene conversion', () => {
    it('should round-trip scene tag', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addSegment(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const segment = pipe.elements[0].segments[0];
      await addTagElement(session.id, pipe.id, segment.id, 'scene');

      // Set prompt
      segment.tags[0].prompt = 'a dark forest at night';

      const converted = convertSegmentToRustFormat(segment, segment.tags);
      expect(converted.scene).toBeDefined();
      expect(converted.scene.prompt).toBe('a dark forest at night');
      expect(converted.scene.frameStart).toBe(0);
      expect(converted.scene.frameEnd).toBe(120);
    });

    it('should handle empty scene prompt', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addSegment(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const segment = pipe.elements[0].segments[0];
      await addTagElement(session.id, pipe.id, segment.id, 'scene');

      const converted = convertSegmentToRustFormat(segment, segment.tags);
      expect(converted.scene.prompt).toBe('');
    });
  });

  // ── Camera Conversion Tests ───────────────────────────────────────────────

  describe('Camera conversion', () => {
    it('should round-trip camera tag', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addSegment(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const segment = pipe.elements[0].segments[0];
      await addTagElement(session.id, pipe.id, segment.id, 'camera');

      // Set value
      segment.tags[0].value = 180;

      const converted = convertSegmentToRustFormat(segment, segment.tags);
      expect(converted.camera).toBeDefined();
      expect(converted.camera.value).toBe(180);
      expect(converted.camera.frameStart).toBe(0);
      expect(converted.camera.frameEnd).toBe(120);
    });

    it('should handle camera min value', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addSegment(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const segment = pipe.elements[0].segments[0];
      await addTagElement(session.id, pipe.id, segment.id, 'camera');

      // Default value should be spec.min
      expect(segment.tags[0].value).toBe(TAG_SPECIFICATIONS.camera.min);

      const converted = convertSegmentToRustFormat(segment, segment.tags);
      expect(converted.camera.value).toBe(0);
    });

    it('should handle camera max value', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addSegment(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const segment = pipe.elements[0].segments[0];
      await addTagElement(session.id, pipe.id, segment.id, 'camera');

      segment.tags[0].value = 360;

      const converted = convertSegmentToRustFormat(segment, segment.tags);
      expect(converted.camera.value).toBe(360);
    });
  });

  // ── Rotation Conversion Tests ─────────────────────────────────────────────

  describe('Rotation conversion', () => {
    it('should round-trip rotation tag', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addSegment(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const segment = pipe.elements[0].segments[0];
      await addTagElement(session.id, pipe.id, segment.id, 'rotation');

      segment.tags[0].value = 90;

      const converted = convertSegmentToRustFormat(segment, segment.tags);
      expect(converted.rotation).toBeDefined();
      expect(converted.rotation.value).toBe(90);
    });

    it('should handle negative rotation values', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addSegment(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const segment = pipe.elements[0].segments[0];
      await addTagElement(session.id, pipe.id, segment.id, 'rotation');

      segment.tags[0].value = -45;

      const converted = convertSegmentToRustFormat(segment, segment.tags);
      expect(converted.rotation.value).toBe(-45);
    });

    it('should handle rotation max value', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addSegment(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const segment = pipe.elements[0].segments[0];
      await addTagElement(session.id, pipe.id, segment.id, 'rotation');

      segment.tags[0].value = 180;

      const converted = convertSegmentToRustFormat(segment, segment.tags);
      expect(converted.rotation.value).toBe(180);
    });
  });

  // ── Lighting Conversion Tests ─────────────────────────────────────────────

  describe('Lighting conversion', () => {
    it('should round-trip lighting tag', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addSegment(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const segment = pipe.elements[0].segments[0];
      await addTagElement(session.id, pipe.id, segment.id, 'lighting');

      segment.tags[0].prompt = 'soft ambient light from left';

      const converted = convertSegmentToRustFormat(segment, segment.tags);
      expect(converted.lighting).toBeDefined();
      expect(converted.lighting.prompt).toBe('soft ambient light from left');
    });

    it('should handle empty lighting prompt', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addSegment(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const segment = pipe.elements[0].segments[0];
      await addTagElement(session.id, pipe.id, segment.id, 'lighting');

      const converted = convertSegmentToRustFormat(segment, segment.tags);
      expect(converted.lighting.prompt).toBe('');
    });
  });

  // ── Effect Conversion Tests ───────────────────────────────────────────────

  describe('Effect conversion', () => {
    it('should round-trip effect tag', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addSegment(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const segment = pipe.elements[0].segments[0];
      await addTagElement(session.id, pipe.id, segment.id, 'effect');

      segment.tags[0].prompt = 'bloom and lens flare';

      const converted = convertSegmentToRustFormat(segment, segment.tags);
      expect(converted.effect).toBeDefined();
      expect(converted.effect.prompt).toBe('bloom and lens flare');
    });

    it('should handle complex effect prompts', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addSegment(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const segment = pipe.elements[0].segments[0];
      await addTagElement(session.id, pipe.id, segment.id, 'effect');

      segment.tags[0].prompt = 'chromatic aberration, film grain, vignette, color grading';

      const converted = convertSegmentToRustFormat(segment, segment.tags);
      expect(converted.effect.prompt).toBe('chromatic aberration, film grain, vignette, color grading');
    });
  });

  // ── Zoom Conversion Tests ─────────────────────────────────────────────────

  describe('Zoom conversion', () => {
    it('should round-trip zoom tag', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addSegment(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const segment = pipe.elements[0].segments[0];
      await addTagElement(session.id, pipe.id, segment.id, 'zoom');

      segment.tags[0].value = 2.5;

      const converted = convertSegmentToRustFormat(segment, segment.tags);
      expect(converted.zoom).toBeDefined();
      expect(converted.zoom.value).toBe(2.5);
    });

    it('should handle zoom min value', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addSegment(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const segment = pipe.elements[0].segments[0];
      await addTagElement(session.id, pipe.id, segment.id, 'zoom');

      // Default should be spec.min
      expect(segment.tags[0].value).toBe(TAG_SPECIFICATIONS.zoom.min);

      const converted = convertSegmentToRustFormat(segment, segment.tags);
      expect(converted.zoom.value).toBe(0.5);
    });

    it('should handle zoom max value', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addSegment(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const segment = pipe.elements[0].segments[0];
      await addTagElement(session.id, pipe.id, segment.id, 'zoom');

      segment.tags[0].value = 5;

      const converted = convertSegmentToRustFormat(segment, segment.tags);
      expect(converted.zoom.value).toBe(5);
    });
  });

  // ── Transition Conversion Tests ───────────────────────────────────────────

  describe('Transition conversion', () => {
    it('should round-trip transition tag', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addSegment(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const segment = pipe.elements[0].segments[0];
      await addTagElement(session.id, pipe.id, segment.id, 'transition');

      segment.tags[0].prompt = 'fade to black';

      const converted = convertSegmentToRustFormat(segment, segment.tags);
      expect(converted.transition).toBeDefined();
      expect(converted.transition.prompt).toBe('fade to black');
    });

    it('should handle empty transition prompt', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addSegment(session.id, session.pipes[0].id, 0, 120);

      const pipe = session.pipes[0];
      const segment = pipe.elements[0].segments[0];
      await addTagElement(session.id, pipe.id, segment.id, 'transition');

      const converted = convertSegmentToRustFormat(segment, segment.tags);
      expect(converted.transition.prompt).toBe('');
    });
  });

  // ── Full Round-Trip Tests ─────────────────────────────────────────────────

  describe('Full round-trip', () => {
    it('should convert all TagTypes in single segment', async () => {
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

      // Set values/prompts
      segment.tags[0].prompt = 'test scene';
      segment.tags[1].value = 180;
      segment.tags[2].value = 45;
      segment.tags[3].prompt = 'test lighting';
      segment.tags[4].prompt = 'test effect';
      segment.tags[5].value = 2;
      segment.tags[6].prompt = 'test transition';

      const converted = convertSegmentToRustFormat(segment, segment.tags);

      expect(converted.scene.prompt).toBe('test scene');
      expect(converted.camera.value).toBe(180);
      expect(converted.rotation.value).toBe(45);
      expect(converted.lighting.prompt).toBe('test lighting');
      expect(converted.effect.prompt).toBe('test effect');
      expect(converted.zoom.value).toBe(2);
      expect(converted.transition.prompt).toBe('test transition');
    });

    it('should preserve frame ranges across all conversions', async () => {
      const session = createMockSession();
      sessions.set(session.id, session);
      await addPipe(session.id);
      await addSegment(session.id, session.pipes[0].id, 16, 96);

      const pipe = session.pipes[0];
      const segment = pipe.elements[0].segments[0];
      await addTagElement(session.id, pipe.id, segment.id, 'scene');
      await addTagElement(session.id, pipe.id, segment.id, 'camera');

      const converted = convertSegmentToRustFormat(segment, segment.tags);

      expect(converted.scene.frameStart).toBe(16);
      expect(converted.scene.frameEnd).toBe(96);
      expect(converted.camera.frameStart).toBe(16);
      expect(converted.camera.frameEnd).toBe(96);
    });
  });
});
