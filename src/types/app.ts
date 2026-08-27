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
  slot_index: number;  // 1, 2, or 3
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
  lengthFrames: number;
  keyframes: PipeKeyframe[];
  qValue: number;
  cValue: number;
  elements: PipeElement[];  // Array of GlobalElement and/or TimelineElement
  // Backward compatibility — will be deprecated
  globalNodes?: GlobalNode[];
  segments?: PromptSegment[];
}

/**
 * Legacy prompt segment for backward compatibility
 * @deprecated Use Segment + TagElement instead
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
 * Legacy global node for backward compatibility
 * @deprecated Use GlobalElement instead
 */
export interface GlobalNode {
  id: string;
  tag: 'global_style';
  value: string;
  enabled: boolean;
}

/**
 * Legacy global prompt for backward compatibility
 * @deprecated Use GlobalElement instead
 */
export interface PipeGlobalPrompt {
  text: string;
}

/**
 * Migrate old pipe to new nested structure
 * @deprecated Use migratePipeToNested instead
 */
export function migratePipeToTwoLayer(pipe: PipeRow): PipeRow {
  return migratePipeToNested(pipe);
}

/**
 * Alias for backward compatibility
 * @deprecated Use validateTagElements or validateTimelineSegments instead
 */
export function validatePromptSegments(segments: PromptSegment[]): { valid: boolean; errors: string[] } {
  // Convert legacy segments to tag elements and validate
  const tags: TagElement[] = segments.map(s => ({
    id: s.id,
    tag: s.tag,
    frameStart: s.frameStart,
    frameEnd: s.frameEnd,
    value: s.value,
    prompt: s.prompt,
    spec: s.spec,
  }));
  
  return validateTagElements(tags);
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
 * Create empty session with default pipe (nested structure)
 */
export function createEmptySession(projectName: string, directoryPath: string): SessionData {
  // Create default pipe with empty Timeline
  const pipe: PipeRow = {
    id: crypto.randomUUID(),
    lengthFrames: 121,
    keyframes: [],
    qValue: 18,
    cValue: 7,
    elements: [{
      id: crypto.randomUUID(),
      segments: [],
    }],
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
 * Validate tag elements have no overlapping ranges for same tag type within a segment
 */
export function validateTagElements(tags: TagElement[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const tagRanges = new Map<TagType, Array<{ start: number; end: number; index: number }>>();

  tags.forEach((tag, idx) => {
    if (!tagRanges.has(tag.tag)) {
      tagRanges.set(tag.tag, []);
    }
    tagRanges.get(tag.tag)!.push({ start: tag.frameStart, end: tag.frameEnd, index: idx });
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
            `Overlap detected for <${tag}> between tags ${a.index} (${a.start}-${a.end}) and ${b.index} (${b.start}-${b.end})`
          );
        }
      }
    }
  });

  // Validate frame bounds
  tags.forEach((tag, idx) => {
    if (tag.frameStart < 0 || tag.frameEnd < 0) {
      errors.push(`Tag ${idx}: frames must be non-negative`);
    }
    if (tag.frameEnd <= tag.frameStart) {
      errors.push(`Tag ${idx}: frameEnd must be greater than frameStart`);
    }
    if (tag.frameEnd - tag.frameStart < 8) {
      errors.push(`Tag ${idx}: minimum span is 8 frames`);
    }
    if (tag.frameStart % 8 !== 0 || tag.frameEnd % 8 !== 0) {
      errors.push(`Tag ${idx}: frame positions must be multiples of 8`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate segment timeline — segments should not overlap
 */
export function validateTimelineSegments(segments: Segment[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const a = segments[i];
      const b = segments[j];
      // Check overlap
      if (a.frameStart < b.frameEnd && b.frameStart < a.frameEnd) {
        errors.push(
          `Overlap detected between segments ${i} (${a.frameStart}-${a.frameEnd}) and ${j} (${b.frameStart}-${b.frameEnd})`
        );
      }
    }
  }
  
  // Validate each segment's tags
  segments.forEach((seg, segIdx) => {
    const tagValidation = validateTagElements(seg.tags);
    if (!tagValidation.valid) {
      errors.push(...tagValidation.errors.map(e => `Segment ${segIdx}: ${e}`));
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
  return `${baseName}_${timestamp}`;
}
