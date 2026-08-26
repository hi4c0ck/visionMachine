// Core data types for VisionMachine app

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

/**
 * Segment timeline range within a pipe
 */
export interface PromptSegment {
  id: string;
  frameStart: number;
  frameEnd: number;
  tag: TagType;
  value: number;
  spec: TagSpecification;
  prompt?: string;
}

/**
 * Global node for two-layer prompt hierarchy (R1)
 */
export interface GlobalNode {
  id: string;
  tag: 'global_style';
  value: string;
  enabled: boolean;
}

/**
 * Global prompt for entire pipe (deprecated alias, use globalNodes instead)
 */
export interface PipeGlobalPrompt {
  text: string;
}

/**
 * Single keyframe in a pipe
 */
export interface PipeKeyframe {
  id: string;
  frame: number;
  slot_index: number;  // 1, 2, or 3
  type: KeyframeType;
  imageSrc?: string;
  prompt?: string;
  referenceUrl?: string;
  status: GenerationStatus;
}

/**
 * A single pipe row in the composer
 */
export interface PipeRow {
  id: string;
  lengthFrames: number;
  keyframes: PipeKeyframe[];
  qValue: number;
  cValue: number;
  globalPrompt?: PipeGlobalPrompt;           // deprecated - use globalNodes
  globalNodes?: GlobalNode[];                // two-layer hierarchy (R1)
  segments: PromptSegment[];
}

/**
 * Migrate old sessions with globalPrompt to new globalNodes format
 */
export function migratePipeToTwoLayer(pipe: PipeRow): PipeRow {
  if (pipe.globalNodes && pipe.globalNodes.length > 0) {
    return pipe; // already migrated
  }
  const newNode: GlobalNode | null = pipe.globalPrompt
    ? { id: crypto.randomUUID(), tag: 'global_style', value: pipe.globalPrompt.text, enabled: true }
    : null;
  return {
    ...pipe,
    globalNodes: newNode ? [newNode] : [],
    globalPrompt: undefined,
  };
}

/**
 * Session data - represents a complete video project
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
 * Project data - contains multiple sessions
 */
export interface ProjectData {
  id: string;
  name: string;
  createdAt: number;
  directoryPath: string;
  sessions: SessionData[];
  totalGenerations: number;
}

/**
 * Application state
 */
export interface AppState {
  userName: string;
  selectedProjectId: string | null;
  selectedSessionId: string | null;
  projects: ProjectData[];
}

/**
 * Create empty project
 */
export function createEmptyProject(name: string, directoryPath: string): ProjectData {
  return {
    id: crypto.randomUUID(),
    name,
    createdAt: Date.now(),
    directoryPath,
    sessions: [],
    totalGenerations: 0,
  };
}

/**
 * Create empty session with default pipe
 */
export function createEmptySession(projectName: string, directoryPath: string): SessionData {
  const pipe: PipeRow = {
    id: crypto.randomUUID(),
    lengthFrames: 121,
    keyframes: [],
    qValue: 18,
    cValue: 7,
    segments: [],
  };
  
  return {
    id: crypto.randomUUID(),
    name: projectName ? `${projectName}_session_1` : 'Untitled Session',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    directoryPath,
    pipes: [pipe],
    fps: 24,
    resolution: '720p',
    orientation: 'horizontal',
    totalGeneratedFrames: 0,
  };
}

/**
 * Validate prompt segments have no overlapping ranges for same tag type
 */
export function validatePromptSegments(segments: PromptSegment[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const tagRanges = new Map<TagType, Array<{ start: number; end: number; index: number }>>();

  segments.forEach((seg, idx) => {
    if (!tagRanges.has(seg.tag)) {
      tagRanges.set(seg.tag, []);
    }
    tagRanges.get(seg.tag)!.push({ start: seg.frameStart, end: seg.frameEnd, index: idx });
  });

  // Check for overlaps within each tag type
  tagRanges.forEach((ranges, tag) => {
    for (let i = 0; i < ranges.length; i++) {
      for (let j = i + 1; j < ranges.length; j++) {
        const a = ranges[i];
        const b = ranges[j];
        // Check overlap: a.start < b.end && b.start < a.end
        if (a.start < b.end && b.start < a.end) {
          errors.push(
            `Overlap detected for <${tag}> between segments ${a.index} (${a.start}-${a.end}) and ${b.index} (${b.start}-${b.end})`
          );
        }
      }
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Generate unique folder name for session
 */
export function generateSessionFolderName(baseName: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${baseName.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}`;
}
