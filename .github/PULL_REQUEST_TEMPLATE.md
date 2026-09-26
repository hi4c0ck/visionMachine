---
name: Pull request
about: Proposed changes to VisionMachine
---

## What changes and why

<!-- Describe the change in a few sentences. What does it do, and why?
Small, focused changes are accepted. Keep this PR to ONE logical change. -->

## Related issue

- `Closes #<issue>` / `Fixes #<issue>` (or "None")
- Note: **one issue / one change per PR.** If your work spans multiple
  issues, open multiple PRs instead.

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / cleanup
- [ ] Docs
- [ ] Data model / SQLite schema change
- [ ] Build / tooling / CI

## Breaking changes / migration

- [ ] No breaking changes
- [ ] **Breaking**: (describe what changes and how to migrate)

## Checklist

- [ ] I read [CONTRIBUTING.md](../../CONTRIBUTING.md)
- [ ] This PR is a **single focused change** (≤ 10 files / ≤ 400 lines). If it is larger, I have split it
- [ ] AI disclosure (see below) answered honestly
- [ ] Unit tests added/updated for the changed behavior (`npm run test`)
- [ ] `npm run check` (type-check) passes
- [ ] `npm run build` passes
- [ ] Rust changes: `cargo check --manifest-path src-tauri/Cargo.toml` passes
- [ ] Data model changes keep SQLite (source of truth) and localStorage fallback consistent
- [ ] Commit messages are conventional and focused
- [ ] I have not removed or altered the project's copyright / attribution notice (see NOTICE.md)

## AI assistance disclosure

- [ ] No AI assistance was used
- [ ] AI assistance **was** used. What I manually verified:

<!-- When AI assistance was used, briefly state which parts you reviewed
and tested yourself. Mass AI-generated changes without manual review are
not accepted. -->

## Screenshots / evidence

<!-- Optional: before/after for UI changes, test output for tricky cases. -->
