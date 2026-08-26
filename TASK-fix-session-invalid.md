# Task: Fix "session is invalid" silent failures in ComposerPanel

**Date:** 2026-08-26
**Status:** Ready for implementation
**Severity:** High — blocks pipe/segment/keyframe operations

---

## Root Cause

**Two bugs combine:**

1. **composerStore.ts** — 10 actions silently return `undefined` when session not found
2. **Workspace.svelte** — never calls `hydrateSessions()` to seed the store

Result: ComposerPanel calls `addPipe(session.id)` → session undefined in store → silent no-op → toast says "success" → nothing happens.

---

## Fix 1: Update composerStore.ts actions to return errors

### Actions needing fix (return `Promise<void>` with silent `return`):

| Line | Function | Current | Fix |
|------|----------|---------|-----|
| 16 | `addPipe` | `return;` | `return { errors: ['Session not found'] }` |
| 39 | `removePipe` | `return;` | `return { errors: ['Session not found'] }` |
| 52 | `movePipe` | `return;` | `return { errors: ['Session not found'] }` |
| 75 | `duplicatePipe` | `return;` | `return { errors: ['Session not found'] }` |
| 101 | `updateQ` | `return;` | `return { errors: ['Session not found'] }` |
| 118 | `updateC` | `return;` | `return { errors: ['Session not found'] }` |
| 207 | `removeSegment` | `return;` | `return { errors: ['Session not found'] }` |
| 358 | `removeKeyframe` | `return;` | `return { errors: ['Session not found'] }` |
| 413 | `setGlobalPrompt` | `return;` | `return { errors: ['Session not found'] }` |
| 433 | `updateFPS` | `return;` | `return { errors: ['Session not found'] }` |

### Pattern to apply to each:

**Before:**
```ts
export async function addPipe(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) return;
  ...
}
```

**After:**
```ts
export async function addPipe(sessionId: string): Promise<{ errors: string[] }> {
  const session = sessions.get(sessionId);
  if (!session) return { errors: ['Session not found'] };
  ...
}
```

**Note:** Change `Promise<void>` to `Promise<{ errors: string[] }>` in return type, and change `return;` to `return { errors: [...] }` at guard points.

---

## Fix 2: Update ComposerPanel to check results

### 2a. confirmAddPipe (~line 104-112)

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

### 2b. removeSegment handler (~line 468-475)

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
    showToast(result.errors[0], 'error');
  }
} catch (e) {
  console.error('[ComposerPanel] Failed to remove param:', e);
  showToast('Failed to remove segment', 'error');
}
```

### 2c. Other handlers to update (same pattern):

- `removePipe` (~line 439-445) — check result.errors
- `movePipeUp/Down` (~line 675+) — check result.errors
- `duplicatePipe` — check result.errors
- `setGlobalPrompt` (~line 171) — check result.errors
- `updateFPS` / `updateResolution` — check result.errors

Pattern: `const result = await action(...)` → `if (result.errors.length) { showToast; return; }`

---

## Fix 3: Hydrate store from Workspace

### 3a. Add import

**File:** `src/components/Workspace.svelte`, near top imports:

```ts
import { hydrateSessions } from '$lib/composerStore';
```

### 3b. Call after loadProjects

**Find:** `loadProjects()` function (~line 53-100), end of try block:

```ts
// After populating `projects` state, hydrate composer store
const allSessions: SessionData[] = projects.flatMap(p => p.sessions);
hydrateSessions(allSessions);
```

### 3c. Call after createSession

**Find:** `handleCreateSession()` (~line 255-300), after creating newSession:

```ts
const newSession: SessionData = { ... };
sessions.push(newSession);
hydrateSessions([newSession]);
```

### 3d. Call on session select

**Find:** `handleSessionSelect()` (~line 175-183), after setting selectedSessionId:

```ts
selectedSessionId = sessionId;
localStorage.setItem(`vm-selected-session-${userName}`, selectedSessionId);
hydrateSessions(selectedProject.sessions);
```

---

## Verification

1. `npm run build` passes
2. Launch app, create project + session
3. Click "Add Pipe" → modal closes, toast "Pipe added", pipe appears
4. Add segment → validates, persists
5. Resize segment → no overlap, snaps to 8-grid
6. Delete pipe → toast success
7. Reload page → data persists

---

## Files to modify

| File | Lines | Changes |
|------|-------|---------|
| `src/lib/composerStore.ts` | 16-433 | Return types + guards on 10 actions |
| `src/components/ComposerPanel.svelte` | 104-510 | Check results, show toasts |
| `src/components/Workspace.svelte` | 1-500 | Import + call hydrateSessions |

**Estimated time:** 30 minutes
**Risk:** Low — plumbing only
