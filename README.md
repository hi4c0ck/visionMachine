# VisionMachine

AI-powered video generation tool with professional composer interface.

## Features

- **5-Container Layout**: Frame preview, Projects sidebar, Profile panel, Composer canvas, Tools panel
- **Pipe-based Composer**: Create video timelines with multiple pipes
- **Keyframe Management**: Add up to 3 keyframes per pipe with URL/txt2img/img2img support
- **Segment Timeline**: Drag-and-drop segments with tag types (scene, camera, rotation, lighting, effect, zoom, transition)
- **Global Prompts**: Set overall style prompts per pipe
- **Quality/Creativity Controls**: Per-pipe Q/C sliders
- **Project/Session Management**: Hierarchical organization of projects and sessions
- **Data Persistence**: SQLite (Tauri backend, source of truth); localStorage only as browser/E2E fallback

## Tech Stack

- **Frontend**: Svelte 5, TypeScript, Vite
- **Backend**: Tauri 2, Rust, SQLite
- **Styling**: CSS custom properties (theming)

## Getting Started

Pick your path:

| Goal | Path |
| --- | --- |
| **Just use the app** | Download the latest prebuilt MSI from [Releases](../../releases). No compiler needed. |
| **Modify / recompile / contribute** | Build from source (below). |

> **Note on the MSI:** released builds are **unsigned** (no code-signing
> certificate is configured), so Windows SmartScreen will show an
> "unknown publisher" warning on first install. Click **More info →
> Run anyway**. This is expected until a signing certificate is added.

### Prerequisites (build from source)

- Node.js 18+ (CI uses Node 20)
- Rust stable toolchain with the **MSVC** target (Tauri links against MSVC on Windows)
- WebView2 (preinstalled on Windows 10/11)
- Tauri CLI (`npx tauri` works; or `npm i -g @tauri-apps/cli`)

### Build

```bash
# Install dependencies
npm install

# Run in development mode (desktop app)
npm run tauri dev

# Build a local release MSI (output: src-tauri/target/release/bundle/msi/)
npm run tauri build

# Frontend only, no Tauri (browser dev mode, localStorage persistence)
npm run dev
```

### Project Structure

```
src/
├── components/
│   ├── App.svelte          # Main app with welcome screen
│   ├── Workspace.svelte    # 5-container layout orchestrator
│   ├── Frame.svelte        # Top header with preview
│   ├── ProjectsPanel.svelte # Left sidebar - projects/sessions
│   ├── ProfilePanel.svelte  # Bottom-left user info
│   ├── ComposerPanel.svelte # Center - pipe timeline editor
│   └── ToolsPanel.svelte   # Right sidebar - settings/generate
├── types/
│   ├── app.ts              # Core data models
│   └── composer.ts         # Type re-exports
└── constants.ts            # App constants and presets
```

## Usage

### Creating Your First Project

1. Launch the application
2. Enter your name on the welcome screen
3. Click "Create Project" in the left sidebar
4. Enter project name and optionally specify path
5. Click the "+" button under your project to add a session
6. Select the session to open the composer

### Working in the Composer

- **Add Keyframes**: Click "+" in the keyframe row (max 3)
- **Set Global Prompt**: Click the global prompt bar
- **Add Segments**: Click "+ Add Segment" to add type-specific sliders
- **Adjust Settings**: Use the right panel for FPS, resolution, quality, creativity

### Data Storage

- Database (source of truth) at `%LOCALAPPDATA%\com.visionmachine.desktop\visionmachine.db`
- Projects/sessions also cached to `localStorage` in browser/E2E mode (no Tauri backend)
- Logs at `%LOCALAPPDATA%\com.visionmachine.desktop\logs\`

## Documentation

- [Composer timeline rules (SLA)](docs/composer-timeline-sla.md) — the 8-frame
  engine floor, the ≈1s zone guideline, and the tag composition model

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, the branch
model, and how to submit issues and pull requests.

- [Code of Conduct](CODE_OF_CONDUCT.md)
- Issue templates: [Bug report](.github/ISSUE_TEMPLATE/bug_report.md),
  [Feature request](.github/ISSUE_TEMPLATE/feature_request.md)
- [Pull request template](.github/PULL_REQUEST_TEMPLATE.md)

## Releases

Prebuilt Windows MSI installers are published to [GitHub
Releases](../../releases) from the `production` branch. A tagged
release (`vX.Y.Z` on `production`) triggers the build-on-tag workflow in
`.github/workflows/release.yml`.

To install a released build, download the latest `.msi` from the Releases
page and run it. No toolchain required.

## Branch Strategy

- `develop` - Active development branch
- `production` - Stable releases only
- Feature branches created from `develop`

## Troubleshooting

### White Screen Issue
Check browser console for errors. Common causes:
- Missing type exports
- Reactivity issues with $state/$derived
- Component prop mismatches

### Database Errors
- Ensure app data directory is writable
- Check logs at `%LOCALAPPDATA%\com.visionmachine.desktop\logs\`

### Build Failures
- Clear target directory: `Remove-Item src-tauri\target -Recurse -Force`
- Rebuild: `npm run tauri build -- --debug`

## License

GPL-3.0-or-later, with an attribution addendum. See [LICENSE](LICENSE)
and [NOTICE.md](NOTICE.md).

- Full license + addendum: [LICENSE](LICENSE)
- Copyright / quick guide: [NOTICE.md](NOTICE.md)
