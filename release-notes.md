# VisionMachine v0.4.0

## v0.5.0 (in development)
### Stability
- Fixed app-wide "Session not found" crash: composer store now self-heals
  missing sessions (register-on-mutate) instead of throwing; session-create
  fallback and backend-load fallback hydrate the store; composer viewport
  state (active pipe, playhead) resets on session switch
### Refactor
- ComposerPanel split into ComposerRows/*, ComposerMenus/*,
  ComposerModals/*, ComposerTimeline/TimelineSection (panel 1960 → ~590 lines)
- Drag math extracted to src/lib/dragMath (unit-tested, single-clamp body drag)
- Keyframe slot logic single-sourced in src/lib/keyframeSlots
- Removed dead MultiThumbSlider component
### Fixes
- Drag commits now target the section's own pipe (no active-pipe shortcut)
- Composer menus clamp/flip into the viewport; e2e coordinate-canvas suite
  gained a two-pipe drag regression test

## v0.4.0

## Composer Overhaul

### New Features
- **Subject References**: Add up to 5 visual reference images with optional frame ranges
- **MultiThumb Global Track**: static range bar in the timeline coordinate canvas (drag-resize not wired; store API reserved)
- **Timeline with Stacked Tags**: Unlimited segments and tags per segment
- **Transient Drag Preview**: Drag interactions now use preview state, commit on pointerup
- **Frame Geometry Engine**: Single canonical `frameToX()` system shared by UI, store, and Rust backend

### Fixes
- Unified SubjectReference contract across frontend/store/Rust layers
- Fixed drag mutation storm (async updates on every pointermove)
- Fixed +Tag button (missing stopPropagation)
- Fixed getNextAvailableRange not imported
- Removed hardcoded max 1 segment/tag limits
- Fixed GlobalElement mapping (value → frameStart/frameEnd)
- Pipe::new() now creates empty elements, not both Global and Timeline

### Build
- MSI Installer: VisionMachine_0.4.0_x64_en-US.msi (3.1 MB)
- Portable EXE: vision-machine.exe (4.7 MB)

### Repository
- Branch: develop
- Commits since v0.3.1-final: 94
- Tests: 100/100 passing
