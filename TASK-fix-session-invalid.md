# Task: Fix "session is invalid" errors in ComposerPanel

**Date:** 2026-08-26
**Severity:** High — blocks all composer pipe/segment/keyframe operations
**Files affected:** `src/lib/composerStore.ts`, `src/components/ComposerPanel.svelte`

---

## Root Cause

Three issues combine to cause silent failures when composer actions are invoked:

### Issue 1: Store actions lack input validation + error handling

`composerStore.ts` actions (addPipe, removePipe, addSegment, resizeSegment, etc.) check `if (!session) return` and **return undefined** — but ComposerPanel calls them without checking the return value or wrapping in try/catch with user feedback.

Example in ComposerPanel.svelte (line 107):
```ts
await addPipe(session.id);  // silent no-op if session not in store
closeAddPipeModal();         // closes modal anyway
showToast('Pipe added', 'success');  // shows success toast even on failure
```

Result: user clicks "Add Pipe", nothing happens, but toast says "success".

### Issue 2: Workspace never hydrates composerStore

`Workspace.svelte` loads projects/sessions into its own state (`projects`, `selectedProject`, `selectedSession`), but never calls `hydrateSessions()` to populate `composerStore.sessions`. The store's Map stays empty.

ComposerPanel imports `addPipeAction` and other functions from composerStore — but since the store has no sessions loaded, every action hits `if (!session) return undefined`.

### Issue 3: Wrong function signatures

`setGlobalPrompt` in composerStore.ts is called as:
```ts
setGlobalPrompt(session.id, pipe.id, globalPromptText)
```
But the function signature (line 409) is:
```ts
async function setGlobalPrompt(sessionId: string, pipeId: string, text: string)
```
This one actually works — but other calls may have mismatched arg counts.

---

## Fix: Update composerStore.ts action return types

All actions must return `{ errors: string[] }` or throw on invalid session.

### Change 1: Return type for addPipe

**File:** `src/lib/composerStore.ts` (~line 16-37)

**Before:**
```ts
export async function addPipe(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) return;  // silent failure
  ...
}
```

**After:**
```ts
export async function addPipe(sessionId: string): Promise<{ errors: string[] }> {
  const session = sessions.get(sessionId);
  if (!session) return { errors: ['Session not found'] };
  
  const maxFrames = getMaxFrames(session.resolution);
  const defaultPipe: PipeRow = {
    id: crypto.randomUUID(),
    lengthFrames: maxFrames,
    keyframes: [],
    qValue: 18,
    cValue: 7,
    segments: [],
  };
  
  sessions.set(sessionId, {
    ...session,
    pipes: [...session.pipes, defaultPipe],
    updatedAt: Date.now(),
  });
  
  await persistToBackend(sessionId);
  return { errors: [] };
}
```

### Change 2: Same pattern for ALL actions

Apply the same return type and guard to:
- `removePipe` (line 39)
- `movePipe` (line 52)
- `duplicatePipe` (line 75)
- `updateQ` (line 102)
- `updateC` (line 119)
- `setPipeLength` (line 135)
- `addSegment` (line 166)
- `moveSegment` (line 228)
- `resizeSegment` (line 269)
- `addKeyframe` (line 303)
- `removeKeyframe` (line 354)
- `moveKeyframe` (line 375)
- `setGlobalPrompt` (line 409)
- `updateFPS` (line 430)
- `updateResolution` (line 443)

Each becomes:
```ts
export async function actionName(...args): Promise<{ errors: string[] }> {
  const session = sessions.get(sessionId);
  if (!session) return { errors: ['Session not found'] };
  // ... rest unchanged
}
```

---

## Fix: Update ComposerPanel to handle action results

### Change 3: AddPipe confirmation handler (~line 104-112)

**Before:**
```ts
async function confirmAddPipe() {
  if (!session?.id) return;
  try {
    await addPipe(session.id);
    closeAddPipeModal();
    showToast('Pipe added', 'success');
  } catch (e) {
    console.error('[ComposerPanel] Failed to add pipe:', e);
  }
}
```

**After:**
```ts
async function confirmAddPipe() {
  if (!session?.id) {
    showToast('No active session', 'error');
    return;
  }
  try {
    const result = await addPipe(session.id);
    if (result.errors.length > 0) {
      showToast(result.errors[0], 'error');
      return;
    }
    closeAddPipeModal();
    showToast('Pipe added', 'success');
  } catch (e) {
    console.error('[ComposerPanel] Failed to add pipe:', e);
    showToast('Failed to add pipe', 'error');
  }
}
```

### Change 4: RemoveSegment handler (~line 468-475)

**Before:**
```ts
try {
  await removeSegment(session.id, pipe.id, segmentId);
} catch (e) {
  console.error('[ComposerPanel] Failed to remove param:', e);
}
```

**After:**
```ts
if (!session?.id || !pipe) return;
try {
  const result = await removeSegment(session.id, pipe.id, segmentId);
  if (result.errors.length > 0) {
    showToast(result.errors.join(', '), 'error');
  }
} catch (e) {
  console.error('[ComposerPanel] Failed to remove param:', e);
  showToast('Failed to remove segment', 'error');
}
```

### Change 5: ResizeSegment handler (~line 478-510)

Already validates UI-side, but needs to check result:
```ts
const result = await resizeSegmentAction(session.id, pipe.id, segId, newStart, newEnd);
if (result.errors.length > 0) {
  showToast(`Resize failed: ${result.errors.join(', ')}`, 'error');
  return;
}
```

### Change 6: All other action calls (addSegment, addKeyframe, removeKeyframe, moveKeyframe, setGlobalPrompt, etc.)

Apply the same pattern: check result.errors, show toast, don't close modals on error.

---

## Fix: Hydrate composerStore from Workspace data

### Change 7: Import hydrateSessions in Workspace.svelte

**File:** `src/components/Workspace.svelte`

**Add import near top:**
```ts
import { hydrateSessions } from '$lib/composerStore';
```

### Change 8: Call hydrateSessions after project load

**Find `loadProjects` function (~line 53-100)** and add at the end:
```ts
// Hydrate composer store with loaded sessions
const allSessions: SessionData[] = projects.flatMap(p => p.sessions);
hydrateSessions(allSessions);
```

Also in `handleCreateSession` (~line 255-300), after creating the session:
```ts
const newSession: SessionData = { ... };
sessions.push(newSession);
hydrateSessions([newSession]);  // add single new session to store
```

### Change 9: Handle session selection

In `handleSessionSelect` (~line 175-183), after selecting session:
```ts
selectedSessionId = sessionId;
localStorage.setItem(`vm-selected-session-${userName}`, selectedSessionId);
// Re-hydrate store with fresh project data
const allSessions = selectedProject.sessions;
hydrateSessions(allSessions);
```

---

## Verification

After applying all changes:

1. `npm run build` passes (no TS errors)
2. Open app, create project, create session
3. Click "Add Pipe" → modal closes, pipe appears, toast says "Pipe added"
4. Add segment → validates, persists
5. Resize segment with sliders → validates overlap
6. Toggle FPS/resolution → clamp lengths, update pipes
7. Reload page → data persists from localStorage/backend

---

## Files to modify

| File | Changes |
|------|---------|
| `src/lib/composerStore.ts` | Add return types + session guards to all 15 actions |
| `src/components/ComposerPanel.svelte` | Update all 12 action call sites to check results |
| `src/components/Workspace.svelte` | Import + call hydrateSessions |

**Total estimated time:** 45 minutes
**Risk:** Low — pure plumbing changes, no logic modifications
