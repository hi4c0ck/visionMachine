# Getting Started with VisionMachine

## Quick Start (5 Minutes)

### Prerequisites Check
Run this to verify your environment:
```powershell
cd D:\work\horizonsMachine\VisionMachine
npm run check  # Should show 0 errors
```

### First Run
```powershell
# Development mode with hot reload
npm run tauri:dev

# Or frontend only (browser)
npm run dev    # Open http://localhost:1420
```

### What You'll See
1. **Welcome Screen** - Enter your name, click "Get Started"
2. **Production Workspace** - 5-panel layout appears
3. **Try It Out:**
   - Click layout buttons (⬜⬛🖥) to switch modes
   - Select project from left panel
   - Add keyframes with "+ Keyframe" button
   - Change theme from dropdown

---

## Installation Options

### Option 1: Development (Source Code)
```powershell
git clone https://github.com/hi4c0ck/visionMachine.git
cd visionMachine
npm install
npm run tauri:dev
```

### Option 2: Download Release
Visit [Releases](https://github.com/hi4c0ck/visionMachine/releases):
- **MSI Installer** - Full installation
- **Portable EXE** - No installation needed

---

## Keyboard Shortcuts

| Shortcut | Action | Status |
|----------|--------|--------|
| `Enter` | Confirm login | ✅ Implemented |
| `Enter` | Select keyframe in list | ✅ Implemented |
| `Enter` | Select frame in ruler | ✅ Implemented |

**Note:** Tool hotkeys (V, B, E, T, S, C, G, ,) are displayed in the ToolsPanel as visual indicators but are not yet bound to keyboard events. Use mouse clicks to select tools.

---

## Layout Modes

### Landscape (Default)
```
┌─────────────────────────────────────────────────────┐
│ Frame (140px)                                       │
├──────────┬──────────────────────┬────────────────────┤
│ Projects │      Composer        │    Profile         │
│ Panel    │  • Canvas            │  • Avatar          │
│ • List   │  • FrameRuler        │  • Storage         │
│ • Create │  • MultiThumbSlider  │  • Sessions        │
├──────────┴──────────────────────┴────────────────────┤
│                    Tools Panel                        │
└──────────────────────────────────────────────────────┘
```

### Portrait
- Same panels as Landscape but arranged vertically

### Single
- Only Composer visible (fullscreen mode)

---

## Themes

| Theme | Background | Accent |
|-------|-----------|--------|
| JetBrains Dark | `#2B2B2B` | `#59B5FF` (blue) |
| Steel Machinery Dark | `#1A1A1D` | `#FF6B35` (orange) |
| Light | `#FAFAFA` | `#007ACC` (GitHub blue) |

Switch via dropdown in top bar.

---

## Common Tasks

### Creating a Project
1. Click "+ New" in Projects panel
2. Project appears in list
3. Click to select it
4. Composer shows canvas ready for editing

### Adding Keyframes
1. Select a project
2. Click "+ Keyframe" button
3. Keyframe appears on timeline
4. Select keyframe to edit range with sliders

### Creating Sessions
1. Select project in Composer
2. Click "🔗 Create Session" button
3. Session ID appears on project card
4. Session shown in Profile panel

---

## Troubleshooting

### App Won't Start
```powershell
# Clear cache and restart
Remove-Item -Recurse -Force .venv
npm install
npm run tauri:dev
```

### Blank Screen
1. Open DevTools (F12)
2. Check Console tab for errors
3. Common fix: Restart app, clear localStorage

### Build Errors
```powershell
# Check for Svelte 5 syntax errors
npm run build
```

---

## Need Help?

- 📚 Read [docs/ARCHITECTURE.md](./ARCHITECTURE.md)
- 🔧 See [docs/TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
- 💻 Check [docs/SVELTE5_GUIDE.md](./SVELTE5_GUIDE.md)
