// Settings & provider containers (docs/settings-provider-tasks.md, Phase 0).
//
// One vendor in v1: Agnes (text + image + video). Concrete model details
// arrive later and land as DATA in src/lib/settings/catalog.ts — these
// types are the stable containers, the UI and engine must not re-shape
// when specs are filled.

export type ProviderKind = 'text' | 'image' | 'video';

export type PresetId = 'agnes' | 'custom';

/** How a model's API wants its request payload (request-builder shaper id).
 *  `video-job` is the generic OpenAI-shape async job (custom preset). The
 *  two Agnes variants differ by wire shape (P1/P2): frames-based (V2.0)
 *  vs seconds-based (V2.5 family). */
export type RequestFormat =
  | 'chat'
  | 'image-gen'
  | 'video-job'
  | 'video-job-frames'
  | 'video-job-seconds';

/** Pipe-level media mode (docs/agnes-model-catalog.md, Q7). Default is
 *  'keyframes'. Drives keyframes/subject-refs row visibility per model. */
export type MediaMode = 'keyframes' | 'reference';

/** Per-model media-mode rules — the pipe UI shows/hides the keyframes and
 *  subject-refs rows based on these (docs/agnes-model-catalog.md, Q7).
 *  Absent = unknown model → keep today's behavior (both rows, no toggle). */
export interface ModelMedia {
  /** Modes the model offers. A single entry = no toggle. */
  modes: MediaMode[];
  /** true = keyframes AND reference media allowed simultaneously (paid 2.5). */
  dual?: boolean;
  /** true = subjects merge into the keyframes image array (V2.0, shared cap). */
  sharedArray?: boolean;
  maxKeyframes?: number;
  maxRefs?: number;
  maxAudios?: number;
  maxVideos?: number;
}

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
    /** Seconds range for seconds-based video models (V2.5: [4, 12]). */
    seconds?: [number, number];
    /** Supported aspect ratios (model-driven, P2). */
    ratios?: string[];
    /**
     * Resolution tier map (E8): session resolution → model size tier
     * (e.g. "720p" → "1K" for Agnes image, "720p" → "720P" for 2.5-flash).
     * Absent → the size param is omitted and the provider default applies.
     */
    sizeMap?: Record<string, string>;
    /**
     * Orientation ratio map (E8): session orientation → model aspect-ratio
     * value (e.g. "horizontal" → "16:9"). Absent → param omitted.
     */
    ratioMap?: Record<string, string>;
  };
  /** Placeholder until concrete vendor details land — picker disables it. */
  pending?: boolean;
  label?: string;
  /** Read-only entry: viewable/inspectable in Settings, never generatable. */
  readOnly?: boolean;
  /** Model accepts a `seed` parameter (reproducible runs). */
  supportsSeed?: boolean;
  /**
   * Wire param name the engine sends cValue under when it accepts a
   * guidance/creativity scale (E7, e.g. "guidance_scale"). Absent → the
   * value is logged only, never sent (dev-managed per model, verified in
   * the live-verification pass).
   */
  guidance?: string;
  /** Media-mode capabilities driving pipe-UI row visibility. */
  media?: ModelMedia;
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
  /** CFG / guidance scale (creativity) */
  cValue: number;
  /** Ships 'sequential' (MAX_CONCURRENT = 1); 'parallel' opts in later. */
  concurrency: 'sequential' | 'parallel';
  /** When true, each run auto-rolls a fresh seed; the seed field then holds
   *  the last used value but is regenerated on each open. Default true. */
  alwaysNewSeed: boolean;
  /**
   * Units for the `length="…"` attribute on compiled `<segments>` blocks.
   * 'frames' → `121f` (frame-exact, default); 'seconds' → `5s` (human
   * time hint, fps-converted in the engine). Heuristic for the descriptor
   * inner lines reads this setting at compile time.
   */
  segmentLengthUnit: 'frames' | 'seconds';
}

export interface Settings {
  profile: {
    displayName: string;
    theme: string;
    layout: string;
  };
  generationDefaults: GenerationDefaults;
  providers: Record<ProviderKind, ProviderSlot>;
  /** Local tooling (Phase: ffmpeg locator). Never in logs (P6). */
  tools: ToolsBlock;
}

/** Local tooling overrides. `ffmpegPath` is the tiny-variant escape hatch:
 *  when set, the backend probes it (with `-version` only) ahead of the
 *  system $PATH. Absent/empty = not used. */
export interface ToolsBlock {
  ffmpegPath: string;
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
  /** Snapshot of the params that produced this piece. `seed` present when
   *  a concrete value was sent (reproducible re-gen; P4). */
  params: { fps: number; resolution: string; q: number; c: number; seed?: number };
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
