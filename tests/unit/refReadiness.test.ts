/**
 * Unit tests for refReadiness.ts — the status dot on keyframe / subject
 * chips (green = settled asset, red = broken, neutral = pending) and the
 * queue-for-regenerate semantics behind it (non-destructive: ref data is
 * kept, a flag drives the next run).
 */
import { describe, it, expect } from 'vitest';
import { refDotState, brokenKey, type RefDotSource } from '../../src/lib/refReadiness';
import { queueRefRegen, attachGeneratedImage } from '../../src/lib/composerStore';

function ref(overrides: Partial<RefDotSource> = {}): RefDotSource {
  return {
    type: 'url',
    url: undefined,
    status: undefined,
    ...overrides,
  };
}

describe('refDotState — url pieces', () => {
  it('green when the URL is present and not in the broken set', () => {
    expect(refDotState('p1', 's1', ref({ type: 'url', url: 'https://a.com/x.png' }))).toBe('ready');
  });

  it('red when the URL is empty', () => {
    expect(refDotState('p1', 's1', ref({ type: 'url', url: '' }))).toBe('broken');
    expect(refDotState('p1', 's1', ref({ type: 'url', url: undefined }))).toBe('broken');
  });

  it('red when the D5 broken set contains the key', () => {
    const broken = new Set([brokenKey('p1', 's1')]);
    expect(refDotState('p1', 's1', ref({ type: 'url', url: 'https://a.com/x.png' }), broken)).toBe('broken');
  });

  it('does not flag a sibling ref that is not broken', () => {
    const broken = new Set([brokenKey('p1', 's1')]);
    expect(refDotState('p1', 's2', ref({ type: 'url', url: 'https://a.com/y.png' }), broken)).toBe('ready');
  });
});

describe('refDotState — generated pieces (txt2img / img2img)', () => {
  it('green when a settled preview is linked (remote or local)', () => {
    expect(
      refDotState('p1', 'k1', ref({ type: 'txt2img', status: 'done', previewRemoteUrl: 'https://cdn.test/o.png' })),
    ).toBe('ready');
    expect(
      refDotState('p1', 'k1', ref({ type: 'img2img', status: 'done', previewLocalPath: 'C:/media/o.png' })),
    ).toBe('ready');
  });

  it('neutral when nothing was generated yet', () => {
    expect(refDotState('p1', 'k1', ref({ type: 'txt2img', status: 'pending' }))).toBe('pending');
    expect(refDotState('p1', 'k1', ref({ type: 'img2img', status: undefined }))).toBe('pending');
  });

  it('red when the last run errored on this piece, even with a stale preview', () => {
    expect(
      refDotState(
        'p1',
        'k1',
        ref({ type: 'txt2img', status: 'error', previewRemoteUrl: 'https://cdn.test/stale.png' }),
      ),
    ).toBe('broken');
  });

  it('img2img uses the generated preview, not the reference URL, as the readiness source', () => {
    // A reference URL alone (no generation yet) must NOT read green.
    expect(
      refDotState('p1', 'k1', ref({ type: 'img2img', url: 'https://a.com/ref.png' })),
    ).toBe('pending');
  });
});

describe('queueRefRegen — non-destructive regenerate flag', () => {
  async function seedSettledSession(sessionId: string) {
    const { hydrateSessions, composerStore } = await import('../../src/lib/composerStore');
    hydrateSessions([
      {
        id: sessionId,
        name: 'S',
        fps: 24,
        resolution: '720p',
        orientation: 'horizontal',
        createdAt: 0,
        updatedAt: 0,
        directoryPath: '',
        totalGeneratedFrames: 0,
        pipes: [
          {
            id: 'p1',
            name: 'P',
            lengthFrames: 121,
            qValue: 18,
            cValue: 7,
            mediaMode: 'keyframes',
            orderIndex: 0,
            keyframes: [
              {
                id: 'k1',
                frame: 0,
                slotIndex: 1,
                type: 'txt2img',
                prompt: 'a cat',
                status: 'done',
                previewRemoteUrl: 'https://cdn.test/k1.png',
                previewLocalPath: 'C:/media/k1.png',
              },
            ],
            subjectReferences: [
              {
                id: 's1',
                imageUrl: '',
                type: 'txt2img',
                prompt: 'a dog',
                status: 'done',
                previewRemoteUrl: 'https://cdn.test/s1.png',
                useFrames: false,
              },
            ],
            elements: [],
          },
        ],
      },
    ]);
    return composerStore.sessions.get(sessionId)!.pipes[0];
  }

  it('sets the flag without touching the settled preview data', async () => {
    const pipe = await seedSettledSession('s1');
    const rk = await queueRefRegen('s1', 'p1', 'keyframe', 'k1');
    expect(rk.errors).toEqual([]);
    // The flag is set; the settled data is INTACT (the asset stays valid).
    expect(pipe.keyframes[0].forceRegen).toBe(true);
    expect(pipe.keyframes[0].previewRemoteUrl).toBe('https://cdn.test/k1.png');
    expect(pipe.keyframes[0].previewLocalPath).toBe('C:/media/k1.png');
    expect(pipe.keyframes[0].status).toBe('done');

    const rs = await queueRefRegen('s1', 'p1', 'subject', 's1');
    expect(rs.errors).toEqual([]);
    expect(pipe.subjectReferences[0].forceRegen).toBe(true);
    expect(pipe.subjectReferences[0].previewRemoteUrl).toBe('https://cdn.test/s1.png');
  });

  it('attachGeneratedImage clears a queued flag (the run satisfied it)', async () => {
    const pipe = await seedSettledSession('s2');
    await queueRefRegen('s2', 'p1', 'keyframe', 'k1');
    expect(pipe.keyframes[0].forceRegen).toBe(true);

    const r = await attachGeneratedImage(
      's2', 'p1', 'keyframe', 'k1',
      'C:/media/k1-fresh.png',
      'https://cdn.test/k1-fresh.png',
    );
    expect(r.errors).toEqual([]);
    // Fresh artifact attached: the queued flag is gone, the preview updated.
    expect(pipe.keyframes[0].forceRegen).toBeUndefined();
    expect(pipe.keyframes[0].previewRemoteUrl).toBe('https://cdn.test/k1-fresh.png');
    expect(pipe.keyframes[0].previewLocalPath).toBe('C:/media/k1-fresh.png');
  });

  it('unknown ref ids are a concrete error, not a silent pass', async () => {
    const { hydrateSessions } = await import('../../src/lib/composerStore');
    hydrateSessions([
      {
        id: 's3',
        name: 'S',
        fps: 24,
        resolution: '720p',
        orientation: 'horizontal',
        createdAt: 0,
        updatedAt: 0,
        directoryPath: '',
        totalGeneratedFrames: 0,
        pipes: [
          {
            id: 'p1',
            name: 'P',
            lengthFrames: 121,
            qValue: 18,
            cValue: 7,
            mediaMode: 'keyframes',
            orderIndex: 0,
            keyframes: [],
            subjectReferences: [],
            elements: [],
          },
        ],
      },
    ]);
    const r = await queueRefRegen('s3', 'p1', 'keyframe', 'nope');
    expect(r.errors).toEqual(['Reference not found']);
  });
});
