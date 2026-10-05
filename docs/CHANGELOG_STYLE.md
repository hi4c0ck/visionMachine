# Changelog style guide

How to write release entries in `release-notes.md` and GitHub release
notes. Follow this so every notice reads the same way.

## The rules

- **Plain, user-facing language.** Describe what the person using the app
  notices — not what changed in code. No commit subjects, no internal
  identifiers, no class/function names.
- **No infra noise.** Leave out dependency version numbers, plugin bumps,
  line-ending tooling, CI tweaks, and "under the hood" housekeeping. If
  something isn't visible in the app, it doesn't go in the changelog.
- **No tiny cosmetic notes.** Skip changes too small for a user to
  notice (a logo in a corner, a color tweak, etc.).
- **Few sections, short bullets.** Group into 1–3 short `###` themes.
  Keep each bullet to one line of everyday words. Prefer fewer, clearer
  bullets over a long, granular list.
- **No jargon.** "No longer blocks you", "fits your video properly",
  "edits stay where you put them" — that level of language.
- **Version heading** is `# VisionMachine vX.Y.Z` (matches the file).

## Voice examples (good)

- "Sessions, videos, and settings no longer misbehave when you switch
  between things."
- "Media changes no longer block you the way they used to."
- "Frame cards now fit their video properly, so mixed-size frames line
  up neatly."

## Voice examples (bad — do not write it this way)

- "Sync @tauri-apps plugin versions with bumped Rust crates"
- "AssertSqlSafe for audited dynamic SQL"
- "Enforce LF line endings via .gitattributes"

## Template

```markdown
# VisionMachine vX.Y.Z

### <short plain theme 1>
- one user-facing line
- one user-facing line

### <short plain theme 2>
- one user-facing line
```
