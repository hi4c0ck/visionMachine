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
- **Data Persistence**: Auto-save to localStorage, restore on restart

## Tech Stack

- **Frontend**: Svelte 5, TypeScript, Vite
- **Backend**: Tauri 2, Rust, SQLite
- **Styling**: CSS custom properties (theming)

## Getting Started

### Prerequisites

- Node.js 18+
- Rust toolchain
- Tauri CLI

### Installation

```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build
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

- Projects/sessions saved to `localStorage` (browser)
- Database at `%LOCALAPPDATA%\com.visionmachine.desktop\visionmachine.db`
- Logs at `%LOCALAPPDATA%\com.visionmachine.desktop\logs\`

## Branch Strategy

- `develop` - Active development branch
- `production` - Stable releases only
- Feature branches created from `develop`

## Building

### Debug Build
```bash
npm run tauri build -- --debug
```
Output: `src-tauri/target/debug/bundle/msi/VisionMachine_*.msi`

### Release Build
```bash
npm run tauri build
```

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

Private - VisionMachine proprietary software
