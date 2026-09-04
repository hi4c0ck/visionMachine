# Composer Layout Simplification — 2026-09-01

## Context
User requested simplified pipe row layout: keyframe chips → FrameRuler → add-mode toggle → MultiThumbSlider tracks, vertically aligned with shared playhead.

## Changes Made

### 1. Keyframe Chips — Dynamic Rendering
**Before**: Fixed template with `[0, 1, 2]` slots, checking `pipe.keyframes[kfSlot]` conditionally
```svelte
{#each [0, 1, 2] as kfSlot}
  {#if pipe.keyframes[kfSlot]}
    <!-- render filled chip -->
  {:else}
    <!-- render empty "+" chip -->
  {/if}
{/each}
```

**After**: Direct iteration, only filled slots appear
```svelte
{#each pipe.keyframes as kf, kfIdx (kf.id)}
  <div class="kf-chip" onclick={() => openAddModal(pipeIdx, kf.slot_index)}>
    <span>k{kf.slot_index}</span>
  </div>
{/each}
```

### 2. Frame Ruler — Component Integration
**Before**: Inline custom ruler with manual marker rendering
**After**: `<FrameRuler>` component with shared state
```svelte
<FrameRuler
  {totalFrames}
  {timelineZoom}
  selectedFrame={selectedFrame}
  onframeSelect={handleTimelineFrameSelect}
/>
```

### 3. MultiThumbSlider — Prop Binding Syntax
**Critical**: Svelte 5 requires explicit prop syntax, not shorthand `{prop}` when value is an expression
```svelte
<!-- WRONG - causes build error -->
<MultiThumbSlider
  {values}={[tag.frameStart, tag.frameEnd]}
  :min={0}
/>

<!-- RIGHT -->
<MultiThumbSlider
  values={[tag.frameStart, tag.frameEnd]}
  min={0}
  max={pipe.lengthFrames - 1}
  step={8}
  color={tag.spec.color}
  onchange={(vals) => resizeTagElementAction(...)}
/>
```

### 4. Vertical Playhead Overlay
Added inside `.timeline-container` (must be `position: relative`):
```svelte
{#if selectedFrame !== null && selectedFrame >= 0}
  <div class="playhead" style="left: calc({selectedFrame} / {totalFrames} * 100%)"></div>
{/if}
```

CSS:
```css
.timeline-container {
    position: relative;
    margin-bottom: 12px;
}

.playhead {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: var(--accent);
    opacity: 0.6;
    pointer-events: none;
    z-index: 10;
    box-shadow: 0 0 4px var(--accent);
}
```

### 5. Add Mode Toggle
Conditional rendering based on element existence:
```svelte
<div class="add-mode-row">
  {#each [getGlobalElement(pipe)] as global}
    {#if global}
      <button class="add-mode-btn">Edit Global</button>
    {:else}
      <button class="add-mode-btn">+ Global</button>
    {/if}
  {/each}
  {#each [getTimelineElement(pipe)] as timeline}
    {#if !timeline}
      <button class="add-mode-btn" onclick={() => addTimelineElementAction(...)}>+ Timeline</button>
    {:else}
      <span class="add-mode-label">Timeline active</span>
    {/if}
  {/each}
</div>
```

## Build Verification
- `npm run build` ✓ passes
- `npm run test` ✓ 66/66 unit tests pass
- E2E tests fail due to missing Playwright browsers (pre-existing, unrelated)

## Standalone Demo Created
File: `composer-demo.html`
- Self-contained HTML with embedded CSS/JS
- Interactive ruler (clickable markers)
- Draggable sliders with snap-to-grid (8-frame steps)
- Keyboard navigation (arrow keys move playhead)
- File size: ~26KB

## Anti-patterns Avoided
- Using `{#let}` blocks (not supported in Svelte 5)
- Shorthand prop binding with expressions (use explicit `prop={expr}`)
- Inline keyframe array indexing without helper (use `kf.slot_index` from keyframe object)
