# Svelte 5 Drag Pattern — Element Pointer Capture

**Date**: 2026-09-05  
**Context**: VisionMachine composer timeline interactions

## The Problem

The old pattern used document-level pointer listeners (`$effect` adding `pointermove`/`pointerup` to `document`). This conflicted with element-level pointer capture and caused:
- Missed drag starts when multiple listeners competed
- Unreliable behavior when pointer left the element
- Complex lifecycle management

## The Correct Pattern

Use `setPointerCapture()` on the **element itself** during `pointerdown`:

```typescript
onpointerdown={(e: PointerEvent) => {
  e.preventDefault();
  e.stopPropagation();
  
  const element = e.currentTarget as HTMLElement;
  const rect = rulerElement.getBoundingClientRect();
  const pointerStartFrame = clientXToFrame(e.clientX, rect, geometry);
  
  // Capture pointer to this element — all events route here
  element.setPointerCapture(e.pointerId);
  
  dragState = {
    type: 'segment',
    id: seg.id,
    handle: 'body',
    startFrame: seg.frameStart,
    endFrame: seg.frameEnd,
    pointerStartFrame,
    captureElement: element,
    pointerId: e.pointerId
  };
  
  previewDragState = { type: 'segment', id: seg.id, startFrame, endFrame };
}}
```

Move and up handlers attach to the SAME element:
```svelte
<div 
  onpointerdown={handleDown}
  onpointermove={handleMove}
  onpointerup={handleUp}>
```

Cleanup on pointerup:
```typescript
function handlePointerUp(e: PointerEvent) {
  if (!dragState || e.pointerId !== dragState.pointerId) return;
  
  // Release capture
  dragState.captureElement.releasePointerCapture(dragState.pointerId);
  
  // Commit to store
  await updateSegmentAction(...);
  
  dragState = null;
  previewDragState = null;
}
```

## Why This Works

1. **`setPointerCapture()`** tells the browser: "all pointer events for this pointerId belong to me"
2. Events continue routing to the capturing element even if cursor moves outside it
3. No need for document listeners — cleaner, no competition
4. `releasePointerCapture()` is optional but good practice for cleanup

## Drag State Shape

```typescript
type DragState = {
  type: 'segment' | 'tag';
  id: string;
  segmentId?: string;
  handle: 'left' | 'right' | 'body';
  startFrame: number;
  endFrame: number;
  pointerStartFrame: number;  // Snapped frame at drag start
  captureElement: HTMLElement;
  pointerId: number;
};
```

## Preview State

```typescript
let previewDragState = $state<{
  type: 'segment' | 'tag';
  id: string;
  segmentId?: string;
  startFrame: number;
  endFrame: number;
} | null>(null);
```

Update preview during drag, commit to store only on pointerup.

## Frame Geometry Integration

Always calculate frames from the same ruler element:
```typescript
const rect = rulerElement.getBoundingClientRect();
const pointerFrame = clientXToFrame(e.clientX, rect, geometry);
```

This ensures 1:1 alignment between:
- FrameRuler markers
- Segment boundaries  
- Tag boundaries
- Playhead position

See `src/lib/frameGeometry.ts` for conversion functions.
