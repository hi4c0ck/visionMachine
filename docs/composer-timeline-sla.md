# Composer Timeline Rules (SLA)

Domain rules for the composer's zone (segment) and tag model. The hard
limits come from the generation engine; the soft ones are quality
guidelines the UI follows by default, but users may override.

## Hard engine floor

- **Minimum span: 8 frames.** Zones and tags snap to an 8-frame grid and
  can never be smaller than one grid cell. This is the only enforced
  floor (enforced in the store: `addSegment`, `resizeTagElement`,
  `placeTagInZone`, `evenSplitZone`).
- **No overlap.** Same-type tags in a zone never overlap. A new same-type
  tag takes the first free slot; when the zone is full it is resplit
  evenly across all tags of that type (silent warning, no error).
- **Containment.** Tags stay inside their parent zone.

## Soft quality rule: zones ≈ 1s

- A "complete" section (one morph) is 4–5 keyframe steps, which is ≈1s of
  footage at the session fps — ≈2s at 18 fps, ≈0.6s at 60 fps (the same
  ~36–40 frame constant).
- **Zone suggestions default to ≥1s** (snapped up to the 8-frame grid)
  when the free space allows it. This is a quality rule, not a validator:
  users may create sub-1s zones for micromanagement edge cases, at their
  own risk — the 8-frame floor is the only hard limit.
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
