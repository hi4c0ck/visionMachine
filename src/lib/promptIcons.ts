// Video-prompt icon atlas — maps canonical tag phrases to sprite symbol ids
// (from .agnes/artifacts/video-prompt-icons/sprite.svg, 91 marks) and to a
// viewport position so the tag-prompt modal can float each mark around the
// prompt editor like a miniature camera rig: directional marks sit on the
// side they describe ("pan left" → left, "tilt up" → top).
//
// Viewport slots around the centered textarea:
//   top:    nw · n · ne
//   sides:  w            e
//   bottom: sw · s · se
// Plus `center` for the single "this is the subject" marks.

import type { TagType } from '$types';

export interface AtlasIcon {
	/** Atlas display tag, e.g. "pan left" */
	tag: string;
	/** Sprite symbol id, e.g. "cam-pan-left" */
	id: string;
	/** Human meaning, e.g. "Horizontal rotation to the left" */
	meaning: string;
	/** Viewport slot */
	pos: 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se';
}

// Per-tag-type viewport sets. Only marks that plausibly belong to the type
// are shown, each on the side of the frame it affects.
const CAMERA_ICONS: AtlasIcon[] = [
	{ tag: 'pan left', id: 'cam-pan-left', meaning: 'Horizontal rotation to the left', pos: 'nw' },
	{ tag: 'tilt up', id: 'cam-tilt-up', meaning: 'Vertical rotation upward', pos: 'n' },
	{ tag: 'pan right', id: 'cam-pan-right', meaning: 'Horizontal rotation to the right', pos: 'ne' },
	{ tag: 'truck left', id: 'cam-truck-left', meaning: 'Lateral travel to the left', pos: 'w' },
	{ tag: 'truck right', id: 'cam-truck-right', meaning: 'Lateral travel to the right', pos: 'e' },
	{ tag: 'tilt down', id: 'cam-tilt-down', meaning: 'Vertical rotation downward', pos: 'sw' },
	{ tag: 'dolly in', id: 'zoom-in', meaning: 'Camera moves toward subject', pos: 's' },
	{ tag: 'static shot', id: 'cam-static', meaning: 'Camera remains fixed', pos: 'se' },
];

const ZOOM_ICONS: AtlasIcon[] = [
	{ tag: 'zoom in', id: 'zoom-in', meaning: 'Frame progressively tightens', pos: 'nw' },
	{ tag: 'slow zoom in', id: 'zoom-in-slow', meaning: 'Gradual zoom toward subject', pos: 'n' },
	{ tag: 'zoom out', id: 'zoom-out', meaning: 'Frame progressively widens', pos: 'ne' },
	{ tag: 'crash zoom in', id: 'zoom-in-crash', meaning: 'Sudden aggressive zoom inward', pos: 'w' },
	{ tag: 'dramatic zoom out', id: 'zoom-out-dramatic', meaning: 'Strong contextual reveal', pos: 'e' },
	{ tag: 'slow zoom out', id: 'zoom-out-slow', meaning: 'Gradual widening', pos: 'sw' },
	{ tag: 'dolly zoom', id: 'dolly-zoom', meaning: 'Vertigo: subject stable, space stretches', pos: 's' },
];

const ROTATION_ICONS: AtlasIcon[] = [
	{ tag: 'rotate clockwise', id: 'rot-cw', meaning: 'Clockwise rotation', pos: 'nw' },
	{ tag: 'quarter turn', id: 'rot-90', meaning: 'Approximately 90° turn', pos: 'n' },
	{ tag: 'rotate counterclockwise', id: 'rot-ccw', meaning: 'Counterclockwise rotation', pos: 'ne' },
	{ tag: 'turn around', id: 'rot-180', meaning: 'Subject faces the opposite way', pos: 'w' },
	{ tag: 'spin', id: 'rot-spin', meaning: 'Rapid rotational movement', pos: 'e' },
	{ tag: '360 degree rotation', id: 'rot-360', meaning: 'Complete rotation', pos: 'sw' },
	{ tag: 'three-quarter turn', id: 'rot-270', meaning: 'Approximately 270° turn', pos: 's' },
];

const TRANSITION_ICONS: AtlasIcon[] = [
	{ tag: 'cut', id: 'trans-cut', meaning: 'Immediate change', pos: 'nw' },
	{ tag: 'fade', id: 'trans-fade', meaning: 'Gradual fade', pos: 'n' },
	{ tag: 'cross dissolve', id: 'trans-dissolve', meaning: 'One shot dissolves into another', pos: 'ne' },
	{ tag: 'jump cut', id: 'trans-jump', meaning: 'Abrupt temporal / spatial cut', pos: 'w' },
	{ tag: 'match cut', id: 'trans-match', meaning: 'Cut on visual correspondence', pos: 'e' },
	{ tag: 'wipe', id: 'trans-wipe', meaning: 'Shot replaces across frame', pos: 'sw' },
	{ tag: 'dip to black', id: 'trans-dip-black', meaning: 'Transition through black', pos: 's' },
	{ tag: 'morph', id: 'trans-morph', meaning: 'State morphs into another', pos: 'se' },
];

const EFFECT_ICONS: AtlasIcon[] = [
	{ tag: 'slow motion', id: 'eff-slow', meaning: 'Slowed motion', pos: 'nw' },
	{ tag: 'time lapse', id: 'eff-timelapse', meaning: 'Long process compressed in time', pos: 'n' },
	{ tag: 'fast motion', id: 'eff-fast', meaning: 'Accelerated motion', pos: 'ne' },
	{ tag: 'freeze frame', id: 'eff-freeze', meaning: 'Motion freezes', pos: 'w' },
	{ tag: 'reverse motion', id: 'eff-reverse', meaning: 'Motion progresses backward', pos: 'e' },
	{ tag: 'motion blur', id: 'eff-motionblur', meaning: 'Motion-induced blur', pos: 'sw' },
	{ tag: 'glitch effect', id: 'eff-glitch', meaning: 'Digital glitch', pos: 's' },
	{ tag: 'vortex effect', id: 'eff-vortex', meaning: 'Vortex-like distortion', pos: 'se' },
];

const SCENE_ICONS: AtlasIcon[] = [
	{ tag: 'interior', id: 'scene-interior', meaning: 'Interior environment', pos: 'nw' },
	{ tag: 'exterior', id: 'scene-exterior', meaning: 'Exterior environment', pos: 'n' },
	{ tag: 'establishing shot', id: 'scene-establish', meaning: 'Establishes location and context', pos: 'ne' },
	{ tag: 'foreground reveal', id: 'scene-foreground', meaning: 'Foreground element reveals environment', pos: 'w' },
	{ tag: 'wide environmental view', id: 'scene-wide-env', meaning: 'Environment visually dominant', pos: 'e' },
	{ tag: 'overhead environment', id: 'scene-overhead', meaning: 'Environment presented from above', pos: 'sw' },
	{ tag: 'seamless environment', id: 'scene-seamless', meaning: 'Continuous, coherent environment', pos: 's' },
];

const LIGHTING_ICONS: AtlasIcon[] = [
	{ tag: 'lens flare', id: 'eff-lensflare', meaning: 'Optical flare', pos: 'nw' },
	{ tag: 'light streaks', id: 'eff-lightstreaks', meaning: 'Streaked light', pos: 'n' },
	{ tag: 'bokeh', id: 'eff-bokeh', meaning: 'Defocused highlights', pos: 'ne' },
	{ tag: 'shallow depth of field', id: 'eff-sdof', meaning: 'Strong focus separation', pos: 'w' },
	{ tag: 'rack focus', id: 'eff-rackfocus', meaning: 'Focus shifts between planes', pos: 'e' },
	{ tag: 'glowing particles', id: 'eff-glow', meaning: 'Glowing particles', pos: 'sw' },
	{ tag: 'shockwave effect', id: 'eff-shockwave', meaning: 'Expanding shockwave', pos: 's' },
];

export const ICONS_BY_TAG_TYPE: Record<TagType, AtlasIcon[]> = {
	camera: CAMERA_ICONS,
	zoom: ZOOM_ICONS,
	rotation: ROTATION_ICONS,
	transition: TRANSITION_ICONS,
	effect: EFFECT_ICONS,
	scene: SCENE_ICONS,
	lighting: LIGHTING_ICONS,
};

/** Viewport slot → CSS position class, for the 3x3 ring around the editor. */
export const SLOT_CLASS: Record<AtlasIcon['pos'], string> = {
	nw: 'slot-nw',
	n: 'slot-n',
	ne: 'slot-ne',
	w: 'slot-w',
	e: 'slot-e',
	sw: 'slot-sw',
	s: 'slot-s',
	se: 'slot-se',
};
