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

import type { ModelMedia, PipeRow, ModelSpec, SessionData } from '$types';
import { effectiveTargetDims, targetDimsLabel } from '$types';
import { knownResolution, knownOrientation } from './guards';
import { APP_CONSTANTS } from '$constants';

/** The wire mode actually sent by the engine for a video deploy. */
export type EffectiveMediaMode = 'keyframe' | 'reference' | 'text';

/** Count of keyframe / subject media pieces on a pipe (raw slot count).
 *  Mirrors the engine: by the time the video stage runs, every queued image
 *  piece (url / txt2img / img2img) has settled into the upstream — so the
 *  raw slot count is the faithful predictor of the wire mode, not just the
 *  already-settled subset. */
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

// ── 0012 Phase 4: per-piece image size-mode helpers ─────────────────────────

/**
 * The image-size tiers the current image model offers (its `limits.resolutions`).
 * The modal's "Size mode" selector lists only these; a model switch re-bounds
 * the available options (plan 4.3). Empty list = the model accepts no size
 * param (the selector falls back to "Use session default" only).
 */
export function availableImageTiers(model: ModelSpec | null | undefined): string[] {
  return model?.limits?.resolutions ?? [];
}

/**
 * The image-ratio options the current image model offers (its `limits.ratios`).
 */
export function availableImageRatios(model: ModelSpec | null | undefined): string[] {
  return model?.limits?.ratios ?? [];
}

/**
 * The "session default" tier the shaper would resolve for the current session
 * (mirrors Rust `resolve_target_size`): `sizeMap[resolution]`. `null` when the
 * model has no tier map (the provider's implicit default applies). Shown in the
 * selector's "Use session default (…)" row.
 */
export function sessionDefaultTier(
  model: ModelSpec | null | undefined,
  session: SessionData | null | undefined,
): string | null {
  if (!model || !session) return null;
  const res = knownResolution(String(session.resolution));
  const tier = model.limits?.sizeMap?.[res];
  return tier ?? null;
}

/**
 * The "session default" ratio the shaper would resolve for the current session
 * orientation (mirrors Rust `resolve_target_size` + nearest_ratio). `null` when
 * the model has no ratio data.
 */
export function sessionDefaultRatio(
  model: ModelSpec | null | undefined,
  session: SessionData | null | undefined,
): string | null {
  if (!model || !session) return null;
  const ori = knownOrientation(String(session.orientation));
  const mapped = model.limits?.ratioMap?.[ori];
  if (mapped) return mapped;
  // Nearest-ratio fallback (same rule as Rust): pick the ratio in
  // `limits.ratios` closest to the target aspect.
  const ratios = model.limits?.ratios ?? [];
  if (ratios.length === 0) return null;
  const { width, height } = effectiveTargetDims(
    session.resolution,
    session.orientation,
    session.customWidth,
    session.customHeight,
  );
  const targetAspect = width / Math.max(1, height);
  let best: string | null = null;
  let bestDist = Infinity;
  let bestDen = Infinity;
  for (const r of ratios) {
    const m = r.split(':');
    if (m.length !== 2) continue;
    const n = parseFloat(m[0]);
    const d = parseInt(m[1], 10);
    if (!isFinite(n) || d === 0) continue;
    const dist = Math.abs(n / d - targetAspect);
    if (dist < bestDist || (dist === bestDist && d < bestDen)) {
      best = r;
      bestDist = dist;
      bestDen = d;
    }
  }
  return best;
}

/**
 * Display label for the "session default" row: e.g. "1K · 16:9". Falls back to
 * the raw target dims when the model has no size/ratio maps.
 */
export function sessionDefaultLabel(
  model: ModelSpec | null | undefined,
  session: SessionData | null | undefined,
): string {
  const tier = sessionDefaultTier(model, session);
  const ratio = sessionDefaultRatio(model, session);
  if (tier || ratio) return `${tier ?? '?'} · ${ratio ?? '?'}`;
  if (!session) return 'Session default';
  return targetDimsLabel(
    session.resolution,
    session.orientation,
    session.customWidth,
    session.customHeight,
  );
}

/**
 * 0012: the resolution presets a session may actually use WITH a given
 * video model. The provider only accepts the model's declared size tiers
 * (`limits.resolutions`); a session preset is offered ONLY when its
 * `sizeMap` tier is one of the model's declared tiers. So a `2.5-flash`
 * video model (tiers `['720P']`) offers just 720p; a `2.5` paid model
 * (tiers `['720P','1080P','1K','2K']`) offers 720p + 1080p. Models with no
 * size map or no declared tiers fall back to the full preset list (the
 * classic behavior), and the current session preset is always included so a
 * stored value never renders blank.
 */
export function availableResolutionsForModel(
  model: ModelSpec | null | undefined,
  current = '720p',
): string[] {
  const all = APP_CONSTANTS.resolutions;
  const tiers = model?.limits?.resolutions;
  if (!tiers || tiers.length === 0) return all; // unknown model -> classic
  // Offer only the session preset whose OWN canonical tier (480p->480P,
  // 720p->720P, 1080p->1080P) is in the model's declared output tiers.
  const supported = all.filter((preset) => tiers.includes(preset.replace('p', 'P')));
  if (supported.length === 0) return all; // never offer an empty list
  // Preserve the canonical preset order; ensure the current value is visible.
  const ordered = supported.filter((r) => all.includes(r));
  if (!ordered.includes(current)) ordered.push(current);
  return ordered;
}

/**
 * 0012: treat Orientation as a FILTER over the model's supported video
 * aspect-ratios (`limits.ratios`). The "Video size" selector offers only the
 * ratios compatible with the chosen orientation:
 *   - horizontal -> landscape ratios (aspect > 1: 16:9, 21:9, 4:3, 3:2…)
 *   - vertical   -> portrait ratios   (aspect < 1: 9:16, 3:4, 2:3…)
 *   - square     -> square ratios     (aspect == 1: 1:1)
 * A model that lists no matching ratios falls back to its full ratio list so
 * the selector is never empty. Order follows the model's declared list.
 */
export function videoRatiosForOrientation(
  model: ModelSpec | null | undefined,
  orientation: string,
): string[] {
  const all = model?.limits?.ratios ?? [];
  if (all.length === 0) return [];
  const inClass = (ratio: string, cls: 'wide' | 'narrow' | 'square'): boolean => {
    const m = ratio.split(':');
    if (m.length !== 2) return false;
    const n = parseFloat(m[0]);
    const d = parseFloat(m[1]);
    if (!isFinite(n) || !isFinite(d) || d === 0) return false;
    const a = n / d;
    if (cls === 'square') return Math.abs(a - 1) < 1e-6;
    if (cls === 'wide') return a > 1;
    return a < 1; // 'narrow'
  };
  const cls =
    orientation === 'vertical' ? 'narrow' : orientation === 'square' ? 'square' : 'wide';
  const filtered = all.filter((r) => inClass(r, cls));
  return filtered.length > 0 ? filtered : all;
}
