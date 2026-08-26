#!/usr/bin/env python3
"""Fix T4: Add missing segment body drag handlers to ComposerPanel.svelte"""

filepath = 'src/components/ComposerPanel.svelte'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Find "function movePipeUp" and insert T4 handlers before it
marker = "\n\tfunction movePipeUp(pipeIndex: number) {"
if marker not in content:
    print("ERROR: marker not found")
    exit(1)

t4_handlers = '''
	// Segment body drag state (T4)
	let dragSegmentPipeIndex = $state<number | null>(null);
	let dragSegmentId = $state<string | null>(null);
	let dragSegmentStartX = $state(0);
	let dragSegmentStartFrame = $state(0);

	function handleSegmentBodyDragStart(pipeIndex: number, segmentId: string, e: PointerEvent) {
		e.preventDefault();
		e.stopPropagation();
		const pipe = pipes[pipeIndex];
		if (!pipe) return;
		const segment = pipe.segments.find(s => s.id === segmentId);
		if (!segment) return;

		dragSegmentPipeIndex = pipeIndex;
		dragSegmentId = segmentId;
		dragSegmentStartX = e.clientX;
		dragSegmentStartFrame = segment.frameStart;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	function handleSegmentBodyDragMove(e: PointerEvent) {
		// Track movement for live preview
	}

	async function handleSegmentBodyDragEnd(e: PointerEvent) {
		if (dragSegmentPipeIndex === null || dragSegmentId === null) return;
		const pipe = pipes[dragSegmentPipeIndex];
		if (!pipe) return;

		const deltaPx = e.clientX - dragSegmentStartX;
		if (Math.abs(deltaPx) < 4) {
			// Treated as click, not drag
			dragSegmentPipeIndex = null;
			dragSegmentId = null;
			return;
		}

		const trackWidth = (e.currentTarget as HTMLElement)?.parentElement?.offsetWidth || 1;
		const deltaFrames = Math.round((deltaPx / trackWidth) * pipe.lengthFrames / 8) * 8;
		const newStart = snapTo8nPlus1(dragSegmentStartFrame + deltaFrames);
		const segment = pipe.segments.find(s => s.id === dragSegmentId);
		if (!segment) {
			dragSegmentPipeIndex = null;
			dragSegmentId = null;
			return;
		}
		const segLength = segment.frameEnd - segment.frameStart;
		const newEnd = newStart + segLength;

		if (newStart < 0 || newEnd > pipe.lengthFrames) {
			showToast('Segment position out of bounds', 'error');
			dragSegmentPipeIndex = null;
			dragSegmentId = null;
			return;
		}

		try {
			const result = await moveSegmentAction(session!.id, pipe.id, dragSegmentId, deltaFrames);
			if (result.errors.length > 0) {
				showToast(result.errors.join(', '), 'error');
			}
		} catch (err) {
			showToast(`Failed to move segment: ${String(err)}`, 'error');
		} finally {
			dragSegmentPipeIndex = null;
			dragSegmentId = null;
		}
	}

'''

content = content.replace(marker, t4_handlers + marker)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("OK Updated T4 handlers into ComposerPanel.svelte")
