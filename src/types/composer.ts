// Data models for VisionMachine Composer

/**
 * Tag types available in pipe prompts
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
	/** Special construction rule for text output (e.g., JSON, XML, plain text) */
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
		vertical:   { width: 480, height: 854 },
	},
	'720p': {
		horizontal: { width: 1280, height: 720 },
		vertical:   { width: 720, height: 1280 },
	},
	'1080p': {
		horizontal: { width: 1920, height: 1080 },
		vertical:   { width: 1080, height: 1920 },
	},
};

/**
 * Calculate max frames for a resolution (based on GPU memory constraints)
 * 480p: max ~241 frames (for 441 max at 1080p scaled down)
 * 720p: max ~121 frames  
 * 1080p: max ~61 frames
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
 * Segment timeline range within a pipe prompt
 */
export interface PromptSegment {
	/** Unique identifier */
	id: string;
	/** Start frame (inclusive) */
	frameStart: number;
	/** End frame (exclusive) */
	frameEnd: number;
	/** Tag type for this segment */
	tag: TagType;
	/** Numeric value for this parameter */
	value: number;
	/** Specification for this tag type */
	spec: TagSpecification;
	/** Custom text prompt (optional, for non-numeric tags) */
	prompt?: string;
}

/**
 * Global prompt for a pipe
 */
export interface PipePrompt {
	/** Global context applied to entire pipe */
	global: string;
	/** Segment timelines with their parameters */
	segments: PromptSegment[];
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
 * Serialize prompt to text format based on construct rules
 */
export function serializePrompt(prompt: PipePrompt): string {
	const lines: string[] = [];

	// Add global context
	if (prompt.global) {
		lines.push(`// Global Context\n${prompt.global}\n`);
	}

	// Sort segments by frame start
	const sortedSegments = [...prompt.segments].sort((a, b) => a.frameStart - b.frameStart);

	// Add segments
	sortedSegments.forEach((seg, idx) => {
		const duration = seg.frameEnd - seg.frameStart;
		const prefix = getTagPrefix(seg.tag, seg.spec.constructRule);
		
		switch (seg.spec.constructRule) {
			case 'json':
				lines.push(`${prefix} [${seg.frameStart}-${seg.frameEnd}]: ${JSON.stringify({ value: seg.value })}`);
				break;
			case 'xml':
				lines.push(`${prefix} [${seg.frameStart}-${seg.frameEnd}]`);
				lines.push(`  <param name="value">${seg.value}</param>`);
				lines.push(`/${prefix}`);
				break;
			case 'markdown':
				lines.push(`${prefix} [${seg.frameStart}-${seg.frameEnd}]: **${seg.value}**`);
				break;
			default:
				if (seg.prompt) {
					lines.push(`${prefix} [${seg.frameStart}-${seg.frameEnd}]: ${seg.prompt}`);
				} else {
					lines.push(`${prefix} [${seg.frameStart}-${seg.frameEnd}]: ${seg.value}`);
				}
		}
	});

	return lines.join('\n');
}

function getTagPrefix(tag: TagType, rule: string): string {
	switch (rule) {
		case 'json': return tag.charAt(0).toUpperCase() + tag.slice(1);
		case 'xml': return `</${tag}>`;
		default: return `[${tag.toUpperCase()}]`;
	}
}

/**
 * Single keyframe in a pipe
 */
export interface PipeKeyframe {
	id: string;
	/** Frame position (0-indexed) */
	frame: number;
	/** Source type */
	type: KeyframeType;
	/** Generated image URL (after generation completes) */
	imageSrc?: string;
	/** Text prompt for txt2img/img2img */
	prompt?: string;
	/** Reference image URL for img2img */
	referenceUrl?: string;
	/** Generation status */
	status: GenerationStatus;
}

/**
 * A single pipe row in the composer
 */
export interface PipeRow {
	id: string;
	/** Length in frames (must be 8n+1, min 41, max based on resolution) */
	lengthFrames: number;
	/** Keyframe images (max 3) */
	keyframes: PipeKeyframe[];
	/** Quality setting (num_inference_steps, 5-30) */
	qValue: number;
	/** Creativity setting (cfg_scale, 0.5-15) */
	cValue: number;
	/** Pipe prompt with global context and segments */
	prompt: PipePrompt;
}

/**
 * Mock preview object for generated content
 */
export interface PreviewObject {
	url: string;
	thumbnailUrl?: string;
	status: 'ready' | 'processing' | 'error';
}

/**
 * Main scene data structure for composer
 */
export interface SceneData {
	/** Unique scene identifier */
	id: string;
	/** Name/title of the scene */
	name: string;
	/** List of pipe rows */
	pipes: PipeRow[];
	/** Total length in frames (calculated from longest pipe) */
	totalLength: number;
	/** Frames per second */
	fps: number;
	/** Duration in seconds (calculated: totalLength / fps) */
	lengthSeconds: number;
	/** Resolution preset */
	resolution: ResolutionPreset;
	/** Video orientation */
	orientation: Orientation;
	/** Preview of generated content */
	preview?: PreviewObject;
}

/**
 * Create empty scene with defaults
 */
export function createEmptyScene(): SceneData {
	return {
		id: crypto.randomUUID(),
		name: 'New Scene',
		pipes: [
			createEmptyPipe(0),
			createEmptyPipe(1),
			createEmptyPipe(2),
			createEmptyPipe(3),
		],
		totalLength: 601, // Default: 75 segments of 8 frames + 1
		fps: 24,
		lengthSeconds: 25.0,
		resolution: '720p',
		orientation: 'horizontal',
	};
}

/**
 * Create empty pipe with defaults
 */
export function createEmptyPipe(index: number): PipeRow {
	return {
		id: `pipe-${index}`,
		lengthFrames: 121, // Default: 15 segments
		keyframes: [],
		qValue: 18,
		cValue: 7,
		prompt: {
			global: '',
			segments: [],
		},
	};
}

/**
 * Recalculate total length from all pipes
 */
export function recalculateTotalLength(scene: SceneData): number {
	if (scene.pipes.length === 0) return 0;
	const maxLen = Math.max(...scene.pipes.map(p => p.lengthFrames));
	return snapTo8nPlus1(maxLen);
}

/**
 * Recalculate length in seconds
 */
export function recalculateLengthSeconds(scene: SceneData): number {
	return parseFloat((scene.totalLength / scene.fps).toFixed(1));
}

/**
 * Add segment to pipe prompt with validation
 */
export function addPromptSegment(scene: SceneData, pipeId: string, segment: Omit<PromptSegment, 'id' | 'spec'>): { valid: boolean; errors: string[] } {
	const pipe = scene.pipes.find(p => p.id === pipeId);
	if (!pipe) return { valid: false, errors: ['Pipe not found'] };

	const spec = TAG_SPECIFICATIONS[segment.tag];
	const newSegment: PromptSegment = { 
		...segment, 
		id: `${Date.now()}-${Math.random()}`,
		spec,
	};

	// Validate bounds against pipe length
	if (newSegment.frameStart < 0 || newSegment.frameEnd > pipe.lengthFrames) {
		return {
			valid: false,
			errors: [`Segment out of bounds for pipe ${pipeId} (0-${pipe.lengthFrames})`]
		};
	}

	// Add segment
	pipe.prompt.segments.push(newSegment);

	// Validate no overlaps
	return validatePromptSegments(pipe.prompt.segments);
}

/**
 * Remove segment from pipe prompt
 */
export function removePromptSegment(scene: SceneData, pipeId: string, segmentId: string): boolean {
	const pipe = scene.pipes.find(p => p.id === pipeId);
	if (!pipe) return false;

	pipe.prompt.segments = pipe.prompt.segments.filter(s => s.id !== segmentId);
	return true;
}

/**
 * Update pipe length with validation
 */
export function updatePipeLength(scene: SceneData, pipeId: string, newLength: number): { valid: boolean; errors: string[] } {
	const snapped = snapTo8nPlus1(newLength);
	const minLen = 41; // Minimum 5 segments
	const maxLen = getMaxFramesForResolution(scene.resolution);

	if (snapped < minLen) {
		return { valid: false, errors: [`Minimum pipe length is ${minLen} frames`] };
	}
	if (snapped > maxLen) {
		return { valid: false, errors: [`Maximum pipe length is ${maxLen} frames for ${scene.resolution}`] };
	}

	const pipe = scene.pipes.find(p => p.id === pipeId);
	if (!pipe) return { valid: false, errors: ['Pipe not found'] };

	// Truncate segments that exceed new length
	pipe.prompt.segments = pipe.prompt.segments.filter(s => s.frameEnd <= snapped);
	pipe.lengthFrames = snapped;

	// Recalculate scene total length
	scene.totalLength = recalculateTotalLength(scene);
	scene.lengthSeconds = recalculateLengthSeconds(scene);

	return { valid: true, errors: [] };
}

/**
 * Add keyframe to pipe
 */
export function addKeyframe(scene: SceneData, pipeId: string, keyframe: Omit<PipeKeyframe, 'id' | 'status'>): { valid: boolean; errors: string[] } {
	const pipe = scene.pipes.find(p => p.id === pipeId);
	if (!pipe) return { valid: false, errors: ['Pipe not found'] };
	if (pipe.keyframes.length >= 3) {
		return { valid: false, errors: ['Maximum 3 keyframes per pipe'] };
	}

	pipe.keyframes.push({
		...keyframe,
		id: crypto.randomUUID(),
		status: 'pending',
	});

	return { valid: true, errors: [] };
}

/**
 * Remove keyframe from pipe
 */
export function removeKeyframe(scene: SceneData, pipeId: string, keyframeId: string): boolean {
	const pipe = scene.pipes.find(p => p.id === pipeId);
	if (!pipe) return false;

	pipe.keyframes = pipe.keyframes.filter(k => k.id !== keyframeId);
	return true;
}

/**
 * Update keyframe status
 */
export function updateKeyframeStatus(scene: SceneData, pipeId: string, keyframeId: string, status: GenerationStatus): boolean {
	const pipe = scene.pipes.find(p => p.id === keyframeId);
	if (!pipe) return false;

	const keyframe = pipe.keyframes.find(k => k.id === keyframeId);
	if (!keyframe) return false;

	keyframe.status = status;
	return true;
}

/**
 * Deserialize prompt from text
 */
export function deserializePrompt(text: string): PipePrompt {
	const globalMatch = text.match(/\/\/ Global Context\s*\n([\s\S]*?)(?=\n\[|$)/);
	const global = globalMatch ? globalMatch[1].trim() : '';

	const segments: PromptSegment[] = [];
	const segmentRegex = /\[(\w+)\]\s*\[(\d+)-(\d+)\]:\s*(.+?)(?=\n\[|$)/g;
	let match;

	while ((match = segmentRegex.exec(text)) !== null) {
		const tag = match[1].toLowerCase() as TagType;
		const frameStart = parseInt(match[2]);
		const frameEnd = parseInt(match[3]);
		const valueStr = match[4].trim();

		// Try to parse as JSON first
		let value = 0;
		try {
			const json = JSON.parse(valueStr);
			value = json.value ?? 0;
		} catch {
			value = parseInt(valueStr) ?? 0;
		}

		const spec = TAG_SPECIFICATIONS[tag] || TAG_SPECIFICATIONS.scene;
		segments.push({
			id: `${Date.now()}-${Math.random()}`,
			frameStart,
			frameEnd,
			tag,
			value,
			spec,
		});
	}

	return { global, segments };
}
