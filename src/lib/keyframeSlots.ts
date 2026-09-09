// Shared keyframe-slot display helpers.
// Keyframe slots are progressive: slot 1 is always visible, slot N is
// visible only if slot N-1 is configured (has a usable value). Both
// KeyframesRow (UI chips) and ComposerPanel (next-slot default when opening
// the keyframe modal) use these — keep the logic here, not duplicated.

import type { PipeRow, PipeKeyframe } from '$types';

export function isKeyframeConfigured(pipe: PipeRow, slotIndex: number): boolean {
	const kf = pipe.keyframes.find((k: PipeKeyframe) => k.slotIndex === slotIndex);
	if (!kf) return false;
	switch (kf.type) {
		case 'url': return !!(kf.imageSrc && kf.imageSrc.trim().length > 0);
		case 'txt2img': return !!(kf.prompt && kf.prompt.trim().length > 0);
		case 'img2img': return !!(kf.referenceUrl && kf.referenceUrl.trim().length > 0);
		default: return false;
	}
}

export function getVisibleKeyframeSlots(pipe: PipeRow, maxKeyframes: number): number[] {
	const visible: number[] = [];
	for (let i = 1; i <= maxKeyframes; i++) {
		if (i === 1) {
			visible.push(i);
		} else if (isKeyframeConfigured(pipe, i - 1)) {
			visible.push(i);
		} else {
			break;
		}
	}
	return visible;
}
