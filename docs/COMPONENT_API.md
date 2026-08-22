# VisionMachine - Component API Reference

## Overview

This document provides detailed API reference for all Svelte 5 components in the VisionMachine application.

---

## App.svelte (Root Component)

### Props
None (root component)

### State
```typescript
let userName = $state('');
let showWelcome = $state(true);
let selectedTheme = $state('jetbrains-dark');
let layoutMode = $state('landscape');
let appInfo = $state(null);
let error = $state<string | null>(null);
```

### Events
| Event | Handler | Description |
|-------|---------|-------------|
| `onlogout` | `handleLogout()` | User clicked logout |
| `onthemeChange` | `handleThemeChange(theme)` | Theme changed |
| `onlayoutChange` | `handleLayoutChange(mode)` | Layout mode changed |

### Usage
```svelte
<script lang="ts">
  import App from './App.svelte';
  
  function handleLogout() { window.location.reload(); }
  function handleThemeChange(theme: string) { /* apply theme */ }
  function handleLayoutChange(mode: string) { /* save layout */ }
</script>

<App />
```

---

## Frame.svelte

Top header bar (140px height) with logo, layout controls, theme selector, and user info.

### Props
```typescript
let {
  userName,           // string - Current user name
  selectedTheme,      // string - Current theme ('jetbrains-dark' | 'steel-dark' | 'light')
  layoutMode,         // string - Current layout ('landscape' | 'portrait' | 'single')
  showWelcome,        // boolean - Show "New" badge on logo
  onlogout,           // (() => void)? - Logout callback
  onthemeChange,      // ((theme: string) => void)? - Theme change callback
  onlayoutChange      // ((mode: string) => void)? - Layout change callback
} = $props();
```

### Layout Options
```typescript
const layouts = [
  { id: 'landscape', label: 'Landscape', icon: '⬜' },
  { id: 'portrait', label: 'Portrait', icon: '⬛' },
  { id: 'single', label: 'Single', icon: '🖥' }
];
```

### Theme Options
```typescript
const themes = [
  { id: 'jetbrains-dark', name: 'JetBrains Dark' },
  { id: 'steel-dark', name: 'Steel Machinery Dark' },
  { id: 'light', name: 'Light' }
];
```

### Usage
```svelte
<Frame 
  userName={userName}
  selectedTheme={selectedTheme}
  layoutMode={layoutMode}
  showWelcome={showWelcome}
  onlogout={handleLogout}
  onthemeChange={handleThemeChange}
  onlayoutChange={handleLayoutChange}
/>
```

---

## ProjectsPanel.svelte

Left panel displaying project list with create/delete functionality.

### Props
```typescript
interface Project {
  id: string;
  name: string;
  thumbnail?: string;
  sessionId?: string;
}

let {
  projects,              // Project[] - List of projects
  selectedProjectId,     // string | null - Currently selected project
  onselect,              // ((id: string) => void)? - Project selection callback
  onnew,                 // (() => void)? - New project callback
  ondelete               // ((id: string) => void)? - Delete project callback
} = $props();
```

### Events
| Event | Callback | Parameters |
|-------|----------|------------|
| `onselect` | `handleProjectSelect(id)` | Project ID |
| `onnew` | `handleProjectNew()` | None |
| `ondelete` | `handleProjectDelete(id)` | Project ID |

### Usage
```svelte
<ProjectsPanel 
  {projects}
  {selectedProjectId}
  onselect={handleProjectSelect}
  onnew={handleProjectNew}
  ondelete={handleProjectDelete}
/>
```

---

## ComposerPanel.svelte

Center panel with canvas area, timeline, and keyframe management.

### Props
```typescript
interface Keyframe {
  id: string;
  frame: number;      // 0-1200
  label: string;
  valueStart: number;
  valueEnd: number;
}

let {
  projectId,              // string | null - Selected project ID
  projectName,            // string - Selected project name
  totalFrames,            // number - Total frames (default: 1200)
  onselectKeyframe,       // ((id: string) => void)? - Keyframe select callback
  onnewKeyframe,          // ((keyframe: Keyframe) => void)? - New keyframe callback
  ondeleteKeyframe,       // ((id: string) => void)? - Delete keyframe callback
  oncreateSession         // (() => void)? - Create session callback
} = $props();
```

### Methods
| Method | Description |
|--------|-------------|
| `play()` | Start playback |
| `pause()` | Pause playback |
| `stop()` | Stop and reset to frame 0 |
| `addKeyframe()` | Add new keyframe at current frame |
| `selectKeyframe(id)` | Select a keyframe |
| `deleteKeyframe(id)` | Delete a keyframe |
| `createSession()` | Create session for project |

### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Enter` | Select focused keyframe |

---

## ProfilePanel.svelte

Right-bottom panel with user info, storage usage, and session management.

### Props
```typescript
let {
  userName,            // string - User display name
  userEmail,           // string? - User email (optional)
  storageUsed,         // number - Storage used in GB
  oncreateSession      // (() => void)? - Create session callback
} = $props();
```

### State
```typescript
let sessions = $state<Array<{ id: string; name: string; status: string }>>([]);
let showCreateSession = $state(false);
```

### Usage
```svelte
<ProfilePanel 
  {userName}
  {storageUsed}
  oncreateSession={handleCreateSession}
/>
```

---

## ToolsPanel.svelte

Far-right collapsible tool palette.

### Props
```typescript
interface Tool {
  id: string;
  label: string;
  icon: string;
  hotkey?: string;
}

let {
  tools,            // Tool[] - Tool definitions
  activeTool,       // string | null - Currently active tool
  collapsed,        // boolean - Panel collapse state
  onselect          // ((id: string) => void)? - Tool select callback
} = $props();
```

### Default Tools
```typescript
const defaultTools = [
  { id: 'select', label: 'Select', icon: '🔍', hotkey: 'V' },
  { id: 'brush', label: 'Brush', icon: '🖌', hotkey: 'B' },
  { id: 'eraser', label: 'Eraser', icon: '🧹', hotkey: 'E' },
  { id: 'text', label: 'Text', icon: '📝', hotkey: 'T' },
  { id: 'shape', label: 'Shape', icon: '⬜', hotkey: 'S' },
  { id: 'camera', label: 'Camera', icon: '📷', hotkey: 'C' },
  { id: 'gen', label: 'Generate', icon: '✨', hotkey: 'G' },
  { id: 'settings', label: 'Settings', icon: '⚙️', hotkey: ',' }
];
```

### Usage
```svelte
<ToolsPanel 
  tools={defaultTools}
  {activeTool}
  {toolsCollapsed}
  onselect={handleToolSelect}
/>
```

---

## Workspace.svelte

Main orchestrator component managing all panels and state.

### Props
```typescript
let {
  userName,           // string
  selectedTheme,      // string
  layoutMode,         // string
  showWelcome,        // boolean
  onlogout,           // (() => void)?
  onthemeChange,      // ((theme: string) => void)?
  onlayoutChange      // ((mode: string) => void)?
} = $props();
```

### Internal State
```typescript
let projects = $state<Project[]>([]);
let selectedProjectId = $state<string | null>(null);
let activeTool = $state<string | null>(null);
let toolsCollapsed = $state(false);
let storageUsed = $state(0);
```

### Event Handlers
| Handler | Description |
|---------|-------------|
| `handleLogout()` | Log out current user |
| `handleThemeChange(theme)` | Apply new theme |
| `handleLayoutChange(mode)` | Switch layout mode |
| `handleProjectSelect(id)` | Select project |
| `handleProjectNew()` | Create new project |
| `handleProjectDelete(id)` | Delete project |
| `handleToolSelect(id)` | Select tool |
| `handleNewKeyframe(kf)` | Add keyframe |
| `handleDeleteKeyframe(id)` | Remove keyframe |
| `handleSelectKeyframe(id)` | Select keyframe |
| `handleCreateSession()` | Create session |

### Usage
```svelte
<Workspace
  {userName}
  {selectedTheme}
  {layoutMode}
  showWelcome={showWelcome}
  onlogout={handleLogout}
  onthemeChange={handleThemeChange}
  onlayoutChange={handleLayoutChange}
/>
```

---

## FrameRuler.svelte

Timeline ruler component for frame navigation.

### Props
```typescript
let {
  totalFrames,        // number - Total frames (default: 1200)
  markerInterval,     // number - Marker spacing (default: 8)
  zoomLevel,          // number - Zoom level (default: 1)
  selectedFrame,      // number - Current frame position
  onframeSelect       // ((frame: number) => void)? - Frame selection callback
} = $props();
```

### Usage
```svelte
<FrameRuler
  {totalFrames}
  {selectedFrame}
  onframeSelect={handleFrameSelect}
/>
```

---

## MultiThumbSlider.svelte

Dual-thumb range slider for keyframe value adjustment.

### Props
```typescript
let {
  values,             // [number, number] - [start, end] values
  min,                // number - Minimum value (default: 0)
  max,                // number - Maximum value (default: 100)
  step,               // number - Step size (default: 1)
  label,              // string - Slider label
  color,              // string - Accent color (default: '#a8b5d6')
  enablePins,         // boolean - Show pin markers (default: true)
  pinInterval,        // number - Pin spacing (default: 10)
  onchange            // ((values: [number, number]) => void)? - Value change callback
} = $props();
```

### Usage
```svelte
<MultiThumbSlider
  values={[keyframe.valueStart, keyframe.valueEnd]}
  label={`Keyframe: ${keyframe.label}`}
  onchange={(v) => updateKeyframe(keyframe.id, v)}
/>
```

---

## Accessibility Requirements

All interactive elements must include:
- `role="button"` for clickable divs
- `tabindex="0"` for keyboard focus
- `onkeydown` handler for Enter/Space
- `aria-pressed` for toggle states

```svelte
<div
  role="button"
  tabindex="0"
  aria-pressed={selectedProjectId === project.id}
  onclick={() => handleClick(project.id)}
  onkeydown={(e) => e.key === 'Enter' && handleClick(project.id)}
>
```

---

## Svelte 5 Patterns Used

### ✅ Correct Patterns
```svelte
<script lang="ts">
  // State
  let count = $state(0);
  
  // Props
  let { title, onclose } = $props<{...}>();
  
  // Derived
  let doubled = $derived(count * 2);
  
  // Effects with cleanup
  $effect(() => {
    const id = setInterval(() => count++, 1000);
    return () => clearInterval(id);
  });
  
  // Events
  function handleClick() {
    onclose?.();
  }
</script>
```

### ❌ Avoid These Patterns
```svelte
<!-- Wrong - Svelte 4 syntax -->
<script>
  export let title;
  let count = 0;
  const dispatch = createEventDispatcher();
  $: doubled = count * 2;
</script>
```
