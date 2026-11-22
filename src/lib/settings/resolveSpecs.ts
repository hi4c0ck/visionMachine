// Provider spec resolution (docs/provider-engine-tasks.md, Phase A).
// The frontend owns model data (E2): resolve the spec from the catalog and
// hand it to Rust as a wire-safe mirror; Rust shapes the payload and owns
// secrets + HTTP. Pre-checks and seconds preview live in ./prechecks.

// Expanded provider system: the resolved copy carries the preset's auth
// scheme and the MERGED Tier-A video adapter (preset ⊕ model overrides ⊕
// per-model payload) so the Rust engine interprets one self-contained spec.
import type { ModelSpec, ProviderKind, VideoAdapterSpec } from '$types';
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

/** Deep-merge plain objects (adapter overrides); arrays + scalars replace.
 *  One-level nesting is typical (create/poll/response/artifact), but the
 *  recursion keeps response.artifact / response.envelope deltas working. */
function mergeDeep<T>(base: T, over: unknown): T {
  if (over === undefined || over === null) return base;
  if (Array.isArray(base) || Array.isArray(over)) return over as T;
  if (typeof base === 'object' && base !== null && typeof over === 'object') {
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
      out[k] = k in out ? mergeDeep(out[k], v) : v;
    }
    return out as T;
  }
  return over as T;
}

/** Merge the vendor adapter (preset) with the model's deltas + payload.
 *  Null when the model is not a Tier-A adapter model or the preset carries
 *  no adapter base (a concrete config error the caller surfaces). */
export function mergeAdapter(
  presetAdapter: VideoAdapterSpec | undefined,
  spec: ModelSpec,
): VideoAdapterSpec | null {
  if (spec.requestFormat !== 'video-adapter') return null;
  if (!presetAdapter) return null;
  const merged = mergeDeep(presetAdapter, spec.adapterOverrides ?? {});
  merged.payload = spec.adapterPayload ?? merged.payload ?? {};
  return merged;
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
  let spec = getModel(preset, id);
  // Free-form preset (freeFormModel): a TYPED model id is not in the catalog
  // — ride the preset's base model spec (first model of the kind) so the run
  // proceeds with the catalog limits/media/pricing/adapter data, and the
  // typed id travels on the wire + generation log. Typing a model id against
  // your own engine IS the live-verification act — the reserved `pending`
  // gate is lifted for the base spec (owner verified by construction).
  if (!spec && preset.freeFormModel) {
    const base = preset.models.find((m) => m.kind === kind);
    if (base) spec = { ...base, id, pending: false };
  }
  if (!spec) return null;
  // Wire-safe resolved copy: auth scheme rides along (Rust builds headers +
  // relaxes the key gate for 'none'); the merged adapter rides for Tier A.
  const resolved: ModelSpec = { ...spec, auth: preset.auth };
  const adapter = mergeAdapter(preset.adapter, spec);
  if (adapter) resolved.adapter = adapter;
  return { preset: preset.id, spec: resolved };
}

/** Resolve image + video specs for a run (the generate modal's picks). */
export function resolveSpecs(imageModel?: string, videoModel?: string): ResolvedPair {
  return {
    image: resolveModelSpec('image', imageModel),
    video: resolveModelSpec('video', videoModel),
  };
}
