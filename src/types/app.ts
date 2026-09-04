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
export type Orientation = 'horizontal' | 'vertical';

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
  '480p': { horizontal: { width: 854, height: 480 }, vertical: { width: 480, height: 854 } },
  '720p': { horizontal: { width: 1280, height: 720 }, vertical: { width: 720, height: 1280 } },
  '1080p': { horizontal: { width: 1920, height: 1080 }, vertical: { width: 1080, height: 1920 } },
};

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
 * Global style element — applies to entire pipe (top tier)
 * Only one allowed per pipe
 */
export interface GlobalElement {
  id: string;
  tag: 'global_style';
  value: string;
  enabled: boolean;
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
export type PipeElement = GlobalElement | TimelineElement;

/**
 * Single keyframe in a pipe
 */
export interface PipeKeyframe {
  id: string;
  frame: number;
  slotIndex: number;  // 1, 2, or 3
  type: KeyframeType;
  imageSrc?: string;
  prompt?: string;
  referenceUrl?: string;
  status: GenerationStatus;
}

/**
 * A single pipe row in the composer
 * Contains: keyframes, settings, and pipeline elements (Global and/or Timeline)
 */
export interface PipeRow {
  id: string;
  name: string;
  lengthFrames: number;
  qValue: number;    // num_inference_steps
  cValue: number;    // cfg_scale
  keyframes: PipeKeyframe[];
  elements: PipeElement[];
  orderIndex: number;
}

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
