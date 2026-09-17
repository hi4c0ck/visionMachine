/**
 * Unit tests for prechecks.ts — model/pipe pre-checks (E4/E6) and
 * seconds preview (E5), docs/provider-engine-tasks.md Phase A.
 */
import { describe, it, expect } from 'vitest';
import { pipePrechecks, secondsPreview } from '../../src/lib/settings/prechecks';
import type { ModelSpec, PipeRow, SessionData } from '../../src/types';

function sessionWith(overrides: Partial<SessionData> = {}): SessionData {
  return {
    id: 's1',
    name: 'S',
    createdAt: 0,
    updatedAt: 0,
    directoryPath: '',
    pipes: [],
    fps: 24,
    resolution: '720p',
    orientation: 'horizontal',
    totalGeneratedFrames: 0,
    ...overrides,
  };
}

function pipeWith(overrides: Partial<PipeRow> = {}): PipeRow {
  return {
    id: 'p1',
    name: 'P',
    lengthFrames: 121,
    qValue: 18,
    cValue: 7,
    keyframes: [],
    subjectReferences: [],
    elements: [],
    orderIndex: 0,
    ...overrides,
  };
}

function framesSpec(overrides: Partial<ModelSpec> = {}): ModelSpec {
  return {
    id: 'v-frames',
    kind: 'video',
    endpoint: '/v1/videos',
    sync: false,
    requestFormat: 'video-job-frames',
    limits: { fps: [18, 24, 30, 48, 60], maxFrames: 441 },
    ...overrides,
  };
}

function secondsSpec(overrides: Partial<ModelSpec> = {}): ModelSpec {
  return {
    id: 'v-seconds',
    kind: 'video',
    endpoint: '/v1/videos',
    sync: false,
    requestFormat: 'video-job-seconds',
    limits: { seconds: [4, 12] },
    ...overrides,
  };
}

describe('pipePrechecks — spec gates', () => {
  it('blocks when the video spec is missing or pending', () => {
    const c1 = pipePrechecks(pipeWith(), sessionWith(), null, null);
    expect(c1.map((c) => c.code)).toContain('spec-pending');

    const c2 = pipePrechecks(
      pipeWith(),
      sessionWith(),
      null,
      secondsSpec({ pending: true }),
    );
    expect(c2.map((c) => c.code)).toContain('spec-pending');
  });

  it('blocks a pending image spec', () => {
    const img = { ...framesSpec({ id: 'i', kind: 'image', requestFormat: 'image-gen' }), pending: true };
    const c = pipePrechecks(pipeWith(), sessionWith(), img, secondsSpec());
    expect(c.map((c) => c.code)).toContain('spec-pending');
  });
});

describe('pipePrechecks — frames model (8n+1 / overflow / fps)', () => {
  const sess = sessionWith();
  const spec = framesSpec();

  it('passes a valid 8n+1 length within maxFrames on-grid fps', () => {
    const c = pipePrechecks(pipeWith({ lengthFrames: 121 }), sess, null, spec);
    expect(c).toEqual([]);
  });

  it('names the 8n+1 conflict with nearest valid lengths', () => {
    const c = pipePrechecks(pipeWith({ lengthFrames: 120 }), sess, null, spec);
    const hit = c.find((x) => x.code === 'not-8n1');
    expect(hit).toBeTruthy();
    expect(hit!.message).toContain('120');
    // 120-4=116 → snap 113; 120+4=124 → snap 121
    expect(hit!.message).toContain('use 113 or 121');
  });

  it('blocks a length overflow past maxFrames', () => {
    const c = pipePrechecks(
      pipeWith({ lengthFrames: 449 }),
      sess,
      null,
      framesSpec({ limits: { maxFrames: 441, fps: [18, 24, 30, 48, 60] } }),
    );
    expect(c.map((x) => x.code)).toContain('frames-overflow');
  });

  it('blocks an off-grid session fps', () => {
    const c = pipePrechecks(pipeWith({ lengthFrames: 121 }), sessionWith({ fps: 32 }), null, spec);
    const hit = c.find((x) => x.code === 'fps-off-grid');
    expect(hit).toBeTruthy();
    expect(hit!.message).toContain('32');
    expect(hit!.message).toContain('18, 24, 30, 48, 60');
  });

  it('skips 8n+1/fps checks for seconds-based models', () => {
    const c = pipePrechecks(pipeWith({ lengthFrames: 120 }), sess, null, secondsSpec());
    expect(c.map((x) => x.code)).not.toContain('not-8n1');
    expect(c.map((x) => x.code)).not.toContain('fps-off-grid');
  });
});

describe('pipePrechecks — media caps (E4)', () => {
  const sess = sessionWith();

  it('sharedArray: caps the combined keyframe+subject count', () => {
    const spec = framesSpec({
      media: { modes: ['keyframes'], sharedArray: true, maxKeyframes: 3, maxRefs: 3 },
    });
    const ok = pipePrechecks(
      pipeWith({
        keyframes: [1, 2].map((i) => ({ id: `k${i}`, frame: 0, slotIndex: i as 1 | 2 | 3, type: 'url', status: 'pending' })),
        subjectReferences: [
          { id: 's1', imageUrl: '', useFrames: false, visible: true, type: 'url' },
        ],
      }),
      sess,
      null,
      spec,
    );
    expect(ok).toEqual([]);

    const over = pipePrechecks(
      pipeWith({
        keyframes: [1, 2, 3].map((i) => ({ id: `k${i}`, frame: 0, slotIndex: i as 1 | 2 | 3, type: 'url', status: 'pending' })),
        subjectReferences: [
          { id: 's1', imageUrl: '', useFrames: false, visible: true, type: 'url' },
        ],
      }),
      sess,
      null,
      spec,
    );
    expect(over.map((c) => c.code)).toContain('media-cap');
  });

  it('keyframes mode: caps keyframe count, ignores subjects', () => {
    const spec = secondsSpec({
      media: { modes: ['keyframes', 'reference'], maxKeyframes: 2, maxRefs: 5 },
    });
    const c = pipePrechecks(
      pipeWith({
        mediaMode: 'keyframes',
        keyframes: [1, 2, 3].map((i) => ({ id: `k${i}`, frame: 0, slotIndex: i as 1 | 2 | 3, type: 'url', status: 'pending' })),
      }),
      sess,
      null,
      spec,
    );
    expect(c.map((x) => x.code)).toContain('media-cap');
  });

  it('reference mode: caps subject count', () => {
    const spec = secondsSpec({
      media: { modes: ['keyframes', 'reference'], maxKeyframes: 2, maxRefs: 1 },
    });
    const c = pipePrechecks(
      pipeWith({
        mediaMode: 'reference',
        subjectReferences: [
          { id: 's1', imageUrl: '', useFrames: false, visible: true, type: 'url' },
          { id: 's2', imageUrl: '', useFrames: false, visible: true, type: 'url' },
        ],
      }),
      sess,
      null,
      spec,
    );
    expect(c.map((x) => x.code)).toContain('media-cap');
  });

  it('no media rules → no caps', () => {
    const c = pipePrechecks(
      pipeWith({
        keyframes: Array.from({ length: 9 }, (_, i) => ({ id: `k${i}`, frame: 0, slotIndex: 1 as 1 | 2 | 3, type: 'url', status: 'pending' })),
        subjectReferences: Array.from({ length: 7 }, (_, i) => ({ id: `s${i}`, imageUrl: '', useFrames: false, visible: true, type: 'url' })),
      }),
      sess,
      null,
      secondsSpec(),
    );
    expect(c.map((x) => x.code)).not.toContain('media-cap');
  });
});

describe('pipePrechecks — txt2img prompt rule (O1)', () => {
  it('requires a prompt only on txt2img pieces', () => {
    const c = pipePrechecks(
      pipeWith({
        keyframes: [
          { id: 'k1', frame: 0, slotIndex: 1, type: 'txt2img', status: 'pending' },
          { id: 'k2', frame: 8, slotIndex: 2, type: 'txt2img', prompt: 'a cat', status: 'pending' },
          { id: 'k3', frame: 16, slotIndex: 3, type: 'img2img', prompt: 'x', status: 'pending' },
          { id: 'k4', frame: 24, slotIndex: 1, type: 'url', status: 'pending' },
        ],
        subjectReferences: [
          { id: 's1', imageUrl: '', useFrames: false, visible: true, type: 'txt2img' },
        ],
      }),
      sessionWith(),
      null,
      secondsSpec(),
    );
    const hits = c.filter((x) => x.code === 'txt2img-no-prompt');
    expect(hits.map((x) => x.message)).toEqual([
      'keyframe 1 (txt2img) needs a prompt',
      'subject s1 (txt2img) needs a prompt',
    ]);
  });
});

describe('secondsPreview (E5)', () => {
  const sess = sessionWith({ fps: 24 });
  const spec = secondsSpec();

  it('shows the 1-decimal clamped value', () => {
    // 121 frames / 24fps = 5.04s → "5.0", unclamped
    const p = secondsPreview(pipeWith({ lengthFrames: 121 }), sess, spec);
    expect(p.shown).toBe('5.0');
    expect(p.clamped).toBe(false);
  });

  it('clamps into the [4, 12] range and flags it', () => {
    // 61 frames / 24fps = 2.54s → clamped to 4.0
    const p = secondsPreview(pipeWith({ lengthFrames: 61 }), sess, spec);
    expect(p.shown).toBe('4.0');
    expect(p.clamped).toBe(true);
    // 300 frames / 24fps = 12.5s → clamped to 12.0
    const p2 = secondsPreview(pipeWith({ lengthFrames: 300 }), sess, spec);
    expect(p2.shown).toBe('12.0');
    expect(p2.clamped).toBe(true);
  });

  it('no seconds limits → raw value, never clamped', () => {
    const p = secondsPreview(pipeWith({ lengthFrames: 61 }), sess, secondsSpec({ limits: {} }));
    expect(p.shown).toBe('2.5');
    expect(p.clamped).toBe(false);
  });
});
