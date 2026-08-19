# VisionMachine - Agent Skills Usage Guide

## 🎯 How to Use Skills

Skills are reusable workflows I can execute automatically. Type the skill name prefixed with `$` to invoke it.

### Available Skills

| Skill | Command | Purpose |
|-------|---------|---------|
| **Build** | `$build-visionmachine` | Production build (MSI + portable) |
| **Dev Mode** | `$start-dev` | Development server with hot reload |
| **Merge** | `$merge-production` | Merge develop → production + tag |
| **Test** | `$test-all` | Run all tests with coverage |
| **Status** | `$check-status` | Project health check |

---

## 📋 Skill Descriptions

### `$build-visionmachine`
Builds production-ready installer packages.

**What it does:**
- Runs full test suite before build
- Compiles Rust backend (`cargo tauri build`)
- Generates:
  - MSI installer (`target/release/bundle/msi/`)
  - Portable ZIP (`target/release/bundle/windows-portable/`)
- Reports file paths and sizes

**When to use:**
- Before releasing a new version
- After completing a feature
- When you need distributable packages

---

### `$start-dev`
Launches development environment with auto-reload.

**What it does:**
- Starts Tauri dev server
- Enables hot module replacement (HMR)
- Shows compilation output
- Monitors for errors

**When to use:**
- During active development
- Testing UI changes
- Debugging issues

**Note:** Python backend runs in separate process. Edit `.svelte` files → see changes instantly.

---

### `$merge-production`
Safe merge workflow with versioning.

**What it does:**
- Fetches latest from remote
- Merges `develop` → `production` with `--no-ff`
- Creates annotated git tag
- Pushes to remote

**When to use:**
- Ready to deploy to staging
- Before creating a release
- When combining feature branches

**Safety:**
- Requires clean working directory
- Shows diff if conflicts exist
- Never force-p

push