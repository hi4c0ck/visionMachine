# VisionMachine - AI Video Generation Desktop App

[![Build Status](https://github.com/hi4c0ck/visionMachine/actions/workflows/build.yml/badge.svg)](https://github.com/hi4c0ck/visionMachine/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Svelte 5](https://img.shields.io/badge/Svelte-5-purple.svg)](https://svelte.dev)
[![Tauri 2](https://img.shields.io/badge/Tauri-2-blue.svg)](https://tauri.app)

A professional desktop video editing application with production screen layout, keyframe-based timeline editing, and session management.

**Version:** 0.1.0 | **Last Updated:** 2026-08-22

---

## ✨ Features

### Production Screen Layout
- **5-Panel Workspace**: Frame (top), Projects (left), Composer (center), Profile (right-bottom), Tools (far-right)
- **Layout Modes**: Landscape (default), Portrait, Single-panel fullscreen
- **Resizable Panels**: Adjustable widths for Projects and Tools panels
- **Theme Support**: JetBrains Dark, Steel Machinery Dark, Light mode

### Composer & Timeline
- **Keyframe System**: Add, select, and delete keyframes on timeline
- **Frame Ruler**: Visual frame navigation with markers every N frames
- **Multi-Thumb Slider**: Dual-thumb range selection for keyframe values
- **Session Management**: Create sessions linked to projects

### Project Management
- **Create/Delete Projects**: Full CRUD operations via Projects panel
- **Project Thumbnails**: Visual indicators with icon placeholders
- **Session Tracking**: Session IDs displayed on project cards

### User Interface
- **Welcome Screen**: Name entry with localStorage persistence
- **User Profile**: Avatar, storage usage bar, session list, quick actions
- **Tool Palette**: 8 tools with icons and keyboard shortcuts
- **Responsive Design**: Adapts to different window sizes

### Technical Foundation
- **Svelte 5 Runes**: `$state`, `$props`, `$derived`, `$effect`
- **TypeScript**: Full type safety across frontend and backend
- **Tauri 2**: Native performance with Rust backend
- **SQLite Ready**: Database migrations prepared for future use

---

## 📦 Installation

### Prerequisites

#### Windows
- [Node.js 20+](https://nodejs.org/)
- [Rust Toolchain](https://www.rust-lang.org/tools/install)
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/downloads/) (C++ desktop development)
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

Visit the [Releases](https://github.com/hi4c0ck/visionMachine/releases) page:
- **MSI Installer** (`VisionMachine_0.1.0_x64_en-US.msi`) - ~1.6 MB
- **Portable EXE** (`vision-machine.exe`) - No installation required

---

## 🚀 Quick Start

### First Launch
1. Run the application
2. Enter your name in the welcome screen
3. Click "Get Started" or press Enter
4. The production workspace appears with all panels

### Basic Workflow
1. **Create Project**: Click "+ New" in Projects panel
2. **Select Project**: Click any project in the list
3. **Add Keyframes**: Click "+ Keyframe" button or press `Ctrl+K`
4. **Edit Range**: Use MultiThumbSlider on selected keyframe
5. **Create Session**: Click "🔗 Create Session" in Composer toolbar
6. **Switch Layout**: Use buttons in top Frame (⬜⬛🖥)
7. **Change Theme**: Use dropdown in Frame header

### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Enter` | Confirm login / Submit form |
| `Ctrl+K` | Add keyframe |
| `V` | Select tool |
| `B` | Brush tool |
| `E` | Eraser tool |
| `T` | Text tool |
| `G` | Generate tool |
| `,` | Settings tool |

---

## 🏗️ Architecture

### Technology Stack
```
┌─────────────────────────────────────────────────────────┐
│  Frontend (Svelte 5 + TypeScript)                       │
│  • 8 components with $props() and callback events        │
│  • CSS custom properties for theming                     │
│  • FrameRuler + MultiThumbSlider for timeline            │
├─────────────────────────────────────────────────────────┤
│  Backend (Rust + Tauri 2)                               │
│  • AppState with Arc<Mutex<>> for thread safety         │
│  • 7 Tauri commands for IPC                             │
│  • Preflight checks for system validation               │
├─────────────────────────────────────────────────────────┤
│  Data Layer                                             │
│  • localStorage for user preferences                     │
│  • In-memory state for username and errors               │
│  • SQLite migrations ready for future use                │
└─────────────────────────────────────────────────────────┘
```

### Component Structure
```
Workspace.svelte (Orchestrator)
├── Frame.svelte              # Top header (140px)
├── ProjectsPanel.svelte      # Left panel (220-280px)
├── ComposerPanel.svelte      # Center canvas + timeline
│   ├── FrameRuler.svelte     # Timeline navigation
│   └── MultiThumbSlider.svelte # Range slider
├── ProfilePanel.svelte       # Right-bottom (220px)
└── ToolsPanel.svelte         # Far-right (180-200px)
```

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [GETTING_STARTED.md](./docs/GETTING_STARTED.md) | Quick start guide for new users |
| [ARCHITECTURE.md](./docs/ARCHITECTURE.md) | System design and component relationships |
| [COMPONENT_API.md](./docs/COMPONENT_API.md) | Complete Svelte 5 component API reference |
| [API_REFERENCE.md](./docs/API_REFERENCE.md) | Tauri command signatures and usage |
| [DESIGN_SYSTEM.md](./docs/DESIGN_SYSTEM.md) | Color palette, typography, and spacing |
| [SECURITY.md](./docs/SECURITY.md) | Threat model and security practices |
| [DEVELOPMENT_GUIDE.md](./docs/DEVELOPMENT_GUIDE.md) | Setup instructions and workflows |
| [SVELTE5_GUIDE.md](./docs/SVELTE5_GUIDE.md) | Svelte 5 patterns and best practices |
| [TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md) | Common issues and solutions |
| [CONTRIBUTING.md](./docs/CONTRIBUTING.md) | How to contribute to the project |

Full documentation index: [docs/README.md](./docs/README.md)

---

## 🔧 Development

### Available Scripts
```bash
npm run dev              # Vite dev server only
npm run tauri:dev        # Full Tauri app with hot reload
npm run build            # Frontend production build
npm run tauri:build      # Full production build (MSI + EXE)
npm run check            # TypeScript + Svelte validation
```

### Svelte 5 Patterns Used
All components follow these mandatory patterns:

```svelte
<script lang="ts">
  // ✅ Correct: Svelte 5 runes
  let count = $state(0);
  let { title, onclose } = $props<{...}>();
  let doubled = $derived(count * 2);
  
  $effect(() => {
    const id = setInterval(() => count++, 1000);
    return () => clearInterval(id); // Cleanup!
  });
</script>

<!-- ✅ Correct: Callback props -->
<button onclick={onclose}>Close</button>
```

```svelte
<!-- ❌ Wrong: Svelte 4 syntax -->
<script>
  export let title;
  let count = 0;
  const dispatch = createEventDispatcher();
</script>
```

---

## 📝 License

MIT License - see [LICENSE](LICENSE) for details.

---

## 🤝 Contributing

Contributions welcome! Please read [CONTRIBUTING.md](./docs/CONTRIBUTING.md) for guidelines.

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

---

## 🙏 Acknowledgments

- [Svelte](https://svelte.dev) - Reactive UI framework
- [Tauri](https://tauri.app) - Cross-platform desktop framework
- [Rust](https://rust-lang.org) - Systems programming language
- [Inter Font](https://rsms.me/inter/) - Typeface by rsms