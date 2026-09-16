# Composer Timeline Rules (SLA)

Domain rules for the composer's zone (segment) and tag model. The hard
limits come from the generation engine; the soft ones are quality
guidelines the UI follows by default, but users may override.

## Hard engine floor

- **Minimum span: 8 frames.** Zones and tags snap to an 8-frame grid and
  can never be smaller than one grid cell. Enforced on every drag-resize
  (`calculateElementDrag`, `resizeSegment`, `resizeTagElement`) and in
  `placeTagInZone` / `evenSplitZone`.
- **No overlap.** Same-type tags in a zone never overlap — on add (first
  free slot; a full zone resplits evenly, silent warning, no error) AND
  on drag: the live preview is constrained off the same-type siblings
  (`resolveTagDragConflict`) and the store backstop rejects a commit that
  somehow overlaps (`resizeTagElement`).
- **Containment.** Tags stay inside their parent zone.

## Zone creation floor: ≥1s (enforced)

- A "complete" section (one morph) is 4–5 keyframe steps, which is ≈1s of
  footage at the session fps — ≈2s at 18 fps, ≈0.6s at 60 fps (the same
  ~36–40 frame constant).
- **Creating a zone enforces ≥1s at the session fps** (`minZoneSpan(fps)`
  = fps snapped up to the 8-grid: 24→24, 18→24, 30→32, 60→64 frames):
  the add-zone modal disables Confirm below the floor, and `addSegment`
  extends sub-floor ranges up to it. The "+ Zone" gap picker only offers
  gaps that host the floor.
- A pipe too tight to host the floor still accepts the 8-frame engine
  floor (a deliberate "hack" path, not one-click creation).
- **Drag-resize keeps only the 8-frame floor**: a zone may be gripped
  below 1s, at the user's own risk — the 1s rule is a creation-time rule.
- **fps is flexible** (18/24/30/48/60): "1s" means `fps` frames. Anything
  expressed in seconds must be computed from the session's current fps.

## Tag composition

- Tags are not frame-fixed: their position and size are free within the
  parent zone (drag / resize on the 8-grid), so the generation engine can
  prompt over them ("camera moves start→middle, pans left at middle").
- Composing a 2s / 6-step zone with 6 tags is the intended pattern;
  multiple same-type tags per zone are allowed and share the zone evenly.
- **Tag pill minimum: 8 frames.** Sub-8-frame prompt precision
  (start/end sections inside a tag) is a future engine concern, not UI.

## "Zone too small" state

When a zone is full for a tag type and cannot be resplit for one more tag
(each part needs ≥8 frames), the add-tag menu disables that type with the
hint: *"Zone too small for another X tag — extend the zone first."*
