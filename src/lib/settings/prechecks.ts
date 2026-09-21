// Pipe-level pre-checks (E4/E6): concrete, user-fixable conflicts that block
// generation. Pure — no settings reads here; the caller passes resolved specs.
// docs/provider-engine-tasks.md, Phase A.

import type { ModelSpec, PipeRow, SessionData } from '$types';
import { snapTo8nPlus1 } from '$types';

/** A concrete, user-fixable generation conflict (E4). */
export interface PipeConflict {
  code:
    | 'spec-pending'
    | 'spec-missing'
    | 'not-8n1'
    | 'frames-overflow'
    | 'fps-off-grid'
    | 'media-cap'
    | 'txt2img-no-prompt';
  message: string;
}

function is8n1(frames: number): boolean {
  return (frames - 1) % 8 === 0;
}

/**
 * Run every model/pipe pre-check for a generation run (docs/provider-engine-
 * tasks.md, E4/E6). Empty list = generation may proceed.
 */
export function pipePrechecks(
  pipe: PipeRow,
  session: SessionData,
  imageSpec: ModelSpec | null | undefined,
  videoSpec: ModelSpec | null | undefined,
): PipeConflict[] {
  const out: PipeConflict[] = [];
  const video = videoSpec;

  // ── Spec gates ──────────────────────────────────────────────────────────
  if (!video || video.pending) {
    out.push({
      code: 'spec-pending',
      message: 'Video model details are pending — pick a configured video model in Settings',
    });
  }
  if (imageSpec?.pending) {
    out.push({
      code: 'spec-pending',
      message: 'Image model details are pending — pick a configured image model in Settings',
    });
  }

  // ── Frames-based video model (video-job-frames) checks ────────────────
  if (video && !video.pending && video.requestFormat === 'video-job-frames') {
    const max = video.limits.maxFrames;
    if (max !== undefined && pipe.lengthFrames > max) {
      out.push({
        code: 'frames-overflow',
        message: `pipe length ${pipe.lengthFrames} exceeds ${video.label ?? video.id} max of ${max} frames`,
      });
    }
    if (!is8n1(pipe.lengthFrames)) {
      const low = snapTo8nPlus1(pipe.lengthFrames - 4);
      const high = snapTo8nPlus1(pipe.lengthFrames + 4);
      out.push({
        code: 'not-8n1',
        message: `pipe length ${pipe.lengthFrames} is not 8n+1; use ${low} or ${high}`,
      });
    }
    const fps = video.limits.fps;
    if (fps && fps.length > 0 && !fps.includes(session.fps)) {
      out.push({
        code: 'fps-off-grid',
        message: `session fps ${session.fps} is not in ${video.label ?? video.id}'s supported set (${fps.join(', ')})`,
      });
    }
  }

  // ── Media caps (E4) ──────────────────────────────────────────────────────
  const mediaMode = pipe.mediaMode ?? 'keyframes';
  const videoShared = !!(video && !video.pending && video.media?.sharedArray);
  if (video && !video.pending && video.media) {
    const media = video.media;
    const kfs = pipe.keyframes?.length ?? 0;
    // The `visible` eye-mechanic is obsolete — every subject ref in the pipe
    // counts toward the caps (there is no hidden state anymore).
    const subs = (pipe.subjectReferences ?? []).length;
    if (media.sharedArray) {
      const cap = media.maxKeyframes ?? media.maxRefs ?? 3;
      if (kfs + subs > cap) {
        out.push({
          code: 'media-cap',
          message: `shared media cap ${cap}: this pipe has ${kfs} keyframe(s) + ${subs} subject(s)`,
        });
      }
    } else if (mediaMode === 'keyframes') {
      const cap = media.maxKeyframes ?? 2;
      if (kfs > cap) {
        out.push({ code: 'media-cap', message: `keyframes mode allows ${cap} keyframe(s); this pipe has ${kfs}` });
      }
      // Plain keyframes mode: subjects are inert — no cap, no prompt check.
      // (sharedArray is handled above; reference is handled below.)
    } else if (mediaMode === 'reference') {
      const cap = media.maxRefs ?? 5;
      if (subs > cap) {
        out.push({ code: 'media-cap', message: `reference mode allows ${cap} subject(s); this pipe has ${subs}` });
      }
      // Reference-mode subjects are the primary input: an empty imageUrl
      // on a url/img2img subject will silently produce a broken image slot.
      for (const sr of pipe.subjectReferences ?? []) {
        const ty = sr.type ?? 'url';
        if ((ty === 'url' || ty === 'img2img') && !(sr.imageUrl?.trim())) {
          out.push({
            code: 'txt2img-no-prompt',
            message: `subject ${sr.id} has no reference image — set a URL or switch to txt2img`,
          });
        }
      }
    }
  }

  // ── txt2img pieces must carry a prompt (O1 / E4) ─────────────────────
  for (const kf of pipe.keyframes ?? []) {
    if ((kf.type ?? 'url') === 'txt2img' && !(kf.prompt?.trim())) {
      out.push({ code: 'txt2img-no-prompt', message: `keyframe ${kf.slotIndex} (txt2img) needs a prompt` });
    }
  }
  // Subjects only matter when the model actually consumes them:
  //  - reference mode: subjects are the primary input
  //  - sharedArray:    subjects merge into the keyframe image array
  // In plain keyframe mode, subjects are inert metadata — skip the check.
  if (mediaMode === 'reference' || videoShared) {
    for (const sr of pipe.subjectReferences ?? []) {
      if ((sr.type ?? 'url') === 'txt2img' && !(sr.prompt?.trim())) {
        out.push({ code: 'txt2img-no-prompt', message: `subject ${sr.id} (txt2img) needs a prompt` });
      }
    }
  }

  return out;
}

/**
 * Modal hint for seconds-based models (E5): the duration the model will
 * actually receive — `round1(lengthFrames / fps)` clamped to the model's
 * `[lo, hi]` seconds range. `shown` is the clamped value (what will be sent);
 * `raw` is the unclamped value so the UI can flag a clamp.
 */
export function secondsPreview(
  pipe: PipeRow,
  session: SessionData,
  spec: ModelSpec,
): { shown: string; raw: number; clamped: boolean } {
  const raw = pipe.lengthFrames / Math.max(session.fps, 1);
  const range = spec.limits.seconds ?? [0, raw];
  const clamped = Math.min(Math.max(raw, range[0]), range[1]);
  const rounded = Math.round(clamped * 10) / 10; // 1 decimal (E5)
  return {
    shown: rounded.toFixed(1),
    raw: Math.round(raw * 10) / 10,
    clamped: rounded !== Math.round(raw * 10) / 10,
  };
}
