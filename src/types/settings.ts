// Settings & provider containers (docs/settings-provider-tasks.md, Phase 0).
//
// One vendor in v1: Agnes (text + image + video). Concrete model details
// arrive later and land as DATA in src/lib/settings/catalog.ts — these
// types are the stable containers, the UI and engine must not re-shape
// when specs are filled.

export type ProviderKind = 'text' | 'image' | 'video';

export type PresetId = 'agnes' | 'custom';

/** How a model's API wants its request payload (request-builder shaper id). */
export type RequestFormat = 'chat' | 'image-gen' | 'video-job';

/**
 * A model owns its request format (the "guaranteed on the flight" rule):
 * endpoint + payload shaper + limits travel WITH the model, so switching
 * models within a configured provider can never break the wire format.
 */
export interface ModelSpec {
  id: string;
  kind: ProviderKind;
  /** Path under the provider base URL (e.g. "/chat/completions"). */
  endpoint: string;
  /** false → async job: create, then poll `pollEndpoint`. */
  sync: boolean;
  pollEndpoint?: string;
  requestFormat: RequestFormat;
  limits: {
    fps?: number[];
    resolutions?: string[];
    maxFrames?: number;
  };
  /** Placeholder until concrete vendor details land — picker disables it. */
  pending?: boolean;
  label?: string;
}

/** One vendor template: auth scheme + default URL + its model catalog. */
export interface PresetSpec {
  id: PresetId;
  label: string;
  kinds: ProviderKind[];
  auth: 'bearer';
  defaultBaseUrl: string;
  models: ModelSpec[];
}

/** A configured provider slot (one per kind, per user profile). */
export interface ProviderSlot {
  /** PresetSpec.id */
  preset: string;
  baseUrl: string;
  /** Local-only. Never appears in logs, error strings, or UI text. */
  apiKey: string;
  /** ModelSpec.id */
  model: string;
}

export interface GenerationDefaults {
  fps: number;
  resolution: string;
  orientation: string;
  /** Inference steps (quality) */
  qValue: number;
  /** CFG scale (creativity) */
  cValue: number;
  /** Ships 'sequential' (MAX_CONCURRENT = 1); 'parallel' opts in later. */
  concurrency: 'sequential' | 'parallel';
}

export interface Settings {
  profile: {
    displayName: string;
    theme: string;
    layout: string;
  };
  generationDefaults: GenerationDefaults;
  providers: Record<ProviderKind, ProviderSlot>;
}

// ── Generation log (portable: NO keys, NO raw local paths — P5) ────────────

export type LogPieceKind = 'keyframe' | 'subject' | 'video';
// 'pending' = piece not started yet; 'running' = task in flight. Entries are
// written at task start (status 'running', pieces 'pending') and upserted at
// terminal (done / error / cancelled).
export type LogStatus = 'pending' | 'running' | 'done' | 'error' | 'cancelled';

export interface GenerationLogPiece {
  kind: LogPieceKind;
  refId: string;
  /** PresetSpec.id actually used for this piece */
  provider: string;
  /** ModelSpec.id actually used (global setting or last-step override) */
  model: string;
  status: LogStatus;
  /** Artifact ref (internal) → rendered as a URL via toMediaUrl. Never a raw path. */
  outputRef?: string;
  /** Snapshot of the params that produced this piece. */
  params: { fps: number; resolution: string; q: number; c: number };
  /** Sanitized — guaranteed key-free (redactLog). */
  error?: string;
}

export interface GenerationLogEntry {
  taskId: string;
  sessionId: string;
  pipeId: string;
  startedAt: number;
  finishedAt?: number;
  status: LogStatus;
  pieces: GenerationLogPiece[];
}
