/**
 * Unit tests for mediaMode.ts — content-aware wire-mode resolution
 * (frontend mirror of Rust's `seconds_mode_wire`), the ComposerPanel
 * downgrade note behavior, and the non-blocking cap-against-effective-mode
 * precheck.
 */
import { describe, it, expect } from 'vitest';
import { effectiveMediaMode, mediaLockMismatch, pipeMediaContent } from '../../src/lib/settings/mediaMode';
import { pipePrechecks } from '../../src/lib/settings/prechecks';
import type { ModelSpec, PipeKeyframe, PipeRow, SessionData, SubjectReference } from '../../src/types';

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

// Typed fixtures: unannotated object literals widen `type`/`status` to
// `string`, which no longer satisfies the `KeyframeType`/`GenerationStatus`
// unions the prechecks consume.
const kf = (i: number): PipeKeyframe => ({
  id: `k${i}`,
  frame: 0,
  slotIndex: i,
  type: 'url',
  status: 'pending',
});
const subj = (i: number): SubjectReference => ({
  id: `s${i}`,
  imageUrl: '',
  useFrames: false,
  visible: true,
  type: 'url',
});

describe('effectiveMediaMode — mirror of Rust seconds_mode_wire', () => {
  const dual = { modes: ['keyframes', 'reference'] };

  it('lock wins when its kind has content', () => {
    expect(effectiveMediaMode(pipeWith({ mediaMode: 'keyframes', keyframes: [kf(1)] }), dual)).toBe('keyframe');
    expect(effectiveMediaMode(pipeWith({ mediaMode: 'reference', subjectReferences: [subj(1)] }), dual)).toBe('reference');
  });

  it('cross-falls to the other kind when the locked kind is empty', () => {
    // Locked keyframes, no keyframes, but subjects present + supported → reference.
    expect(effectiveMediaMode(pipeWith({ mediaMode: 'keyframes', subjectReferences: [subj(1)] }), dual)).toBe('reference');
    // Locked reference, no subjects, but keyframes present → keyframe.
    expect(effectiveMediaMode(pipeWith({ mediaMode: 'reference', keyframes: [kf(1)] }), dual)).toBe('keyframe');
  });

  it('falls to text when neither kind has content', () => {
    expect(effectiveMediaMode(pipeWith({ mediaMode: 'keyframes' }), dual)).toBe('text');
    expect(effectiveMediaMode(pipeWith({ mediaMode: 'reference' }), dual)).toBe('text');
  });

  it('gates on the model supported modes', () => {
    // keyframes-only model: a locked reference pipe cross-falls to keyframe
    // when keyframes have content, else text — reference is unsupported.
    const kfOnly = { modes: ['keyframes'] };
    expect(effectiveMediaMode(pipeWith({ mediaMode: 'reference', keyframes: [kf(1)] }), kfOnly)).toBe('keyframe');
    expect(effectiveMediaMode(pipeWith({ mediaMode: 'reference', subjectReferences: [subj(1)] }), kfOnly)).toBe('text');
  });

  it('unknown models (no media rules) keep the stored lock as-is', () => {
    expect(effectiveMediaMode(pipeWith({ mediaMode: 'reference' }), undefined)).toBe('reference');
    expect(effectiveMediaMode(pipeWith({ mediaMode: 'keyframes' }), { modes: [] })).toBe('keyframe');
  });
});

describe('mediaLockMismatch', () => {
  it('true only when the effective mode fell away from the lock', () => {
    expect(mediaLockMismatch(pipeWith({ mediaMode: 'keyframes', keyframes: [kf(1)] }), { modes: ['keyframes', 'reference'] })).toBe(false);
    expect(mediaLockMismatch(pipeWith({ mediaMode: 'keyframes', subjectReferences: [subj(1)] }), { modes: ['keyframes', 'reference'] })).toBe(true);
    // No rules → no mismatch possible.
    expect(mediaLockMismatch(pipeWith({ mediaMode: 'keyframes' }), undefined)).toBe(false);
  });
});

describe('pipeMediaContent', () => {
  it('counts raw keyframe + subject pieces', () => {
    expect(pipeMediaContent(pipeWith({ keyframes: [kf(1)], subjectReferences: [subj(1), subj(2)] }))).toEqual({ keyframes: 1, subjects: 2 });
    expect(pipeMediaContent(pipeWith())).toEqual({ keyframes: 0, subjects: 0 });
  });
});

describe('pipePrechecks — locked-kind downgrade (acceptable, non-blocking)', () => {
  const sess = sessionWith();
  const dualSpec = secondsSpec({ media: { modes: ['keyframes', 'reference'], maxKeyframes: 2, maxRefs: 5 } });

  it('does NOT block a keyframes-locked pipe that cross-falls to reference (subjects ship instead)', () => {
    // The content-aware downgrade is acceptable: it surfaces as a quiet note in
    // the pipe UI, not a generation-blocking conflict. A url subject with a
    // real imageUrl is well-formed, so no conflict at all.
    const c = pipePrechecks(
      pipeWith({ mediaMode: 'keyframes', subjectReferences: [{ ...subj(1), imageUrl: 'https://x/i.png' }] }),
      sess,
      null,
      dualSpec,
    );
    expect(c).toEqual([]);
  });

  it('does NOT block a reference-locked pipe that cross-falls to keyframe', () => {
    // Well-formed keyframe (real source URL): the cross-fall itself is not a
    // conflict — the shipped mode just carries a properly-settled piece.
    const c = pipePrechecks(
      pipeWith({ mediaMode: 'reference', keyframes: [{ ...kf(1), imageSrc: 'https://x/k1.png' }] }),
      sess,
      null,
      dualSpec,
    );
    expect(c).toEqual([]);
  });

  it('does NOT block the text-only fall when both kinds are empty', () => {
    const c = pipePrechecks(pipeWith({ mediaMode: 'keyframes' }), sess, null, dualSpec);
    expect(c).toEqual([]);
  });

  it('caps run against the effective (shipped) mode, not the lock', () => {
    // Locked keyframes with 0 keyframes → ships as reference (cross-fall);
    // the cap that applies is the reference cap (5), not the keyframe cap.
    const c = pipePrechecks(
      pipeWith({ mediaMode: 'keyframes', subjectReferences: [1, 2, 3, 4, 5].map(subj) }),
      sess,
      null,
      dualSpec,
    );
    expect(c.map((x) => x.code)).not.toContain('media-cap'); // 5 ≤ ref cap 5

    // Same pipe, 6 subjects → over the ref cap the engine will apply.
    const c2 = pipePrechecks(
      pipeWith({ mediaMode: 'keyframes', subjectReferences: [1, 2, 3, 4, 5, 6].map(subj) }),
      sess,
      null,
      dualSpec,
    );
    expect(c2.map((x) => x.code)).toContain('media-cap');
  });

  it('an empty imageUrl on a shipped reference subject still blocks', () => {
    // Cross-fall ships the subjects; a url subject with no image is a real
    // defect (broken slot) regardless of the lock — still blocking.
    const c = pipePrechecks(
      pipeWith({ mediaMode: 'keyframes', subjectReferences: [subj(1)] }),
      sess,
      null,
      dualSpec,
    );
    expect(c.map((x) => x.code)).toContain('txt2img-no-prompt');
  });
});
