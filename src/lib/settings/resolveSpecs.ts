// Provider spec resolution (docs/provider-engine-tasks.md, Phase A).
// The frontend owns model data (E2): resolve the spec from the catalog and
// hand it to Rust as a wire-safe mirror; Rust shapes the payload and owns
// secrets + HTTP. Pre-checks and seconds preview live in ./prechecks.

import type { ModelSpec, ProviderKind } from '$types';
import { getPreset, getModel } from './catalog';
import { getSettings } from './store';

/** Spec + preset pair the engine will run against. */
export interface ResolvedModelSpec {
  preset: string;
  spec: ModelSpec;
}

export interface ResolvedPair {
  image: ResolvedModelSpec | null;
  video: ResolvedModelSpec | null;
}

/**
 * Resolve the model spec for one provider kind: this-run override (the
 * generate-modal pick) else the preset default. Null when the slot is
 * pending/unknown → the caller blocks with a concrete message (E1).
 */
export function resolveModelSpec(kind: ProviderKind, overrideId?: string): ResolvedModelSpec | null {
  const s = getSettings();
  const slot = s.providers[kind];
  if (!slot) return null;
  const preset = getPreset(slot.preset);
  if (!preset) return null;
  const id = overrideId ? overrideId : slot.model;
  if (!id) return null;
  const spec = getModel(preset, id);
  if (!spec) return null;
  return { preset: preset.id, spec };
}

/** Resolve image + video specs for a run (the generate modal's picks). */
export function resolveSpecs(imageModel?: string, videoModel?: string): ResolvedPair {
  return {
    image: resolveModelSpec('image', imageModel),
    video: resolveModelSpec('video', videoModel),
  };
}
