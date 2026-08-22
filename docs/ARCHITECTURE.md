# Architecture

## System Overview

VisionMachine is a desktop video editing application built with:
- **Tauri 2** (Rust backend) for native window and system integration
- **Svelte 5** (TypeScript) for reactive UI with runes mode
- **SQLite** for local data persistence

The architecture follows a component-based approach with clear separation between UI, business logic, and data layers.

## Layer Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  PRESENTATION LAYER (Svelte 5)                              │
│  Frame, ProjectsPanel, ComposerPanel, ProfilePanel,         │
│  ToolsPanel, Workspace                                      │
│  FrameRuler, MultiThumbSlider                               │
├─────────────────────────────────────────────────────────────┤
│  STATE MANAGEMENT (Svelte Runes)                            │
│  $state, $derived, $effect, $props                          │
│  Callback event pattern (no createEventDispatcher)          │
├─────────────────────────────────────────────────────────────┤
│  IPC LAYER (Tauri Commands)                                 │
│  login_user, logout_user, get_app_info                      │
│  set_theme, report_error, get_errors                        │
├─────────────────────────────────────────────────────────────┤
│  DATA LAYER (Rust/Tauri)                                    │
│  AppState (username, preflight_report, error_log)           │
│  SQLite (planned for future)                                │
└─────────────────────────────────────────────────────────────┘
```

## Component Architecture

### Main Layout (Workspace.svelte)
```
Workspace
├── Frame (140px height)
│   ├── Logo + "New" badge
│   ├── Layout mode switcher (Landscape/Portrait/Single)
│   ├── Theme selector dropdown
│   └── User badge + Logout button
├── ProjectsPanel (Left, 220-280px)
│   ├── Project list
│   ├── Create new project button
│   └── Delete project option
├── ComposerPanel (Center, flexible)
│   ├── Toolbar (playback controls, zoom)
│   ├── Canvas area
│   ├── FrameRuler (timeline navigation)
│   ├── MultiThumbSlider (keyframe range)
│   └── Keyframe list panel
├── ProfilePanel (Right-bottom, 220px)
│   ├── User avatar + info
│   ├── Storage usage bar
│   ├── Session list
│   └── Quick action buttons
└── ToolsPanel (Far-right, 180-200px)
    ├── Collapsible tool palette
    ├── Tool icons with hotkeys
    └── Active state indicator
```

### State Flow
```
User Input (UI Events)
    ↓
Component Handler (e.g., handleLogout)
    ↓
Callback Prop (e.g., onlogout)
    ↓
Parent State Update (e.g., showWelcome = false)
    ↓
Reactive UI Update (Svelte 5 runes)
```

## Svelte 5 Patterns

### Props Pattern
All component communication uses callback props instead of events:

```svelte
<!-- Parent -->
<ChildComponent 
  userName={userName}
  onlogout={handleLogout}
  onthemechoice={handleThemeChange}
/>

<!-- Child -->
<script lang="ts">
  let {
    userName,
    onlogout,
    onthemechoice
  } = $props<{
    userName: string;
    onlogout?: () => void;
    onthemechoice?: (theme: string) => void;
  }>();
</script>
```

### State Pattern
```typescript
// Reactive state
let userName = $state('');
let isLoading = $state(false);
let projects = $state<Project[]>([]);

// Derived state
let filteredProjects = $derived(
  projects.filter(p => p.name.includes(searchTerm))
);

// Effects with cleanup
$effect(() => {
  const id = setInterval(() => { count++; }, 1000);
  return () => clearInterval(id);
});
```

## Tauri Backend

### AppState
```rust
#[derive(Clone)]
pub struct AppState {
    pub username: Arc<Mutex<Option<String>>>,
    pub preflight_report: Arc<Mutex<PreflightReport>>,
    pub error_log: Arc<Mutex<Vec<(String, String)>>>,
}
```

### Tauri Commands
| Command | Parameters | Returns | Description |
|---------|-----------|---------|-------------|
| `login_user` | `{ username: string }` | `Result<String, String>` | Authenticate user |
| `logout_user` | None | `Result<(), String>` | Logout current user |
| `get_app_info` | None | `serde_json::Value` | Get app metadata |
| `set_theme` | `{ theme: string }` | `Result<(), String>` | Change UI theme |
| `report_error` | `{ error: string, context: string }` | `Result<(), String>` | Log error |
| `get_errors` | `{ limit: u32 }` | `Result<Vec<(String, String)>, String>` | Get error log |

## Data Persistence

### localStorage (Client-side)
| Key | Type | Description |
|-----|------|-------------|
| `vm-username` | string | Current user name |
| `vm-theme` | string | Selected theme |
| `vm-layout` | string | Layout mode |

### Rust State (In-memory)
- `AppState.username`: Current logged-in user
- `AppState.error_log`: Last 100 errors
- `AppState.preflight_report`: System check results

## Build Configuration

### Vite (Frontend)
```typescript
export default defineConfig({
  plugins: [svelte()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false
  }
});
```

### Tauri (Desktop)
```json
{
  "productName": "VisionMachine",
  "version": "0.1.0",
  "identifier": "com.visionmachine.app",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420"
  },
  "app": {
    "windows": [
      {
        "label": "main",
        "title": "VisionMachine",
        "width": 1280,
        "height": 800,
        "resizable": true,
        "fullscreen": false
      }
    ]
  }
}
```

## File Structure
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
│       └── MultiThumbSlider.svelte # Dual-thumb slider
├── src-tauri/                   # Backend (Rust/Tauri)
│   ├── src/
│   │   ├── lib.rs               # Tauri commands & state
│   │   └── preflight.rs         # System checks
│   ├── tauri.conf.json          # App configuration
│   ├── capabilities/            # Permission definitions
│   └── icons/                   # App icons
├── css/
│   └── design-system.css        # CSS custom properties
├── docs/
│   ├── ARCHITECTURE.md          # This file
│   ├── API_REFERENCE.md         # Tauri commands
│   ├── COMPONENT_API.md         # Svelte components
│   ├── DESIGN_SYSTEM.md         # Colors & typography
│   └── SVELTE5_GUIDE.md         # Svelte 5 patterns
├── scripts/
│   ├── generate_github_token.py # GitHub App token generator
│   └── push-all.py              # Push automation
└── package.json                 # Dependencies
```

## Security Considerations

### Permissions
- Tauri capabilities are scoped to specific commands
- No filesystem access in production build
- WebView2 sandbox enabled

### Data Storage
- Sensitive data stored in Rust state (in-memory only)
- User preferences in localStorage (non-sensitive)
- Error logs limited to last 100 entries

### CSP Policy
Content Security Policy configured in tauri.conf.json:
```json
"csp": "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'"
```