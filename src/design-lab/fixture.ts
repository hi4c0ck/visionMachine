// ─────────────────────────────────────────────────────────────────────────────
// Design Lab — shared deterministic fixture.
//
// One fictional-but-realistic editing session rendered identically by all
// three visual-language templates (A / B / C). Nothing here touches the
// composer store, Tauri IPC, or the database — it is a pure data snapshot of
// the real PipeRow/SessionData shapes so the gallery can be evaluated
// without a running backend.
//
// Media: restrained inline-SVG frames that stand in for GENERATED application
// content (keyframe thumbnails / preview frame). They are intentionally plain
// cinematic gradients with horizon geometry — not decorative illustrations.
// ─────────────────────────────────────────────────────────────────────────────

import { TAG_SPECIFICATIONS, type TagType, type Segment, type GlobalElement, type SoundElement, type TimelineElement, type PipeRow, type ProjectData } from '$types';

/** Deterministic 1280×720 placeholder frames (generated-content stand-ins). */
function svgFrame(bg: [string, string, string], sun: string, sunX: number, sunY: number, sunR: number, ridge1: string, ridge2: string, haze: string): string {
	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">` +
		`<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">` +
		`<stop offset="0" stop-color="${bg[0]}"/><stop offset="0.55" stop-color="${bg[1]}"/><stop offset="1" stop-color="${bg[2]}"/>` +
		`</linearGradient></defs>` +
		`<rect width="1280" height="720" fill="url(#sky)"/>` +
		`<circle cx="${sunX}" cy="${sunY}" r="${sunR}" fill="${sun}" opacity="0.85"/>` +
		`<path d="M0,470 L260,380 L520,452 L780,360 L1040,440 L1280,392 L1280,720 L0,720 Z" fill="${ridge1}"/>` +
		`<path d="M0,560 L320,480 L640,556 L960,470 L1280,540 L1280,720 L0,720 Z" fill="${ridge2}"/>` +
		`<rect x="0" y="640" width="1280" height="80" fill="${haze}" opacity="0.5"/>` +
		`</svg>`;
	return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const FRAME_IMAGES = {
	/** Preview frame — a recognizable subject (warm sun) in a landscape scene. */
	preview: svgFrame(['#2a3550', '#5a4a5e', '#c98a4b'], '#ffd9a0', 980, 210, 92, '#3a3550', '#241f33', '#191622'),
	/** k1 — wide establishing frame. */
	key1: svgFrame(['#22304a', '#4a4a66', '#a8703f'], '#ffe2b0', 340, 240, 70, '#31314c', '#1f1d30', '#151322'),
	/** k2 — mid-shot, cooler dusk. */
	key2: svgFrame(['#1d2a3d', '#37455c', '#6d5a4a'], '#cfe0ee', 1050, 180, 54, '#2b3a4d', '#1a2433', '#121a26'),
	/** k3 — end frame, low light. */
	key3: svgFrame(['#171c2b', '#2c3145', '#584a3c'], '#e8c07a', 560, 150, 44, '#232a3a', '#161b28', '#0f131d'),
	/** Subject reference — a subject against a neutral field. */
	subject: svgFrame(['#20242e', '#3a3f4d', '#6b6458'], '#d8dce8', 640, 260, 110, '#2b3040', '#1a1e29', '#101420'),
};

function tag(id: string, tag: TagType, frameStart: number, frameEnd: number, prompt?: string): { id: string; tag: TagType; frameStart: number; frameEnd: number; value: number; prompt?: string; spec: (typeof TAG_SPECIFICATIONS)[TagType] } {
	return { id, tag, frameStart, frameEnd, value: 0, prompt, spec: TAG_SPECIFICATIONS[tag] };
}

/** The single main zone: 8–168. Its nested instruction spans:
 *  Camera — Pan left (selected in the inspector), Lighting — Warm light,
 *  Effect — Dust particles. */
const segments: Segment[] = [
	{
		id: 'seg-1',
		frameStart: 8,
		frameEnd: 168,
		tags: [
			tag('tag-camera-1', 'camera', 8, 56, 'Pan left'),
			tag('tag-lighting-1', 'lighting', 8, 120, 'Warm light'),
			tag('tag-effect-1', 'effect', 72, 160, 'Dust particles'),
		],
	},
];

const timeline: TimelineElement = { id: 'tl-1', tag: 'timeline', segments };
const globalEl: GlobalElement = {
	id: 'glob-1', tag: 'global_style', frameStart: 0, frameEnd: 240, enabled: true,
	prompt: 'Cinematic look, soft film grain',
};
const soundEl: SoundElement = {
	id: 'snd-1', tag: 'sound', frameStart: 0, frameEnd: 240, enabled: true,
	prompt: 'Wind, low ambient',
};

export const PIPE: PipeRow = {
	id: 'pipe-shot-01',
	name: 'Shot 01',
	lengthFrames: 241,
	qValue: 18,
	cValue: 7,
	keyframes: [
		{ id: 'kf-1', frame: 0, slotIndex: 1, type: 'txt2img', imageSrc: FRAME_IMAGES.key1, prompt: 'Wide valley at golden hour, lone rider on the ridge', status: 'done' },
		{ id: 'kf-2', frame: 120, slotIndex: 2, type: 'txt2img', imageSrc: FRAME_IMAGES.key2, prompt: 'Mid shot, rider cresting the ridge', status: 'done' },
		{ id: 'kf-3', frame: 240, slotIndex: 3, type: 'img2img', imageSrc: FRAME_IMAGES.key3, referenceUrl: FRAME_IMAGES.key2, prompt: 'Low light settle, dust in the air', status: 'done' },
	],
	subjectReferences: [
		{ id: 'sr-1', imageUrl: FRAME_IMAGES.subject, type: 'txt2img', prompt: 'Rider on horseback, weathered coat', status: 'done', useFrames: false },
	],
	elements: [timeline, globalEl, soundEl],
	orderIndex: 0,
	mediaMode: 'keyframes',
};

/** Project → session → pipe snapshot used by the left rail + settings. */
export const FIXTURE_PROJECT: ProjectData = {
	id: 'proj-untitled',
	name: 'Untitled Film',
	createdAt: 1750000000000,
	directoryPath: '',
	sessions: [
		{
			id: 'seq-01',
			name: 'Sequence 01',
			createdAt: 1750000000000,
			updatedAt: 1750000000000,
			directoryPath: '',
			pipes: [PIPE],
			fps: 24,
			resolution: '720p',
			orientation: 'horizontal',
			totalGeneratedFrames: 482,
		},
	],
	totalGenerations: 482,
};

/** The tag the inspector has selected: "Camera — Pan left". */
export const SELECTED_TAG_ID = 'tag-camera-1';

/** Session fps — drives the ruler pin seconds readout, like the real app. */
export const SESSION_FPS = 24;
