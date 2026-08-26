# T1-T8 Implementation Status

## Summary
Working tree is clean (commit 450c4d3). Tasks T1-T5 partially implemented. T6-T8 not started.

---

## Task Status

### T1 — Commit Working Tree ✅ COMPLETE
- Commit `450c4d3` exists: "feat: composer timeline — slider tracks, globalNodes, composerStore, verified build chain"
- Tag `wip-v0.3.1-baseline` exists
- Working tree clean: `git status` shows nothing modified

---

### T2 — Legacy Session Migration on Load ⚠️ PARTIAL
**Files**: `src/lib/composerStore.ts`, `src/types/app.ts`

**Status**:
- `migratePipeToTwoLayer()` function exists in `app.ts` ✅
- Applied in `loadSession()` at line 560 in `composerStore.ts` ✅
- NOT applied in `Workspace.svelte` `loadFromLocalStorage()` ❌

**Bug Found**: In `migratePipeToTwoLayer()`:
```typescript
const newNode: GlobalNode = pipe.globalPrompt
  ? { id: crypto.randomUUID(), tag: 'global_style', value: pipe.globalPrompt.text, enabled: true }
  : null;  // BUG: null here causes type error
```

**Fix Required**:
1. Fix the null assignment bug in `migratePipeToTwoLayer()`
2. Call migration in `Workspace.svelte` `loadFromLocalStorage()` after parsing JSON

---

### T3 — Keyframe Drag Repositioning ⚠️ PARTIAL
**Files**: `src/components/ComposerPanel.svelte` (lines ~631-665)

**Implemented**:
- Pointer handlers: `onpointerdown`, `onpointermove`, `onpointerup` ✅
- `dragKeyframeStartX`, `dragKeyframeStartFrame` state ✅
- Click suppression with `<4px` threshold ✅
- Frame delta calculation ✅
- Bounds checking ✅
- Store `moveKeyframe` call ✅

**Issues**:
1. Uses `Math.round(delta / 8) * 8` instead of `snapTo8nPlus1()` ❌
2. Live preview offset not implemented (only cursor tracks)
3. Missing `cursor: grab/grabbing` styles for keyframe chip

**Fix Required**: Replace Math.round with snapTo8nPlus1, add proper CSS

---

### T4 — Segment Body Drag ⚠️ INCOMPLETE
**Files**: `src/components/ComposerPanel.svelte` (lines 888-890)

**Status**:
- Event bindings present but handler functions MISSING ❌
- Need: `handleSegmentBodyDragStart`, `handleSegmentBodyDragMove`, `handleSegmentBodyDragEnd`
- Store function `moveSegment()` already exists ✅
- Validation for same-tag overlap already in store ✅

**Fix Required**: Add the three missing handler functions with proper state management

---

### T5 — Modal Slot Allocation + Parity Fixes ⚠️ PARTIAL
**Files**: `src/components/ComposerPanel.svelte`

**Implemented**:
- First free slot computation: `[1,2,3].find(s => !usedSlots.includes(s))` ✅
- Try/catch/finally with `closeModal()` ✅
- `slot_index` stored on keyframe ✅

**Issue**: img2img validation requires BOTH `modalImg2Img` AND `modalPrompt`, but spec says only referenceUrl is required:
```typescript
// CURRENT (wrong):
(addMode === 'img2img' && (!modalImg2Img.trim() || !modalPrompt.trim()))

// SHOULD BE:
(addMode === 'img2img' && !modalImg2Img.trim())
```

Also missing: amber border warning on chip when img2img missing referenceUrl

**Fix Required**: Update disabled condition and add warning styling

---

### T6 — Compiler Panel in ToolsPanel ❌ NOT STARTED
**Files**: `src/components/ToolsPanel.svelte`, `src/lib/compiler.ts`

**Existing Code**:
- `compilePrompt(pipe)` function exists in `compiler.ts` ✅
- Not imported or used in ToolsPanel ❌

**Implementation Required**:
1. Import `compilePrompt` from `$lib/compiler`
2. Add `$derived` computed output based on selected pipe
3. Add collapsible `<details>` section under Q/C group
4. Add Copy button
5. Tooltips for disabled generate button

---

### T7 — Stable 7-Track Layout ⚠️ PARTIAL
**Files**: `src/components/ComposerPanel.svelte`

**Current**:
```svelte
{#each pipe.segments.filter(s => s.tag === tagType) as segment (segment.id)}
```
This conditionally renders tracks only if segments exist ❌

**Required**: Always render rows, add `.empty` class when no segments

**Fix Required**: Restructure track rendering to always show all 7 tag types

---

### T8 — Final Build + E2E + Close-out ❌ NOT STARTED
**Status**: Pending all above fixes

---

## Fix Priority Order

1. **T2** - Fix migration bug + apply in Workspace.svelte
2. **T3** - Fix snapTo8nPlus1 usage
3. **T4** - Add missing drag handlers
4. **T5** - Fix img2img validation
5. **T6** - Add compiler panel
6. **T7** - Fix stable layout
7. **T8** - Build + E2E
