# VisionMachine - AI Video Generation Desktop App

[![Build Status](https://github.com/hi4c0ck/visionMachine/actions/workflows/build.yml/badge.svg)](https://github.com/hi4c0ck/visionMachine/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Svelte 5](https://img.shields.io/badge/Svelte-5-purple.svg)](https://svelte.dev)
[![Tauri 2](https://img.shields.io/badge/Tauri-2-blue.svg)](https://tauri.app)

A professional desktop video editing application with AI-powered generation, keyframe-based timeline editing, and multi-project management.

## ✨ Features

### Production Screen Layout
- **5-Panel Workspace**: Frame (top), Projects (left), Composer (center), Profile (right-bottom), Tools (far-right)
- **Layout Modes**: Landscape, Portrait, Single-panel fullscreen
- **Theme Support**: JetBrains Dark, Steel Machinery Dark, Light mode
- **Resizable Panels**: Drag to adjust panel sizes

### Composer & Timeline
- **Keyframe System**: Add, edit, and delete keyframes on timeline
- **Frame Ruler**: Visual navigation with frame markers
- **Multi-Thumb Slider**: Dual-thumb range selection for keyframe values
- **Session Management**: Create sessions linked to projects

### Project Management
- **Create/Delete Projects**: Full CRUD operations
- **Project Thumbnails**: Visual previews for each project
- **Session Tracking**: View active sessions per project

### User Interface
- **Welcome Screen**: Name entry with localStorage persistence
- **User Profile**: Avatar, storage usage, session list
- **Tool Palette**: Select, Brush, Eraser, Text, Shape, Camera, Generate, Settings
- **Keyboard Shortcuts**: Hotkeys for all tools (Ctrl+K for keyframe)

### Technical Stack
- **Frontend**: Svelte 5 (runes mode), TypeScript, Vite
- **Backend**: Rust (Tauri 2), SQLite
- **Styling**: CSS custom properties for theming
- **Build**: Tauri CLI for MSI/EXE packaging

## 📦 Installation

### Prerequisites

#### Windows
- [Git](https://git-scm.com/download/win)
- [Node.js 20+](https://nodejs.org/)
- [Rust Toolchain](https://www.rust-lang.org/tools/install)
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/) (with C++ desktop development)
- [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) (usually pre-installed)

### Build from Source

```bash
# Clone repository
git clone https://github.com/hi4c0ck/visionMachine.git
cd visionMachine

# Install dependencies
npm install

# Development mode (with hot reload)
npm run tauri:dev

# Production build
npm run tauri:build
```

### Download Pre-built Release

Visit the [Releases](https://github.com/hi4c0ck/visionMachine/releases) page to download:
- **MSI Installer** (`VisionMachine_0.1.0_x64_en-US.msi`)
- **Portable EXE** (`vision-machine.exe`)

## 🚀 Usage

### First Launch
1. Run the application
2. Enter your name in the welcome screen
3. Click "Get Started" or press Enter
4. Explore the workspace layout

### Basic Workflow
1. **Create Project**: Click "+ New" in Projects panel
2. **Select Project**: Click project in list
3. **Add Keyframes**: Click "+ Keyframe" button or press Ctrl+K
4. **Edit Values**: Use MultiThumbSlider on selected keyframe
5. **Create Session**: Click "🔗 Create Session" in Composer toolbar
6. **Switch Layout**: Use buttons in top Frame (⬜⬛🖥)
7. **Change Theme**: Use dropdown in Frame header

### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Ctrl+K` | Add keyframe |
| `V` | Select tool |
| `B` | Brush tool |
| `E` | Eraser tool |
| `T` | Text tool |
| `G` | Generate tool |
| `,` | Settings tool |

## 🏗️ Architecture

```
VisionMachine/
├── src/                          # Frontend (Svelte 5)
│   ├── App.svelte               # Root component
│   ├── main.ts                  # Entry point
│   └── components/
│       ├── Frame.svelte         # Top header (140px)
│       ├── ProjectsPanel.svelte # Left panel
│       ├── ComposerPanel.svelte # Center canvas + timeline
│       ├── ProfilePanel.svelte  # Right bottom
│       ├── ToolsPanel.svelte    # Far right
│       ├── Workspace.svelte     # Main orchestrator
│       ├── FrameRuler.svelte    # Timeline ruler
│       └── MultiThumbSlider.svelte # Range slider
├── src-tauri/                   # Backend (Rust/Tauri)
│   ├── src/lib.rs               # Commands & state
│   └── tauri.conf.json          # App config
├── css/                         # Design system
├── docs/                        # Documentation
└── scripts/                     # Build scripts
```

## 🔧 Development

### Project Structure
```bash
# Frontend (Svelte 5)
src/components/*.svelte

# Backend (Rust)
src-tauri/src/lib.rs
```

### Available Scripts
```bash
# Development server
npm run dev              # Vite only
npm run tauri:dev        # Full Tauri app

# Building
npm run build            # Frontend only
npm run tauri:build      # Full production build

# Quality checks
npm run check            # TypeScript + Svelte check
```

### Svelte 5 Patterns Used
- `$state()` for reactive variables
- `$props()` for component props
- `$derived()` for computed values
- `$effect()` for side effects with cleanup
- Callback props (`onlogout`, `onthemechange`) instead of events

## 📝 License

MIT License - see [LICENSE](LICENSE) for details.

## 🤝 Contributing

Contributions welcome! Please read [CONTRIBUTING.md](docs/CONTRIBUTING.md) for guidelines.

### Reporting Issues
- Use GitHub Issues
- Include steps to reproduce
- Mention OS and app version

### Pull Requests
1. Fork the repository
2. Create feature branch (`git checkout -b feat/your-feature`)
3. Commit changes (`git commit -m 'feat: add feature'`)
4. Push to branch (`git push origin feat/your-feature`)
5. Open Pull Request

## 🙏 Acknowledgments

- [Svelte](https://svelte.dev) - Reactive UI framework
- [Tauri](https://tauri.app) - Cross-platform desktop framework
- [Rust](https://rust-lang.org) - Systems programming language