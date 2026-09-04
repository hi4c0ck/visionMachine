# Runtime .map() Error Pattern (Sep 2026)

## Symptom
```
Something went wrong
o(...).map is not a function
```

This appears in Tauri desktop apps when compiled/minified code tries to call `.map()` on null/undefined. The `o` is minified variable name for whatever was null.

## Root Cause
Array method called on value that's not an array — usually because:
- Store initialization returns `null` instead of `[]`
- Async data hasn't loaded yet, variable is still `null`
- Type cast loses runtime type information
- Conditional rendering passes undefined to helper

## Fix Pattern

### Before `.map()` call, always guard:
```typescript
// WRONG - crashes if data is null
data.map(item => ...)

// RIGHT - safe guard
(data || []).map(item => ...)

// RIGHT - more explicit
Array.isArray(data) ? data.map(item => ...) : []
```

### Svelte 5 runes get computed values
When using `$derived` or `$state`, the value might be undefined before async init:
```typescript
let pipes = $derived(session?.pipes ?? []);
let totalFrames = $derived(pipes.length > 0 ? (pipes[0]?.lengthFrames ?? 121) : 121);
// NOT: pipes[0]?.lengthFrames — pipes could be empty array, [0] is undefined
```

### Template iteration guards
```svelte
<!-- WRONG - crashes if items is null -->
{#each items as item}
  <div>{item}</div>
{/each}

<!-- RIGHT - safe fallback -->
{#each (items ?? []) as item}
  <div>{item}</div>
{/each}
```

## Systematic Search Pattern

When error persists after fixing known sites:
```bash
# Find ALL .map() calls in source
grep -rn "\.map(" src/ --include="*.svelte" --include="*.ts"

# Check for unguarded usage
grep -rn "\w\+\.map(" src/ --include="*.svelte" --include="*.ts" | grep -v "|| \[\]"
```

## Common Culprits in VisionMachine

| File | Line | Issue |
|------|------|-------|
| `Workspace.svelte` | ~160 | `parsed.map()` — localStorage parse returns null |
| `Workspace.svelte` | ~476 | `selectedProject?.sessions.map()` — selectedProject null |
| `ComposerPanel.svelte` | ~376 | `pipes.map()` — pipes derived from session |
| `FrameRuler.svelte` | ~28 | `segments.map()` — segments prop could be null |
| `composerStore.ts` | ~515 | `session.pipes.map()` — session could be null |

## Prevention Pattern

Always initialize stores with arrays, not null:
```typescript
let projects = $state<ProjectData[]>([]);  // GOOD
let projects = $state<ProjectData[] | null>(null);  // BAD — causes .map() errors
```

When loading from backend/localStorage:
```typescript
async function loadFromLocalStorage() {
    const raw = localStorage.getItem('visionmachine_projects');
    if (!raw) return;
    
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
        projects = parsed;  // SAFE
    }
}
```

## Verification

After applying fixes:
1. `npm run build` — should pass
2. `npm run tauri build` — should succeed  
3. Launch app — check no runtime error in console

If error persists, use browser devtools (F12) to see exact stack trace pointing to minified line.
