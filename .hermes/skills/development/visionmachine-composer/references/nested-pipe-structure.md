# Nested Pipe Structure — VisionMachine v0.3.0+

**Date:** 2026-08-26  
**Status:** Implemented  
**Commit:** `c1a9f43`

## Overview

The pipe structure was refactored from a flat model to a **nested hierarchy** that reflects
the actual domain model: a pipe has either a global style OR a timeline with segments,
where each segment contains multiple tags that apply simultaneously.

## Type Definitions

### PipeRow (root)
```typescript
interface PipeRow {
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
```

### PipeElement (union type)
```typescript
type PipeElement = GlobalElement | TimelineElement;
```

### GlobalElement (top tier)
```typescript
interface GlobalElement {
  id: string;
  tag: 'global_style';
  value: string;
  enabled: boolean;
}
```
- Only ONE global element allowed per pipe
- Applies to entire pipe duration
- Renders as a separate bar above timeline

### TimelineElement (mid tier)
```typescript
interface TimelineElement {
  id: string;
  segments: Segment[];
}
```
- Only ONE timeline element allowed per pipe
- Contains multiple non-overlapping segments

### Segment
```typescript
interface Segment {
  id: string;
  frameStart: number;
  frameEnd: number;
  tags: TagElement[];
}
```
- Time range within pipe (bounds checked against lengthFrames)
- Can contain MULTIPLE tags (scene + camera + lighting, etc.)
- Segments cannot overlap in time

### TagElement (leaf tier)
```typescript
interface TagElement {
  id: string;
  tag: TagType;  // 'scene' | 'camera' | 'rotation' | 'lighting' | 'effect' | 'zoom' | 'transition'
  frameStart: number;
  frameEnd: number;
  value: number;
  prompt?: string;
  spec: TagSpecification;
}
```
- Must stay within parent segment bounds
- Multiple tags of same type rejected if overlapping
- Frame positions are multiples of 8

## Migration Path

Old pipes with `segments: PromptSegment[]` and `globalNodes: GlobalNode[]` are migrated
automatically via `migratePipeToNested()` in `src/types/app.ts`:

1. Legacy globalPrompt/globalNodes → GlobalElement
2. Legacy segments grouped by frame range → TimelineElement with TagElements
3. Backward-compatible fields kept until full UI migration complete

## Validation Rules

### Frame Grid (CRITICAL)

```
Pipe length (totalFrames):    121 = 8×15 + 1  (8n+1 rule) ← ONLY for total
Segment boundaries:           0, 8, 16, 24... (multiples of 8)
Tag boundaries:               0, 8, 16, 24... (multiples of 8)
Keyframe positions:           0, 8, 16, 24... (multiples of 8)
```

**Common mistake:** Applying 8n+1 to segments/tags. This is WRONG — only pipe length uses 8n+1.

### Business Rules

1. **Global/Timeline mutual exclusion** — pipe has EITHER global OR timeline, not both
2. **Segment non-overlap** — segments cannot share frame ranges
3. **Tag bounds** — tag frameStart/End must be within parent segment
4. **Same-tag overlap** — within a segment, only one tag of each type per time range
5. **Min span** — all elements need ≥8 frames (one inference batch)

## UI Workflow

```
PIPE
├── [+] under Global → offers "Timeline" only
├── [+] under Timeline → offers "Segment" or "Global" if no global exists
│
└── SEGMENT [0, 40]
    ├── [+] → offers "Tag" only
    │
    ├── TAG [0, 40] scene: "rainy street"
    ├── TAG [0, 40] camera: "dolly zoom"
    └── TAG [0, 40] lighting: "neon noir"
    
└── SEGMENT [40, 80]
    └── ... (same pattern)
```

## Store Actions

All mutations go through composerStore.ts actions:

```typescript
// Global element CRUD
addGlobalElement(sessionId, pipeId, value)
updateGlobalElement(sessionId, pipeId, nodeId, value)
toggleGlobalElement(sessionId, pipeId, nodeId)
removeGlobalElement(sessionId, pipeId, nodeId)

// Timeline management
addTimelineElement(sessionId, pipeId)

// Segment CRUD
addSegment(sessionId, pipeId, frameStart, frameEnd)
removeSegment(sessionId, pipeId, segmentId)
resizeSegment(sessionId, pipeId, segmentId, frameStart, frameEnd)

// Tag CRUD
addTagElement(sessionId, pipeId, segmentId, tagType, frameStart, frameEnd)
removeTagElement(sessionId, pipeId, segmentId, tagId)
resizeTagElement(sessionId, pipeId, segmentId, tagId, frameStart, frameEnd)
updateTagValue(sessionId, pipeId, segmentId, tagId, value)
updateTagPrompt(sessionId, pipeId, segmentId, tagId, prompt)
```

## Files Changed

- `src/types/app.ts` — new types + migration helper
- `src/lib/composerStore.ts` — 13 new actions + legacy compatibility
- `src/components/ComposerPanel.svelte` — import updates (UI rendering pending)

## Backward Compatibility

Legacy fields (`segments`, `globalNodes`, `globalPrompt`) remain in PipeRow but are
marked @deprecated. Migration function converts them to new structure on load.
