#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Fix T7: Stable 7-track layout - always render rows"""

filepath = 'src/components/ComposerPanel.svelte'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Find the conditional track rendering pattern
old_pattern = """							{#each allTags as tagType}
								<div class="track-row">
									<span class="track-label" style="color: {TAG_SPECIFICATIONS[tagType].color}">
										{TAG_SPECIFICATIONS[tagType].name}
									</span>
									<div class="track-canvas">
										{#each pipe.segments.filter(s => s.tag === tagType) as segment (segment.id)}
											<MultiThumbSlider
												values={[segment.frameStart, segment.frameEnd]}
												min={0}
												max={pipe.lengthFrames}
												step={8}
												color={segment.spec.color}
												onchange={(vals) => resizeSegment(pipeIdx, segment.id, vals)}
												ondblclick={(e) => { e.stopPropagation(); openSegmentModal(pipeIdx, segment); }}
											/>
											<!-- Body drag overlay (T4) -->
											<div
												class="segment-body-drag"
												onpointerdown={(e) => handleSegmentBodyDragStart(pipeIdx, segment.id, e)}
												onpointermove={(e) => handleSegmentBodyDragMove(e)}
												onpointerup={(e) => handleSegmentBodyDragEnd(e)}
												style="left: calc({segment.frameStart / pipe.lengthFrames * 100}%); width: calc({(segment.frameEnd - segment.frameStart) / pipe.lengthFrames * 100}%);"
											></div>
										{/each}
									</div>
								</div>
							{/each}"""

new_pattern = """							{#each allTags as tagType}
								<div class="track-row {pipe.segments.filter(s => s.tag === tagType).length === 0 ? 'empty' : ''}">
									<span class="track-label" style="color: {TAG_SPECIFICATIONS[tagType].color}">
										{TAG_SPECIFICATIONS[tagType].name}
									</span>
									<div class="track-canvas">
										{#each pipe.segments.filter(s => s.tag === tagType) as segment (segment.id)}
											<MultiThumbSlider
												values={[segment.frameStart, segment.frameEnd]}
												min={0}
												max={pipe.lengthFrames}
												step={8}
												color={segment.spec.color}
												onchange={(vals) => resizeSegment(pipeIdx, segment.id, vals)}
												ondblclick={(e) => { e.stopPropagation(); openSegmentModal(pipeIdx, segment); }}
											/>
											<!-- Body drag overlay (T4) -->
											<div
												class="segment-body-drag"
												onpointerdown={(e) => handleSegmentBodyDragStart(pipeIdx, segment.id, e)}
												onpointermove={(e) => handleSegmentBodyDragMove(e)}
												onpointerup={(e) => handleSegmentBodyDragEnd(e)}
												style="left: calc({segment.frameStart / pipe.lengthFrames * 100}%); width: calc({(segment.frameEnd - segment.frameStart) / pipe.lengthFrames * 100}%);"
											></div>
										{/each}
									</div>
								</div>
							{/each}"""

if "{#each allTags as tagType}" in content and "pipe.segments.filter(s => s.tag === tagType)" in content:
    if "empty" not in content.split("{#each allTags")[1][:200]:
        content = content.replace(old_pattern, new_pattern)
        print("[OK] Fixed T7: Added empty class to track rows")
    else:
        print("[INFO] T7 fix already applied")
else:
    print("[WARN] Could not find pattern to replace")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("[DONE] ComposerPanel.svelte updated with T7 stable layout")
