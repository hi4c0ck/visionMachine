#!/usr/bin/env python3
"""Patch ComposerPanel.svelte to use previewDragState for drag preview."""

path = r'D:\work\horizonsMachine\VisionMachine\src\components\ComposerPanel.svelte'

with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add previewSeg constant and update segment rendering
old_segment_block = '''\t\t\t\t\t\t\t{#each tl.segments as seg (seg.id)}
\t\t\t\t\t\t\t\t<div class="segment-row">
\t\t\t\t\t\t\t\t\t<!-- Segment range bar -->
\t\t\t\t\t\t\t\t\t<div class="seg-bar">
\t\t\t\t\t\t\t\t\t\t<!-- Left thumb -->
\t\t\t\t\t\t\t\t\t\t<div 
\t\t\t\t\t\t\t\t\t\t\tclass="thumb left"
\t\t\t\t\t\t\t\t\t\t\tonpointerdown={(e) => handleSegmentPointerDown(e, seg, 'left')}
\t\t\t\t\t\t\t\t\t\t\tstyle={`left: ${frameToX(seg.frameStart)}%`}
\t\t\t\t\t\t\t\t\t\t\ttitle="Drag to resize start">
\t\t\t\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t\t\t\t\t<!-- Segment body -->
\t\t\t\t\t\t\t\t\t\t<div 
\t\t\t\t\t\t\t\t\t\t\tclass="seg-body"
\t\t\t\t\t\t\t\t\t\t\tonpointerdown={(e) => handleSegmentPointerDown(e, seg, 'body')}
\t\t\t\t\t\t\t\t\t\t\tstyle={`left: ${frameToX(seg.frameStart)}%; width: ${frameToX(seg.frameEnd) - frameToX(seg.frameStart)}%`}>
\t\t\t\t\t\t\t\t\t\t\t<span class="seg-label">{seg.frameStart}–{seg.frameEnd}</span>
\t\t\t\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t\t\t\t\t<!-- Right thumb -->
\t\t\t\t\t\t\t\t\t\t<div 
\t\t\t\t\t\t\t\t\t\t\tclass="thumb right"
\t\t\t\t\t\t\t\t\t\t\tonpointerdown={(e) => handleSegmentPointerDown(e, seg, 'right')}
\t\t\t\t\t\t\t\t\t\t\tstyle={`left: ${frameToX(seg.frameEnd)}%`}
\t\t\t\t\t\t\t\t\t\t\ttitle="Drag to resize end">
\t\t\t\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t\t\t\t</div>'''

new_segment_block = '''\t\t\t\t\t\t\t{#each tl.segments as seg (seg.id)}
\t\t\t\t\t\t\t\t{#const previewSeg = previewDragState && previewDragState.type === 'segment' && previewDragState.id === seg.id ? previewDragState : null}
\t\t\t\t\t\t\t\t<div class="segment-row">
\t\t\t\t\t\t\t\t\t<!-- Segment range bar -->
\t\t\t\t\t\t\t\t\t<div class="seg-bar">
\t\t\t\t\t\t\t\t\t\t<!-- Left thumb -->
\t\t\t\t\t\t\t\t\t\t<div 
\t\t\t\t\t\t\t\t\t\t\tclass="thumb left"
\t\t\t\t\t\t\t\t\t\t\tonpointerdown={(e) => handleSegmentPointerDown(e, seg, 'left')}
\t\t\t\t\t\t\t\t\t\t\tstyle={`left: ${frameToX(previewSeg ? previewSeg.startFrame : seg.frameStart)}%`}
\t\t\t\t\t\t\t\t\t\t\ttitle="Drag to resize start">
\t\t\t\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t\t\t\t\t<!-- Segment body -->
\t\t\t\t\t\t\t\t\t\t<div 
\t\t\t\t\t\t\t\t\t\t\tclass="seg-body"
\t\t\t\t\t\t\t\t\t\t\tonpointerdown={(e) => handleSegmentPointerDown(e, seg, 'body')}
\t\t\t\t\t\t\t\t\t\t\tstyle={`left: ${frameToX(previewSeg ? previewSeg.startFrame : seg.frameStart)}%; width: ${frameToX(previewSeg ? previewSeg.endFrame : seg.frameEnd) - frameToX(previewSeg ? previewSeg.startFrame : seg.frameStart)}%`}>
\t\t\t\t\t\t\t\t\t\t\t<span class="seg-label">{previewSeg ? `${previewSeg.startFrame}–${previewSeg.endFrame}` : `${seg.frameStart}–${seg.frameEnd}`}</span>
\t\t\t\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t\t\t\t\t<!-- Right thumb -->
\t\t\t\t\t\t\t\t\t\t<div 
\t\t\t\t\t\t\t\t\t\t\tclass="thumb right"
\t\t\t\t\t\t\t\t\t\t\tonpointerdown={(e) => handleSegmentPointerDown(e, seg, 'right')}
\t\t\t\t\t\t\t\t\t\t\tstyle={`left: ${frameToX(previewSeg ? previewSeg.endFrame : seg.frameEnd)}%`}
\t\t\t\t\t\t\t\t\t\t\ttitle="Drag to resize end">
\t\t\t\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t\t\t\t</div>'''

if old_segment_block in content:
    content = content.replace(old_segment_block, new_segment_block)
    print("✓ Patched segment rendering")
else:
    print("✗ Could not find segment block to patch")

# 2. Update tag pointerdown handlers to also set previewDragState
# Left thumb
old_tag_left = '''onpointerdown={(e) => {
\t\t\t\t\t\t\t\t\t\t\t\te.stopPropagation();
\t\t\t\t\t\t\t\t\t\t\t\tconst ruler = (e.currentTarget as HTMLElement).closest('.ruler-aligned') as HTMLElement;
\t\t\t\t\t\t\t\t\t\t\t\tif (ruler) {
\t\t\t\t\t\t\t\t\t\t\t\t\tconst rect = ruler.getBoundingClientRect();
\t\t\t\t\t\t\t\t\t\t\t\t\tdragState = {
\t\t\t\t\t\t\t\t\t\t\t\t\t\ttype: 'tag',
\t\t\t\t\t\t\t\t\t\t\t\t\t\tid: tag.id,
\t\t\t\t\t\t\t\t\t\t\t\t\t\tsegmentId: seg.id,
\t\t\t\t\t\t\t\t\t\t\t\t\t\thandle: 'left',
\t\t\t\t\t\t\t\t\t\t\t\t\t\tstartFrame: tag.frameStart,
\t\t\t\t\t\t\t\t\t\t\t\t\t\tendFrame: tag.frameEnd,
\t\t\t\t\t\t\t\t\t\t\t\t\t\tmouseStartX: e.clientX,
\t\t\t\t\t\t\t\t\t\t\t\t\t\trulerWidth: rect.width,
\t\t\t\t\t\t\t\t\t\t\t\t\t};
\t\t\t\t\t\t\t\t\t\t\t\t}
\t\t\t\t\t\t\t\t\t\t\t}}'''

new_tag_left = '''onpointerdown={(e) => {
\t\t\t\t\t\t\t\t\t\t\t\te.stopPropagation();
\t\t\t\t\t\t\t\t\t\t\t\tconst ruler = (e.currentTarget as HTMLElement).closest('.ruler-aligned') as HTMLElement;
\t\t\t\t\t\t\t\t\t\t\t\tif (ruler) {
\t\t\t\t\t\t\t\t\t\t\t\t\tconst rect = ruler.getBoundingClientRect();
\t\t\t\t\t\t\t\t\t\t\t\t\tdragState = {
\t\t\t\t\t\t\t\t\t\t\t\t\t\ttype: 'tag',
\t\t\t\t\t\t\t\t\t\t\t\t\t\tid: tag.id,
\t\t\t\t\t\t\t\t\t\t\t\t\t\tsegmentId: seg.id,
\t\t\t\t\t\t\t\t\t\t\t\t\t\thandle: 'left',
\t\t\t\t\t\t\t\t\t\t\t\t\t\tstartFrame: tag.frameStart,
\t\t\t\t\t\t\t\t\t\t\t\t\t\tendFrame: tag.frameEnd,
\t\t\t\t\t\t\t\t\t\t\t\t\t\tmouseStartX: e.clientX,
\t\t\t\t\t\t\t\t\t\t\t\t\t\trulerWidth: rect.width,
\t\t\t\t\t\t\t\t\t\t\t\t\t};
\t\t\t\t\t\t\t\t\t\t\t\t\tpreviewDragState = {
\t\t\t\t\t\t\t\t\t\t\t\t\t\ttype: 'tag',
\t\t\t\t\t\t\t\t\t\t\t\t\t\tid: tag.id,
\t\t\t\t\t\t\t\t\t\t\t\t\t\tsegmentId: seg.id,
\t\t\t\t\t\t\t\t\t\t\t\t\t\thandle: 'left',
\t\t\t\t\t\t\t\t\t\t\t\t\t\tstartFrame: tag.frameStart,
\t\t\t\t\t\t\t\t\t\t\t\t\t\tendFrame: tag.frameEnd,
\t\t\t\t\t\t\t\t\t\t\t\t\t};
\t\t\t\t\t\t\t\t\t\t\t\t}
\t\t\t\t\t\t\t\t\t\t\t}}'''

if old_tag_left in content:
    content = content.replace(old_tag_left, new_tag_left)
    print("✓ Patched tag left thumb")
else:
    print("✗ Could not find tag left thumb block")

# Body thumb
old_tag_body = '''onpointerdown={(e) => {
\t\t\t\t\t\t\t\t\t\t\t\te.stopPropagation();
\t\t\t\t\t\t\t\t\t\t\t\tconst ruler = (e.currentTarget as HTMLElement).closest('.ruler-aligned') as HTMLElement;
\t\t\t\t\t\t\t\t\t\t\t\tif (ruler) {
\t\t\t\t\t\t\t\t\t\t\t\t\tconst rect = ruler.getBoundingClientRect();
\t\t\t\t\t\t\t\t\t\t\t\t\tdragState = {
\t\t\t\t\t\t\t\t\t\t\t\t\t\ttype: 'tag',
\t\t\t\t\t\t\t\t\t\t\t\t\t\tid: tag.id,
\t\t\t\t\t\t\t\t\t\t\t\t\t\tsegmentId: seg.id,
\t\t\t\t\t\t\t\t\t\t\t\t\t\thandle: 'body',
\t\t\t\t\t\t\t\t\t\t\t\t\t\tstartFrame: tag.frameStart,
\t\t\t\t\t\t\t\t\t\t\t\t\t\tendFrame: tag.frameEnd,
\t\t\t\t\t\t\t\t\t\t\t\t\t\tmouseStartX: e.clientX,
\t\t\t\t\t\t\t\t\t\t\t\t\t\trulerWidth: rect.width,
\t\t\t\t\t\t\t\t\t\t\t\t\t};
\t\t\t\t\t\t\t\t\t\t\t\t}
\t\t\t\t\t\t\t\t\t\t\t}}'''

new_tag_body = '''onpointerdown={(e) => {
\t\t\t\t\t\t\t\t\t\t\t\te.stopPropagation();
\t\t\t\t\t\t\t\t\t\t\t\tconst ruler = (e.currentTarget as HTMLElement).closest('.ruler-aligned') as HTMLElement;
\t\t\t\t\t\t\t\t\t\t\t\tif (ruler) {
\t\t\t\t\t\t\t\t\t\t\t\t\tconst rect = ruler.getBoundingClientRect();
\t\t\t\t\t\t\t\t\t\t\t\t\tdragState = {
\t\t\t\t\t\t\t\t\t\t\t\t\t\ttype: 'tag',
\t\t\t\t\t\t\t\t\t\t\t\t\t\tid: tag.id,
\t\t\t\t\t\t\t\t\t\t\t\t\t\tsegmentId: seg.id,
\t\t\t\t\t\t\t\t\t\t\t\t\t\thandle: 'body',
\t\t\t\t\t\t\t\t\t\t\t\t\t\tstartFrame: tag.frameStart,
\t\t\t\t\t\t\t\t\t\t\t\t\t\tendFrame: tag.frameEnd,
\t\t\t\t\t\t\t\t\t\t\t\t\t\tmouseStartX: e.clientX,
\t\t\t\t\t\t\t\t\t\t\t\t\t\trulerWidth: rect.width,
\t\t\t\t\t\t\t\t\t\t\t\t\t};
\t\t\t\t\t\t\t\t\t\t\t\t\tpreviewDragState = {
\t\t\t\t\t\t\t\t\t\t\t\t\t\ttype: 'tag',
\t\t\t\t\t\t\t\t\t\t\t\t\t\tid: tag.id,
\t\t\t\t\t\t\t\t\t\t\t\t\t\tsegmentId: seg.id,
\t\t\t\t\t\t\t\t\t\t\t\t\t\thandle: 'body',
\t\t\t\t\t\t\t\t\t\t\t\t\t\tstartFrame: tag.frameStart,
\t\t\t\t\t\t\t\t\t\t\t\t\t\tendFrame: tag.frameEnd,
\t\t\t\t\t\t\t\t\t\t\t\t\t};
\t\t\t\t\t\t\t\t\t\t\t\t}
\t\t\t\t\t\t\t\t\t\t\t}}'''

if old_tag_body in content:
    content = content.replace(old_tag_body, new_tag_body)
    print("✓ Patched tag body thumb")
else:
    print("✗ Could not find tag body thumb block")

# Right thumb
old_tag_right = '''onpointerdown={(e) => {
\t\t\t\t\t\t\t\t\t\t\t\te.stopPropagation();
\t\t\t\t\t\t\t\t\t\t\t\tconst ruler = (e.currentTarget as HTMLElement).closest('.ruler-aligned') as HTMLElement;
\t\t\t\t\t\t\t\t\t\t\t\tif (ruler) {
\t\t\t\t\t\t\t\t\t\t\t\t\tconst rect = ruler.getBoundingClientRect();
\t\t\t\t\t\t\t\t\t\t\t\t\tdragState = {
\t\t\t\t\t\t\t\t\t\t\t\t\t\ttype: 'tag',
\t\t\t\t\t\t\t\t\t\t\t\t\t\tid: tag.id,
\t\t\t\t\t\t\t\t\t\t\t\t\t\tsegmentId: seg.id,
\t\t\t\t\t\t\t\t\t\t\t\t\t\thandle: 'right',
\t\t\t\t\t\t\t\t\t\t\t\t\t\tstartFrame: tag.frameStart,
\t\t\t\t\t\t\t\t\t\t\t\t\t\tendFrame: tag.frameEnd,
\t\t\t\t\t\t\t\t\t\t\t\t\t\tmouseStartX: e.clientX,
\t\t\t\t\t\t\t\t\t\t\t\t\t\trulerWidth: rect.width,
\t\t\t\t\t\t\t\t\t\t\t\t\t};
\t\t\t\t\t\t\t\t\t\t\t\t}
\t\t\t\t\t\t\t\t\t\t\t}}'''

new_tag_right = '''onpointerdown={(e) => {
\t\t\t\t\t\t\t\t\t\t\t\te.stopPropagation();
\t\t\t\t\t\t\t\t\t\t\t\tconst ruler = (e.currentTarget as HTMLElement).closest('.ruler-aligned') as HTMLElement;
\t\t\t\t\t\t\t\t\t\t\t\tif (ruler) {
\t\t\t\t\t\t\t\t\t\t\t\t\tconst rect = ruler.getBoundingClientRect();
\t\t\t\t\t\t\t\t\t\t\t\t\tdragState = {
\t\t\t\t\t\t\t\t\t\t\t\t\t\ttype: 'tag',
\t\t\t\t\t\t\t\t\t\t\t\t\t\tid: tag.id,
\t\t\t\t\t\t\t\t\t\t\t\t\t\tsegmentId: seg.id,
\t\t\t\t\t\t\t\t\t\t\t\t\t\thandle: 'right',
\t\t\t\t\t\t\t\t\t\t\t\t\t\tstartFrame: tag.frameStart,
\t\t\t\t\t\t\t\t\t\t\t\t\t\tendFrame: tag.frameEnd,
\t\t\t\t\t\t\t\t\t\t\t\t\t\tmouseStartX: e.clientX,
\t\t\t\t\t\t\t\t\t\t\t\t\t\trulerWidth: rect.width,
\t\t\t\t\t\t\t\t\t\t\t\t\t};
\t\t\t\t\t\t\t\t\t\t\t\t\tpreviewDragState = {
\t\t\t\t\t\t\t\t\t\t\t\t\t\ttype: 'tag',
\t\t\t\t\t\t\t\t\t\t\t\t\t\tid: tag.id,
\t\t\t\t\t\t\t\t\t\t\t\t\t\tsegmentId: seg.id,
\t\t\t\t\t\t\t\t\t\t\t\t\t\thandle: 'right',
\t\t\t\t\t\t\t\t\t\t\t\t\t\tstartFrame: tag.frameStart,
\t\t\t\t\t\t\t\t\t\t\t\t\t\tendFrame: tag.frameEnd,
\t\t\t\t\t\t\t\t\t\t\t\t\t};
\t\t\t\t\t\t\t\t\t\t\t\t}
\t\t\t\t\t\t\t\t\t\t\t}}'''

if old_tag_right in content:
    content = content.replace(old_tag_right, new_tag_right)
    print("✓ Patched tag right thumb")
else:
    print("✗ Could not find tag right thumb block")

# 3. Update tag rendering to use preview state
old_tag_bar = '''style={`left: ${frameToX(tag.frameStart)}%`}>'''
new_tag_bar = '''style={`left: ${frameToX(previewDragState?.type === 'tag' && previewDragState?.id === tag.id ? previewDragState.startFrame : tag.frameStart)}%`}>'''

if old_tag_bar in content:
    content = content.replace(old_tag_bar, new_tag_bar)
    print("✓ Patched tag bar start position")
else:
    print("✗ Could not find tag bar start position")

old_tag_body_style = '''style={`left: ${frameToX(tag.frameStart)}%; width: ${frameToX(tag.frameEnd) - frameToX(tag.frameStart)}%`}>'''
new_tag_body_style = '''style={`left: ${frameToX(previewDragState?.type === 'tag' && previewDragState?.id === tag.id ? previewDragState.startFrame : tag.frameStart)}%; width: ${frameToX(previewDragState?.type === 'tag' && previewDragState?.id === tag.id ? previewDragState.endFrame : tag.frameEnd) - frameToX(previewDragState?.type === 'tag' && previewDragState?.id === tag.id ? previewDragState.startFrame : tag.frameStart)}%`}>'''

if old_tag_body_style in content:
    content = content.replace(old_tag_body_style, new_tag_body_style)
    print("✓ Patched tag body width")
else:
    print("✗ Could not find tag body width")

old_tag_right_style = '''style={`left: ${frameToX(tag.frameEnd)}%`}>'''
new_tag_right_style = '''style={`left: ${frameToX(previewDragState?.type === 'tag' && previewDragState?.id === tag.id ? previewDragState.endFrame : tag.frameEnd)}%`}>'''

if old_tag_right_style in content:
    content = content.replace(old_tag_right_style, new_tag_right_style)
    print("✓ Patched tag right thumb position")
else:
    print("✗ Could not find tag right thumb position")

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("\nDone patching ComposerPanel.svelte")
