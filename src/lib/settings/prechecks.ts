// Pipe-level pre-checks (E4/E6): concrete, user-fixable conflicts that block
// generation. Pure — no settings reads here; the caller passes resolved specs.
// docs/provider-engine-tasks.md, Phase A.

import type { ModelSpec, PipeRow, SessionData } from '$types';
import { snapTo8nPlus1 } from '$types';
import { effectiveMediaMode } from './mediaMode';

/** A concrete, user-fixable generation conflict (E4). */
export interface PipeConflict {
  code:
    | 'spec-pending'
    | 'spec-missing'
    | 'spec-locked'
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

  // ── Spec gates ─────────────────────────────────────────────────────────
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
  // Read-only (paid) specs are Settings-browse only — block them here too,
  // not just in the per-pipe modal, so the session group flow (policy
  // "continue") cannot start a run on a non-generable model.
  const lockedVideo = video && !video.pending && video.readOnly ? video : null;
  if (lockedVideo) {
    out.push({
      code: 'spec-locked',
      message: `video model ${lockedVideo.id} is read-only (paid) — pick a generable model in Settings`,
    });
  }
  const lockedImage = imageSpec && !imageSpec.pending && imageSpec.readOnly ? imageSpec : null;
  if (lockedImage) {
    out.push({
      code: 'spec-locked',
      message: `image model ${lockedImage.id} is read-only (paid) — pick a generable model in Settings`,
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
  // Cap + subject-prompt checks run against the EFFECTIVE wire mode (the
  // content-aware resolution the engine will actually send), not the stored
  // lock alone — a locked kind with no media pieces cross-falls, and the
  // cap that matters is the one on the kind that ships.
  const mediaLock = pipe.mediaMode ?? 'keyframes';
  const videoShared = !!(video && !video.pending && video.media?.sharedArray);
  const effMode = video && !video.pending ? effectiveMediaMode(pipe, video.media) : null;
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
    } else if (effMode === 'keyframe') {
      const cap = media.maxKeyframes ?? 2;
      if (kfs > cap) {
        out.push({ code: 'media-cap', message: `keyframes mode allows ${cap} keyframe(s); this pipe has ${kfs}` });
      }
      // Plain keyframes mode: subjects are inert — no cap, no prompt check.
      // (sharedArray is handled above; reference is handled below.)
    } else if (effMode === 'reference') {
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
    // NOTE: a locked kind with no media pieces (the engine cross-falls to the
    // other kind or to `text`) is ACCEPTABLE — the content-aware resolution is
    // the intended behavior, not a generation blocker. It is surfaced as a
    // quiet note in the pipe UI (ComposerPanel's downgrade note), not here.
    // Only caps / missing-prompt / cap-overflow are blocking conflicts.
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
  // (The effective wire mode cross-fell away from the lock when its own kind
  // has no pieces, so `effMode` — not the lock — is what ships.)
  if ((effMode ?? mediaLock) === 'reference' || videoShared) {
    for (const sr of pipe.subjectReferences ?? []) {
      if ((sr.type ?? 'url') === 'txt2img' && !(sr.prompt?.trim())) {
        out.push({ code: 'txt2img-no-prompt', message: `subject ${sr.id} (txt2img) needs a prompt` });
      }
    }
  }

  // ── url/img2img pieces need an image to consume ──────────────────────
  // The engine's pre-seed silently DROPS a piece that has no source URL and
  // no settled preview (build_stage_plan: has_url || has_preview) — the
  // video would ship with fewer media anchors than the pipe shows. Surface
  // the gap where the model actually consumes the kind.
  if (videoShared || effMode === 'keyframe') {
    for (const kf of pipe.keyframes ?? []) {
      const ty = kf.type ?? 'url';
      const settled = !!kf.previewRemoteUrl?.trim();
      if (ty === 'url' && !(kf.imageSrc?.trim()) && !settled) {
        out.push({ code: 'txt2img-no-prompt', message: `keyframe ${kf.slotIndex} (url) has no image — set a source URL` });
      }
      if (ty === 'img2img' && !(kf.referenceUrl?.trim()) && !settled) {
        out.push({ code: 'txt2img-no-prompt', message: `keyframe ${kf.slotIndex} (img2img) has no reference image — set a reference URL or switch to txt2img` });
      }
    }
  }
  if (videoShared) {
    for (const sr of pipe.subjectReferences ?? []) {
      const ty = sr.type ?? 'url';
      const settled = !!sr.previewRemoteUrl?.trim();
      if ((ty === 'url' || ty === 'img2img') && !(sr.imageUrl?.trim()) && !settled) {
        out.push({ code: 'txt2img-no-prompt', message: `subject ${sr.id} has no reference image — set a URL or switch to txt2img` });
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
