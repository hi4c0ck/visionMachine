# VisionMachine Composer — Fixed

## Changes Made

### Root Causes Fixed

1. **Duplicate CSS blocks** - `ComposerPanel.svelte` had 2 identical `.frame-ruler`, `.timeline-container`, `.playhead` definitions (lines 1118-1181 and 1283-1346). Removed duplicate.

2. **Height mismatch** - `.frame-ruler` was 18px, design spec requires 24px. Fixed.

3. **Over-engineered template** - Old code had:
   - 15+ modal states
   - Complex nested loops with helper functions
   - Redundant event handlers
   - Conflicting tag rendering logic

### New Clean Implementation

**Structure matches design spec exactly:**
```
Pipe Row
├── .kf-row (3 keyframe chips)
├── .timeline-container
│   ├── FrameRuler (ONE per pipe, NOT per segment)
│   ├── .add-mode-row (+ Global, + Timeline)
│   ├── .track-row × N (per tag type with tags)
│   └── .add-segment-row (Add Segment button)
└── + Add Pipe button
```

**Keyframes:**
- 3 chips (k1, k2, k3) always visible
- Click to add keyframe → modal opens
- No junk initialization

**Tags:**
- Only shows tag types that have data
- Empty tracks show "+ TagName" button
- No orphaned tags on new pipes

**MultiThumbSlider:**
- Bounded by parent segment frame range
- Draggable thumbs work correctly
- One slider per tag instance

**Modals:**
- Keyframe modal (URL/prompt input)
- Global style modal (textarea)
- Segment modal (start/end frame inputs)

## Files Modified
- `src/components/ComposerPanel.svelte` - Complete rewrite (594 lines → clean)
- `src/components/FrameRuler.svelte` - Unchanged (already correct, 24px height)
- `src/components/MultiThumbSlider.svelte` - Unchanged (dragging works)

## Build Status
- TypeScript: Clean (only minor main.ts/vitest warnings)
- Dev server: Running on :1420
- Design fidelity: Matches composer-demo.html

## User Instructions
1. Open app at http://localhost:1420
2. Create project + session (or use existing)
3. Click "+ Add Pipe" to create pipe
4. Click "+ Timeline" to enable tag tracks
5. Add segment, then add tags to see sliders
6. Click keyframe chips to add keyframes
