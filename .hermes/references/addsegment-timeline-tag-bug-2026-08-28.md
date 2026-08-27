# addSegment Timeline Tag Bug — 2026-08-28

## Symptom
User adds segment → backend saves → UI shows nothing. Keyframe added but [+] button still shows.

## Root Cause
`composerStore.ts:426` — when creating a new `TimelineElement` inside `addSegment()`, the struct
literal was missing `tag: 'timeline'`:

```typescript
// BROKEN:
if (!timeline) {
  timeline = { id: crypto.randomUUID(), segments: [] };
  // pipe.elements.map(e => e.tag === 'timeline' ? newTimeline : e)
  // NEVER matches because tag is missing → newTimeline never inserted
}
```

## Why It's Subtle
`pipe.elements.map()` only finds existing elements by `.tag`. A freshly-created `TimelineElement`
without `tag: 'timeline'` is an orphan — it never enters the `elements` array. The segment
data exists in memory during the action, but:
1. `persistToBackend()` saves it (because session is updated)
2. On reload, `convertBackendPipe()` can't reconstruct it (backend didn't have it either)
3. UI shows "Add First Segment" forever

## Fix Applied
```typescript
if (!timeline) {
  timeline = { id: crypto.randomUUID(), tag: 'timeline', segments: [] };
  // Add immediately to pipe elements
  const newPipe: PipeRow = { ...pipe, elements: [...pipe.elements, timeline] };
  const newPipes = session.pipes.map(p => p.id === pipeId ? newPipe : p);
  sessions.set(sessionId, { ...session, pipes: newPipes, updatedAt: Date.now() });
  await persistToBackend(sessionId);
  return { errors: [] };
}
```

## Lesson
**Every `TimelineElement` and `GlobalElement` MUST have `tag` set in its literal.** The `tag`
field is the discriminator for all `elements.find()` and `elements.map()` calls throughout
the store. Missing it causes silent data loss on save and empty UI on load.

## Related
- `frontend_conversion.rs` must also assign `tag: 'timeline'` when constructing TimelineElement
- `ensureTimelineElement()` helper correctly sets tag — but `addSegment()` was a standalone
  path that missed this
