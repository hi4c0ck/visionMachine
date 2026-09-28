// Content-aware media-mode resolution (frontend mirror of Rust's
// `seconds_mode_wire`, shaper.rs — keep the two in sync).
//
// The pipe's stored `mediaMode` is a USER LOCK: once the user picks a kind
// via the toggle, it persists across model switches. But the actual wire
// mode a deploy sends is content-aware: when the locked kind has no media
// pieces of its own, the engine cross-falls to the other kind (when the
// model supports it) or to `text` last. The UI must resolve the SAME
// effective mode so the "right tumbler" (keyframes row vs subject-refs row)
// is selected on deploy, and so a locked-but-empty kind is visible to the
// user instead of silently re-sent by the engine.

import type { ModelMedia, PipeRow } from '$types';

/** The wire mode actually sent by the engine for a video deploy. */
export type EffectiveMediaMode = 'keyframe' | 'reference' | 'text';

/** Count of keyframe / subject media pieces on a pipe (raw, UI-side). */
export function pipeMediaContent(pipe: PipeRow): { keyframes: number; subjects: number } {
  return {
    keyframes: (pipe.keyframes ?? []).length,
    subjects: (pipe.subjectReferences ?? []).length,
  };
}

/**
 * Resolve the effective wire mode for a deploy, mirroring Rust's
 * `seconds_mode_wire` rule:
 * 1. Flag (stored mode) wins when present and supported by the model.
 * 2. Absent/unknown flag -> derive from content (subjects -> reference,
 *    else keyframes -> keyframe, else text).
 * 3. Gate on `media.modes` when present and non-empty: an unsupported
 *    preferred mode falls back (reference -> keyframe -> text).
 * 4. Downgrade when the mode's kind has no content: cross-fall to the
 *    OTHER kind when it has content AND the model supports it; else text.
 *
 * Unknown models (no `media` rules) keep today's behavior: the stored flag
 * is the whole story — no downgrade, no gating.
 */
export function effectiveMediaMode(
  pipe: PipeRow,
  media?: ModelMedia | null,
): EffectiveMediaMode {
  const stored: 'keyframes' | 'reference' = pipe.mediaMode === 'reference' ? 'reference' : 'keyframes';
  const { keyframes, subjects } = pipeMediaContent(pipe);
  const hasKf = keyframes > 0;
  const hasSubs = subjects > 0;

  // 1. + 2. Preferred mode: flag wins; absent flag derives from content.
  let preferred: EffectiveMediaMode =
    stored === 'keyframes' ? 'keyframe' : 'reference';

  	const noRules = !media || !Array.isArray(media.modes) || media.modes.length === 0;
  if (noRules) return preferred;

  // 3. Gate on the model's supported modes.
  const supported = (m: EffectiveMediaMode): boolean =>
    media.modes.some((s) =>
      (s === 'keyframes' && m === 'keyframe') ||
      (s === 'reference' && m === 'reference') ||
      (s === 'text' && m === 'text'),
    );
  let mode: EffectiveMediaMode = supported(preferred)
    ? preferred
    : supported('keyframe') && preferred === 'reference'
      ? 'keyframe'
      : 'text';

  // 4. Downgrade when the mode's kind has no content.
  if (mode === 'keyframe' && !hasKf) {
    mode = supported('reference') && hasSubs ? 'reference' : 'text';
  } else if (mode === 'reference' && !hasSubs) {
    mode = supported('keyframe') && hasKf ? 'keyframe' : 'text';
  }
  return mode;
}

/**
 * Whether a deploy would downgrade the user's LOCKED kind because that kind
 * has no media pieces. `true` = the UI should surface the effective mode
 * (the "right tumbler") instead of the locked one. No downgrade when there
 * are no model rules (unknown models keep both rows visible anyway).
 */
export function mediaLockMismatch(
  pipe: PipeRow,
  media?: ModelMedia | null,
): boolean {
  const eff = effectiveMediaMode(pipe, media);
  const stored: EffectiveMediaMode = pipe.mediaMode === 'reference' ? 'reference' : 'keyframe';
  return eff !== stored;
}
