// Core data types for VisionMachine app
// Single source of truth - all types defined here

/**
 * Tag types available in pipe segments
 */
export type TagType = 
  | 'scene'      // Scene description
  | 'camera'     // Camera position/movement
  | 'rotation'   // Rotation transforms
  | 'lighting'   // Lighting setup
  | 'effect'     // Visual effects
  | 'zoom'       // Zoom transitions
  | 'transition'; // Scene transitions

/**
 * Resolution preset for video generation
 */
export type ResolutionPreset = '480p' | '720p' | '1080p';

/**
 * Video orientation
 */
export type Orientation = 'horizontal' | 'vertical' | 'square';

/**
 * How already-generated video clips are normalized to the session target
 * W x H at compose time.
 * - `center`: cover-scale + center-crop (most common; trims equal margins)
 * - `fit`:    contain-scale + pad (black letterbox / pillarbox)
 * - `top`:    cover-scale + crop from the top of the frame
 * - `bottom`: cover-scale + crop from the bottom of the frame
 * - `exact`:  stretch-scale to target (distorts aspect if mismatched)
 * - `none`:   auto-center only when clip sizes are mixed; lossless if all
 *             clips already match the target. Default "none" is never sent
 *             by the UI — `center` is the default crop mode.
 */
export type CropMode = 'center' | 'fit' | 'top' | 'bottom' | 'exact' | 'none';

/**
 * Keyframe image source type
 */
export type KeyframeType = 'url' | 'txt2img' | 'img2img';

/**
 * Generation status for keyframes
 */
export type GenerationStatus = 'pending' | 'generating' | 'done' | 'error';

/**
 * Tag specification for visual and structural rules
 */
export interface TagSpecification {
  /** CSS color for this tag type */
  color: string;
  /** Human-readable name */
  name: string;
  /** Special construction rule for text output */
  constructRule: 'json' | 'xml' | 'plain' | 'markdown';
  /** Minimum numeric value (for range-based tags) */
  min?: number;
  /** Maximum numeric value (for range-based tags) */
  max?: number;
  /** Whether this tag uses a text prompt instead of numeric value */
  usePrompt?: boolean;
}

/**
 * All available tag specifications
 */
export const TAG_SPECIFICATIONS: Record<TagType, TagSpecification> = {
  scene:      { color: '#FF6B6B', name: 'Scene', constructRule: 'plain', usePrompt: true },
  camera:     { color: '#FFE66D', name: 'Camera', constructRule: 'json', min: 0, max: 360 },
  rotation:   { color: '#4ECDC4', name: 'Rotation', constructRule: 'json', min: -180, max: 180 },
  lighting:   { color: '#45B7D1', name: 'Lighting', constructRule: 'plain', usePrompt: true },
  effect:     { color: '#96CEB4', name: 'Effect', constructRule: 'markdown', usePrompt: true },
  zoom:       { color: '#DDA0DD', name: 'Zoom', constructRule: 'json', min: 0.5, max: 5 },
  transition: { color: '#FF6B35', name: 'Transition', constructRule: 'plain', usePrompt: true },
};

/**
 * FPS presets for video generation
 */
export const FPS_PRESETS = [18, 24, 30, 48, 60];

/**
 * Resolution dimensions mapping
 */
export const RESOLUTION_DIMS: Record<ResolutionPreset, Record<Orientation, { width: number; height: number }>> = {
  '480p': {
    horizontal: { width: 854, height: 480 },
    vertical: { width: 480, height: 854 },
    square: { width: 480, height: 480 },
  },
  '720p': {
    horizontal: { width: 1280, height: 720 },
    vertical: { width: 720, height: 1280 },
    square: { width: 720, height: 720 },
  },
  '1080p': {
    horizontal: { width: 1920, height: 1080 },
    vertical: { width: 1080, height: 1920 },
    square: { width: 1080, height: 1080 },
  },
};

/**
 * 0012: round a dimension to the nearest even value. libx264 and the
 * compose lossless gate both require even W/H; `roundEven` is the single
 * normalization applied BEFORE any comparison or ffmpeg filter (edge 1.5).
 * Mirrored in Rust (`round_even` in `src-tauri/src/generation/types.rs`).
 */
export function roundEven(v: number): number {
  return Math.max(0, Math.round(v / 2) * 2);
}

/**
 * 0012: effective session target size (W x H) for compose normalization.
 * - Both `customWidth` AND `customHeight` present and valid (32..=8192) ->
 *   the custom pair (round-even'd).
 * - Otherwise -> `RESOLUTION_DIMS[resolution][orientation]`.
 * A partial custom (one value set) is treated as unset (edge 1.3).
 */
export function effectiveTargetDims(
  resolution: ResolutionPreset,
  orientation: Orientation,
  customWidth?: number | null,
  customHeight?: number | null,
): { width: number; height: number } {
  if (
    typeof customWidth === 'number' &&
    typeof customHeight === 'number' &&
    customWidth >= 32 &&
    customWidth <= 8192 &&
    customHeight >= 32 &&
    customHeight <= 8192
  ) {
    return { width: roundEven(customWidth), height: roundEven(customHeight) };
  }
  const res = (RESOLUTION_DIMS as any)[resolution] ? resolution : '720p';
  const ori = (RESOLUTION_DIMS as any)[res] && (RESOLUTION_DIMS as any)[res][orientation]
    ? orientation
    : 'horizontal';
  return RESOLUTION_DIMS[res as ResolutionPreset][ori];
}

/**
 * 0012: session target as a display label, e.g. "1920×1080 (16:9)" or
 * "1080×1080 (1:1)". The ratio is the target's own W:H reduced; it may
 * differ from the provider's `aspect_ratio` request hint (R-1/R-2).
 */
export function targetDimsLabel(
  resolution: ResolutionPreset,
  orientation: Orientation,
  customWidth?: number | null,
  customHeight?: number | null,
): string {
  const { width, height } = effectiveTargetDims(resolution, orientation, customWidth, customHeight);
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const g = gcd(width, height) || 1;
  return `${width}×${height} (${width / g}:${height / g})`;
}

/**
 * Calculate max frames for a resolution
 */
export function getMaxFramesForResolution(resolution: ResolutionPreset): number {
  switch (resolution) {
    case '480p': return 441;
    case '720p': return 241;
    case '1080p': return 121;
  }
}

/**
 * Validate frame count follows 8n+1 rule
 */
export function isValidFrameCount(frames: number): boolean {
  return (frames - 1) % 8 === 0;
}

/**
 * Snap frame count to nearest valid 8n+1 value
 */
export function snapTo8nPlus1(frames: number): number {
  return Math.floor((frames - 1) / 8) * 8 + 1;
}

// ============================================================================
// NESTED PIPE STRUCTURE
// ============================================================================

/**
 * A single tag within a segment timeline
 * Each tag has its own frame range (bounded by parent segment)
 */
export interface TagElement {
  id: string;
  tag: TagType;
  frameStart: number;
  frameEnd: number;
  value: number;
  prompt?: string;
  spec: TagSpecification;
}

/**
 * A segment in the timeline — contains multiple tags for the same time range
 * Acts as a parent container for tags
 */
export interface Segment {
  id: string;
  frameStart: number;
  frameEnd: number;
  tags: TagElement[];
}

/**
 * Global style element — temporal range spanning part or all of the pipe.
 * Rendered as a static range bar in the TimelineSection coordinate canvas
 * (pointer-events: none; toggle/remove only — no drag-resize UI yet).
 */
export interface GlobalElement {
  id: string;
  tag: 'global_style';
  /** Start frame (multiple of 8) */
  frameStart: number;
  /** End frame (multiple of 8, ≤ totalFrames - 1) */
  frameEnd: number;
  enabled: boolean;
  /** Prompt for the global style zone (the primary text source) */
  prompt?: string;
  /** Legacy text value — kept for backward compat; falls back when no prompt */
  value?: string;
}

/**
 * Sound element — global-alike: a temporal range bar like Global, with its
 * own prompt that feeds the generated prompt as a `sound:` section.
 */
export interface SoundElement {
  id: string;
  tag: 'sound';
  /** Start frame (multiple of 8) */
  frameStart: number;
  /** End frame (multiple of 8, ≤ totalFrames - 1) */
  frameEnd: number;
  enabled: boolean;
  /** Prompt for the sound zone */
  prompt?: string;
}

/**
 * Timeline element — contains segments (mid tier)
 * Only one allowed per pipe
 */
export interface TimelineElement {
  id: string;
  tag: 'timeline';
  segments: Segment[];
}

/**
 * Pipe element — top-level abstraction in a pipe
 * Can be either Global or Timeline (mutually exclusive at pipe level)
 */
export type PipeElement = GlobalElement | SoundElement | TimelineElement;

/**
 * Single keyframe in a pipe
 */
export interface PipeKeyframe {
  id: string;
  frame: number;
  slotIndex: number;  // 1, 2, or 3
  type: KeyframeType;
  /**
   * `url` keyframes: the user-supplied remote image URL. For generated
   * (txt2img / img2img) keyframes this stays undefined — the generated
   * artifact lives in previewLocalPath / previewRemoteUrl.
   */
  imageSrc?: string;
  prompt?: string;
  referenceUrl?: string;
  /**
   * Generated-image preview pair (post-generation artifact), set on every
   * valid keyframe after a successful run:
   *  - previewRemoteUrl: the provider's remote output URL — primary source
   *    for the video API (fetchable by the provider).
   *  - previewLocalPath: the local media-tree file — UI chip preview +
   *    fallback for the video API when the remote URL is unreachable.
   * Both round-trip through the composer config so they survive restarts.
   */
  previewRemoteUrl?: string;
  previewLocalPath?: string;
  status: GenerationStatus;
  /**
   * Queued for regeneration: the user asked the dot to re-make this asset on
   * the next generation run. The settled preview data is kept (the asset
   * stays "valid"); only the Ready-skip in the registry is overridden so the
   * piece regenerates. Cleared automatically when the fresh artifact is
   * attached (attachGeneratedImage).
   */
  forceRegen?: boolean;
  /**
   * 0012 Phase 4: explicit image-generation size override for THIS piece
   * (a provider tier from the model catalog, e.g. "2K"). `undefined` = use
   * the session default. Affects only the request tier/ratio (R-3), never
   * the image bytes. Absent on legacy rows.
   */
  imageSize?: string | null;
  /** 0012 Phase 4: explicit image-generation ratio override (e.g. "1:1"). */
  imageRatio?: string | null;
}

export interface SubjectReference {
  id: string;
  /**
   * Remote image URL for `url`-type references. For generated subjects
   * (txt2img / img2img) the generated artifact lives in previewLocalPath /
   * previewRemoteUrl instead.
   */
  imageUrl: string;
  /**
   * Generation preset type — subjects follow the same rules as keyframes:
   * `url` → imageUrl is the image, `txt2img` → prompt generates it,
   * `img2img` → imageUrl is the reference + prompt. Legacy refs default 'url'.
   */
  type?: KeyframeType;
  /** Prompt for txt2img / img2img subjects */
  prompt?: string;
  /**
   * Generated-image preview pair (same semantics as PipeKeyframe).
   */
  previewRemoteUrl?: string;
  previewLocalPath?: string;
  /** Generation status of this reference's image */
  status?: GenerationStatus;
  /** Whether to use frame range for this reference */
  useFrames: boolean;
  /** Start frame (multiple of 8) — only used when useFrames=true */
  frameStart?: number;
  /** End frame (multiple of 8) — only used when useFrames=true */
  frameEnd?: number;
  /** Visible toggle (OBSOLETE — the eye mechanic was removed; the field is
   *  kept only so legacy data still parses. No UI affordance, no effect on
   *  counts or generation. Do not re-use. */
  visible?: boolean;
  /**
   * Queued for regeneration (see PipeKeyframe.forceRegen). Clicking the
   * status dot sets this; the next run regenerates the piece while the
   * settled preview data is kept. Cleared by attachGeneratedImage.
   */
  forceRegen?: boolean;
  /**
   * 0012 Phase 4: explicit image-generation size override for THIS subject
   * (None/undefined = use the session default; R-3: request tier/ratio only).
   */
  imageSize?: string | null;
  /** 0012 Phase 4: explicit image-generation ratio override (e.g. "1:1"). */
  imageRatio?: string | null;
}

/**
 * A single pipe row in the composer
 * Contains: keyframes, subject references, settings, and pipeline elements (Global OR Timeline)
 */
export interface PipeRow {
  id: string;
  name: string;
  lengthFrames: number;
  qValue: number;    // num_inference_steps
  cValue: number;    // cfg_scale / guidance_scale
  keyframes: PipeKeyframe[];
  /** Subject references — max 5, each with its own temporal range */
  subjectReferences: SubjectReference[];
  elements: PipeElement[];
  orderIndex: number;
  /** Last completed generation artifact attached to this pipe (null = empty state) */
  lastGeneration?: PipeLastGeneration | null;
  /** Media mode for this pipe (docs/agnes-model-catalog.md, Q7). Default
   *  'keyframes'. Drives keyframes/subject-refs row visibility per the
   *  configured video model's media capabilities. */
  mediaMode?: 'keyframes' | 'reference';
  /** Experimental "compose pipes" boundary-trim: when ON (and the master
   *  settings gate experimental.composePipes is on) the session-video compose
   *  drops one 8n+1 keyframe interval off this pipe's clip head so the
   *  splice lands in stable content. Absent/legacy rows default to
   *  false = classic lossless back-to-back splice. Pipe 0 is never offered
   *  the toggle (nothing precedes it). */
  trimBoundary?: boolean;
  /** 0012 D2: per-pipe crop-mode override for the session-video compose.
   *  When set, THIS pipe's clip is normalized under its own crop mode
   *  (center|fit|top|bottom|exact|none) instead of the session-global
   *  `cropMode`. Absent/legacy rows default to `null` = fall back to the
   *  session crop mode (the classic behavior). */
  cropOverride?: CropMode | null;
}

/**
 * The generated-video artifact attached to a pipe after a generation task
 * completes (absent while no engine has produced a real file yet).
 */
export interface PipeLastGeneration {
  taskId: string;
  /** Absolute path of the generated video on disk */
  videoPath: string;
  /** Unix ms timestamp of completion */
  generatedAt: number;
  status: 'done' | 'error' | 'cancelled';
}

// ============================================================================
// GENERATION TASK VIEWS (mirror src-tauri/src/generation/types.rs)
// ============================================================================

export type GenerationStageStatus = 'ready' | 'pending' | 'generating' | 'rate-limited' | 'done' | 'error' | 'cancelled';
export type GenerationTaskStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled';

export interface GenerationStageView {
  id: string;
  label: string;
  kind: 'image' | 'video';
  /** Where the stage's input comes from */
  sourceKind: 'keyframe' | 'subject' | 'video';
  /** keyframe id / subject ref id / pipe id for the video stage */
  sourceId: string;
  status: GenerationStageStatus;
  /** 0..=1 — reflects real stage state only, never simulated */
  progress: number;
  error?: string | null;
  /** Local path of the generated image artifact (image stages only). */
  imageOutput?: string | null;
  /** Provider remote URL returned for this image (image stages only) —
   *  the primary fetchable source for the next video run. */
  imageRemoteUrl?: string | null;
  /** Short live state line from the engine (e.g. "queue full — retry in 30 s",
   *  "rendering 42%"). Deliberately terse — the full request/response detail
   *  stays in the redacted request log (E1), not here. */
  lastEvent?: string | null;
  /** Unix ms timestamp of lastEvent (drives the modal's "last activity" line). */
  lastEventAt?: number | null;
  /** Unix ms the stage first entered the 503/429 backoff band (video stages);
   *  cleared when it leaves the band. Drives the modal's "provider load looks
   *  broken" notice after a long saturation. */
  saturatedSince?: number | null;
}

export interface GenerationTaskView {
  taskId: string;
  sessionId: string;
  pipeId: string;
  status: GenerationTaskStatus;
  /** 0..=1, average of stage progress */
  progress: number;
  stages: GenerationStageView[];
  error?: string | null;
  outputPath?: string | null;
  /** Redacted request/response log file (Phase E, E1); expandable in the progress modal. */
  requestLog?: string | null;
  /** Unix ms the task started running (0 = unknown / pre-migration DB row →
   *  the modal shows no elapsed timer). Drives the live "elapsed" counter so
   *  a long provider queue-full wait reads as alive, not stuck. */
  startedAt?: number;
}

/**
 * Focus model for the context-sensitive tool panel.
 * Levels: project (summary) → session (video settings + generation) →
 * pipe (pipe generation settings + last-gen preview) → segment/tag (prompt
 * + related settings). The tool panel renders one inspector per level.
 */
export type ComposerFocus =
  | { level: 'project' }
  | { level: 'session'; id: string }
  | { level: 'pipe'; pipeId: string }
  | { level: 'segment'; pipeId: string; segmentId: string }
  | { level: 'tag'; pipeId: string; segmentId: string; tagId: string };

/**
 * Session data
 */
export interface SessionData {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  directoryPath: string;
  pipes: PipeRow[];
  fps: number;
  resolution: ResolutionPreset;
  orientation: Orientation;
  /** 0012: video-normalization crop mode. Absent/legacy -> "center". */
  cropMode?: CropMode;
  /** 0012: optional custom session target size (both present = active). */
  customWidth?: number | null;
  customHeight?: number | null;
  totalGeneratedFrames: number;
}

/**
 * Project data
 */
export interface ProjectData {
  id: string;
  name: string;
  createdAt: number;
  directoryPath: string;
  sessions: SessionData[];
  totalGenerations: number;
  profileId?: string;
  /** Timestamp of last modification (set by Workspace on project mutations) */
  updatedAt?: number;
}

/**
 * A project-attached file (image/audio/etc. the user can reference in a session)
 */
export interface ProjectFile {
  id: string;
  fileName: string;
  filePath: string;
  fileType: string;
  fileSize: number;
  addedAt: number;
}

/**
 * Application state
 */
export interface AppState {
  userName: string;
  projects: ProjectData[];
  selectedProjectId: string | null;
  selectedSessionId: string | null;
  theme: string;
  layout: string;
}
