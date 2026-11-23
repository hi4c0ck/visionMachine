// Provider spec resolution (docs/provider-engine-tasks.md, Phase A).
// The frontend owns model data (E2): resolve the spec from the catalog and
// hand it to Rust as a wire-safe mirror; Rust shapes the payload and owns
// secrets + HTTP. Pre-checks and seconds preview live in ./prechecks.

// Expanded provider system: the resolved copy carries the preset's auth
// scheme and the MERGED Tier-A video adapter (preset ⊕ model overrides ⊕
// per-model payload) so the Rust engine interprets one self-contained spec.
import type { McpSpec, ModelSpec, ProviderKind, VideoAdapterSpec } from '$types';
import { getPreset, getModel } from './catalog';
import { unlockVerified } from './guards';
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

/** Attach the preset's MCP transport config to an 'mcp' wire spec. Mirrors
 *  mergeAdapter: transport lives on the preset, the model owns the request
 *  format. Null for every other request format or a preset with no config —
 *  the Rust engine reports that as a concrete config error. */
export function mergeMcp(
  presetMcp: McpSpec | undefined,
  spec: ModelSpec,
): McpSpec | null {
  if (spec.requestFormat !== 'mcp' || !presetMcp) return null;
  return mergeDeep(presetMcp, spec.mcp ?? {});
}

/**
 * Resolve the model spec for one provider kind: this-run override (the
 * generate-modal pick) else the preset default. Null when the slot is
 * pending/unknown → the caller blocks with a concrete message (E1).
 *
 * `verified` is the owner's per-slot live-verified id list — a PARAMETER,
 * never read from the settings singleton here, so a `$derived` caller that
 * passes a reactive value re-runs on a tick/untick (skill: settings store is
 * non-reactive). The gate is applied at THIS boundary so every downstream
 * `.pending` reader (prechecks, seconds, cost, read-only) sees the same
 * unlocked object the pickers show.
 */
export function resolveModelSpec(
  kind: ProviderKind,
  overrideId?: string,
  verified?: readonly string[] | null,
): ResolvedModelSpec | null {
  const s = getSettings();
  const slot = s.providers[kind];
  if (!slot) return null;
  const preset = getPreset(slot.preset);
  if (!preset) return null;
  const id = overrideId ? overrideId : slot.model;
  if (!id) return null;
  let spec = getModel(preset, id);
  let ownerVerified = false;
  // A pending CATALOG id unlocks only when the owner actually ticked it;
  // `unlockVerified` returns a new object exactly in that case.
  if (spec) {
    const unlocked = unlockVerified(spec, verified);
    if (unlocked !== spec) {
      spec = unlocked;
      ownerVerified = true;
    }
  }
  // Free-form preset (freeFormModel): a TYPED model id is not in the catalog
  // — ride the preset's base model spec (first model of the kind) so the run
  // proceeds with the catalog limits/media/pricing/adapter data, and the
  // typed id travels on the wire + generation log. Typing a model id against
  // your own engine IS the live-verification act — the reserved `pending`
  // gate is lifted for the base spec (owner verified by construction).
  if (!spec && preset.freeFormModel) {
    const base = preset.models.find((m) => m.kind === kind);
    if (base) {
      spec = { ...base, id, pending: false };
      ownerVerified = true;
    }
  }
  if (!spec) return null;
  // Wire-safe resolved copy: auth scheme rides along (Rust builds headers +
  // relaxes the key gate for 'none'); the merged adapter rides for Tier A.
  const resolved: ModelSpec = { ...spec, auth: preset.auth };
  // Stamp ONLY on an actual owner unlock or a typed free-form fallback —
  // non-pending catalog specs stay unstamped (ownerVerified absent).
  if (ownerVerified) resolved.ownerVerified = true;
  const adapter = mergeAdapter(preset.adapter, spec);
  if (adapter) resolved.adapter = adapter;
  const mcp = mergeMcp(preset.mcp, spec);
  if (mcp) resolved.mcp = mcp;
  return { preset: preset.id, spec: resolved };
}

/** Resolve image + video specs for a run (the generate modal's picks).
 *  The per-kind verified lists are read from the settings singleton HERE and
 *  threaded into resolveModelSpec, so every caller of resolveSpecs gets the
 *  same owner-gated spec the pickers show. */
export function resolveSpecs(imageModel?: string, videoModel?: string): ResolvedPair {
  const s = getSettings();
  return {
    image: resolveModelSpec('image', imageModel, s.providers.image?.verified),
    video: resolveModelSpec('video', videoModel, s.providers.video?.verified),
  };
}
