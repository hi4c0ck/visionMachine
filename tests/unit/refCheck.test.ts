/**
 * Unit tests for refCheck.ts — reference accessibility gate (D5).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  collectRemoteUrls,
  checkRemoteUrls,
  isRemoteUrl,
  type RefUrlTarget,
} from '../../src/lib/refCheck';
import type { PipeRow } from '../../src/types/app';

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

describe('refCheck.isRemoteUrl', () => {
  it('accepts http(s), rejects local paths and other schemes', () => {
    expect(isRemoteUrl('https://a.com/x.png')).toBe(true);
    expect(isRemoteUrl('http://a.com/x.png')).toBe(true);
    expect(isRemoteUrl('C:\\files\\a.png')).toBe(false);
    expect(isRemoteUrl('data:image/png;base64,xx')).toBe(false);
  });
});

describe('refCheck.collectRemoteUrls', () => {
  it('collects url keyframe sources and img2img references', () => {
    const pipe = pipeWith({
      keyframes: [
        { id: 'k1', frame: 0, slotIndex: 1, type: 'url', imageSrc: 'https://a.com/k1.png', status: 'pending' },
        { id: 'k2', frame: 8, slotIndex: 2, type: 'txt2img', prompt: 'a cat', status: 'pending' },
        {
          id: 'k3',
          frame: 16,
          slotIndex: 3,
          type: 'img2img',
          referenceUrl: 'https://a.com/ref.png',
          prompt: 'remix',
          status: 'pending',
        },
      ],
    });
    const targets = collectRemoteUrls(pipe);
    expect(targets).toEqual([
      { refKind: 'keyframe', refId: 'k1', url: 'https://a.com/k1.png' },
      { refKind: 'keyframe', refId: 'k3', url: 'https://a.com/ref.png' },
    ]);
  });

  it('collects subject references per preset type (url/img2img use imageUrl, txt2img does not)', () => {
    const pipe = pipeWith({
      mediaMode: 'reference',
      subjectReferences: [
        { id: 's1', imageUrl: 'https://a.com/s1.png', useFrames: false, visible: true, type: 'url' },
        { id: 's2', imageUrl: '', useFrames: false, visible: true, type: 'txt2img', prompt: 'hero' },
        { id: 's3', imageUrl: 'https://a.com/s3.png', useFrames: false, visible: true, type: 'img2img', prompt: 'x' },
        { id: 's4', imageUrl: 'C:\\local\\s4.png', useFrames: false, visible: true, type: 'url' },
      ],
    });
    const targets = collectRemoteUrls(pipe);
    expect(targets.map((t: RefUrlTarget) => t.refId)).toEqual(['s1', 's3']);
  });

  it('skips subjects in keyframes mode (subjects are inert there)', () => {
    const pipe = pipeWith({
      mediaMode: 'keyframes',
      subjectReferences: [
        { id: 's1', imageUrl: 'https://a.com/s1.png', useFrames: false, visible: true, type: 'url' },
        { id: 's2', imageUrl: 'https://a.com/s2.png', useFrames: false, visible: true, type: 'img2img' },
      ],
    });
    // Plain keyframes mode, non-sharedArray model → no subject targets.
    expect(collectRemoteUrls(pipe)).toEqual([]);
    // sharedArray model → subjects merge into the keyframe array, still checked.
    expect(collectRemoteUrls(pipe, { sharedArray: true }).map((t) => t.refId)).toEqual(['s1', 's2']);
  });

  it('skips url subjects with an empty imageUrl (nothing to check)', () => {
    const pipe = pipeWith({
      mediaMode: 'reference',
      subjectReferences: [
        { id: 's1', imageUrl: '', useFrames: false, visible: true, type: 'url' },
        { id: 's2', imageUrl: 'https://a.com/s2.png', useFrames: false, visible: true, type: 'url' },
      ],
    });
    expect(collectRemoteUrls(pipe).map((t) => t.refId)).toEqual(['s2']);
  });
});

describe('refCheck.checkRemoteUrls', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('returns empty when all urls are reachable', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    const targets = [
      { refKind: 'keyframe', refId: 'k1', url: 'https://a.com/k1.png' },
      { refKind: 'subject', refId: 's1', url: 'C:\\local\\s1.png' },
    ];
    const broken = await checkRemoteUrls(targets);
    expect(broken).toEqual([]);
    // only the remote target was actually fetched
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('marks unreachable urls as broken (http error)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });
    const targets = [{ refKind: 'keyframe', refId: 'k1', url: 'https://a.com/k1.png' }];
    const broken = await checkRemoteUrls(targets);
    expect(broken.map((t) => t.refId)).toEqual(['k1']);
  });

  it('marks network failures as broken', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    const targets = [{ refKind: 'subject', refId: 's1', url: 'https://a.com/s1.png' }];
    const broken = await checkRemoteUrls(targets);
    expect(broken.map((t) => t.refId)).toEqual(['s1']);
  });

  it('marks a target as broken when the fetch times out', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_url: string, opts: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        opts?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        // never resolves on its own
      });
    });
    const targets = [{ refKind: 'keyframe', refId: 'k1', url: 'https://slow.example/x.png' }];
    const p = checkRemoteUrls(targets, 100);
    await vi.advanceTimersByTimeAsync(150);
    const broken = await p;
    expect(broken.map((t) => t.refId)).toEqual(['k1']);
  });
});
