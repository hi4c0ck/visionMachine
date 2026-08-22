# VisionMachine - Tauri 2 + Svelte 5 Build Improvements

This document outlines the improvements made based on production research from developer blogs, GitHub issues, and community discussions.

## Changes Applied

### 1. Vite Configuration Fix (CRITICAL)
**File:** `vite.config.ts`
- Added `base: './'` - Required for production builds to use relative asset paths
- Added static asset copying plugin
- Disabled sourcemaps in production for smaller bundles

**Why this matters:** Without relative paths, Tauri's bundled webview cannot load assets correctly, causing white screen in production.

### 2. Tauri Configuration Update
**File:** `src-tauri/tauri.conf.json`
- Set `withGlobalTauri: false` (recommended for security)
- Added `csp` policy for proper content security
- Specified `beforeDevCommand` and `beforeBuildCommand`
- Configured multiple bundle targets (MSI, DMG, AppImage)

### 3. Capabilities Permission Fix
**File:** `src-tauri/capabilities/default.json`
- Fixed structure (using correct Tauri v2 schema)
- Added explicit permission scopes for filesystem operations
- Properly configured core and shell permissions

**Why this matters:** Tauri v2 uses capability-based security - permissions don't work without explicit allow paths.

### 4. Rust Backend Implementation
**File:** `src-tauri/src/lib.rs`
- Implemented four state management patterns:
  1. `tauri::State` for read-only config
  2. `Mutex<AppState>` for mutable shared state
  3. `tokio::sync::Mutex` for async-safe operations
  4. SQLite database integration
- Added essential commands:
  - `get_app_info` - Returns app metadata
  - `get_status` / `set_ready` - App lifecycle management
  - `init_database` - Database initialization with migrations
  - `save_setting` / `get_setting` - Persistent settings storage
  - `create_project` / `get_projects` - Project management
- Event emission for frontend updates (`db:init-complete`, `project:created`)
- Proper error handling with custom `AppError` type

**Key pattern:** Never hold `std::sync::Mutex` across `.await` - use `tokio::sync::Mutex` for async commands.

### 5. Svelte 5 Migration
**File:** `App.svelte`
- Migrated from Svelte 4 to Svelte 5 runes:
  - `let userName = $state(...)` instead of implicit reactivity
  - `let showWelcome = $state(...)` for reactive booleans
  - `let selectedTheme = $state(...)` for theme state
  - `let isLoading = $state(false)` for loading indicators
  - `let appInfo = $state<any>(null)` for async data
  - `let error = $state<string | null>(null)` for error handling
- Integrated Tauri invoke() for backend calls
- Added database test functionality
- Improved error handling and UI feedback

### 6. Development Scripts
**Created:** `scripts/sync-versions.js`
- Ensures version consistency across:
  - `package.json` (source of truth)
  - `src-tauri/Cargo.toml`
  - `src-tauri/tauri.conf.json`
- Should be run before builds and in CI/CD pipelines

## Files Created/Modified

| File | Action | Purpose |
|------|--------|---------|
| `vite.config.ts` | Modified | Fix asset paths, add plugins |
| `src-tauri/tauri.conf.json` | Modified | Proper CSP, commands, bundles |
| `src-tauri/capabilities/default.json` | Modified | Correct permission schema |
| `src-tauri/Cargo.toml` | Modified | Add sqlx, tokio, thiserror deps |
| `src-tauri/src/lib.rs` | Modified | Full Rust backend implementation |
| `App.svelte` | Modified | Migrate to Svelte 5 runes |
| `package.json` | Modified | Update dependencies |
| `scripts/sync-versions.js` | Created | Version synchronization |
| `.agnes/skills/tauri2-svelte5-dev.md` | Created | Development skill guide |

## Next Steps

1. **Install Dependencies:**
   ```bash
   npm install
   cd src-tauri && cargo update && cd ..
   ```

2. **Test Development Mode:**
   ```bash
   npm run tauri:dev
   ```

3. **Build for Production:**
   ```bash
   npm run sync:versions
   npm run tauri:build
   ```

4. **Create Skill (Optional):**
   The skill file is at `.agnes/skills/tauri2-svelte5-dev.md`. To make it available:
   ```bash
   # In AgnesCode, you can reference it or save it permanently
   ```

## Key Lessons Applied

From production experience (60+ failed CI runs, 7 shipped Mac apps):

1. **Asset paths are critical** - `base: './'` fixes most production build issues
2. **Capabilities require explicit allow** - Don't assume permissions work
3. **Use async-safe mutexes** - `tokio::sync::Mutex` prevents deadlocks
4. **Version synchronization matters** - Single source of truth prevents breakage
5. **Start simple, iterate** - Master basics before advanced patterns

## Resources

- Research Report: `.agnes/artifacts/research/20260821_3/wide_research/20260821-3-tauri-2-svelte-5-deep-research-production-ready-guide-from-devel.md`
- Skill Guide: `.agnes/skills/tauri2-svelte5-dev.md`
- Official Docs: https://v2.tauri.app/
- Svelte 5 Docs: https://svelte.dev/docs
