# Design System

## Color Palette

### JetBrains Dark Theme (`data-theme="jetbrains-dark"`)
```css
:root[data-theme="jetbrains-dark"] {
  /* Background Colors */
  --bg-primary: #2B2B2B;
  --bg-secondary: #3C3F46;
  --bg-tertiary: #4E525A;
  --bg-hover: #4E525A;
  
  /* Text Colors */
  --text-primary: #EEEEEE;
  --text-secondary: #BFBFBF;
  --text-muted: #808080;
  --text-inverse: #FFFFFF;
  
  /* Accent Colors */
  --accent-primary: #59B5FF;
  --accent-primary-hover: #7EC8FF;
  --accent-secondary: #BB88EE;
  
  /* Border Colors */
  --border-color: #4E525A;
  
  /* Special */
  --shadow-color: rgba(0, 0, 0, 0.3);
}
```

### Steel Machinery Dark Theme (`data-theme="steel-dark"`)
```css
:root[data-theme="steel-dark"] {
  /* Background Colors */
  --bg-primary: #1A1A1D;
  --bg-secondary: #2A2A2E;
  --bg-tertiary: #3A3A3F;
  --bg-hover: #3A3A3F;
  
  /* Text Colors */
  --text-primary: #E8E8E8;
  --text-secondary: #A0A0A0;
  --text-muted: #606060;
  --text-inverse: #FFFFFF;
  
  /* Accent Colors */
  --accent-primary: #FF6B35;
  --accent-primary-hover: #FF8C61;
  --accent-secondary: #F7C948;
  
  /* Border Colors */
  --border-color: #3A3A3F;
  
  /* Special */
  --shadow-color: rgba(0, 0, 0, 0.5);
}
```

### Light Theme (`data-theme="light"`)
```css
:root[data-theme="light"] {
  /* Background Colors */
  --bg-primary: #FAFAFA;
  --bg-secondary: #FFFFFF;
  --bg-tertiary: #F0F0F0;
  --bg-hover: #E8E8E8;
  
  /* Text Colors */
  --text-primary: #1A1A1A;
  --text-secondary: #5A5A5A;
  --text-muted: #8A8A8A;
  --text-inverse: #FFFFFF;
  
  /* Accent Colors */
  --accent-primary: #007ACC;
  --accent-primary-hover: #005A9E;
  --accent-secondary: #8B5CF6;
  
  /* Border Colors */
  --border-color: #E0E0E0;
  
  /* Special */
  --shadow-color: rgba(0, 0, 0, 0.1);
}
```

## Typography

### Font Family
```css
--font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-family-mono: 'JetBrains Mono', 'Fira Code', monospace;
```

### Font Sizes
| Token | Size | Usage |
|-------|------|-------|
| `--text-xs` | 0.625rem (10px) | Tiny labels, hotkeys |
| `--text-sm` | 0.75rem (12px) | Meta text, buttons |
| `--text-base` | 0.875rem (14px) | Body text |
| `--text-lg` | 1rem (16px) | Headings |
| `--text-xl` | 1.25rem (20px) | Section titles |
| `--text-2xl` | 1.5rem (24px) | Page titles |
| `--text-3xl` | 2rem (32px) | Hero text |

### Font Weights
| Token | Weight | Usage |
|-------|--------|-------|
| `--font-normal` | 400 | Body text |
| `--font-medium` | 500 | Buttons, labels |
| `--font-semibold` | 600 | Headings |
| `--font-bold` | 700 | Important text |

## Spacing Scale

| Token | Size | Usage |
|-------|------|-------|
| `--space-xs` | 4px | Tight padding |
| `--space-sm` | 8px | Small gaps |
| `--space-md` | 16px | Standard spacing |
| `--space-lg` | 24px | Section margins |
| `--space-xl` | 32px | Large gaps |
| `--space-2xl` | 48px | Container padding |

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | 4px | Small elements |
| `--radius-md` | 6px | Buttons, inputs |
| `--radius-lg` | 8px | Cards, panels |
| `--radius-xl` | 12px | Modals |
| `--radius-full` | 9999px | Avatars, badges |

## Shadows

```css
--shadow-sm: 0 1px 2px var(--shadow-color);
--shadow-md: 0 4px 6px var(--shadow-color);
--shadow-lg: 0 10px 15px var(--shadow-color);
--shadow-xl: 0 20px 25px var(--shadow-color);
```

## Component Dimensions

### Frame (Header)
- Height: 140px
- Display: flex, column
- Background: `--bg-secondary`
- Border-bottom: 1px solid `--border-color`

### Panel Widths
| Panel | Min | Max | Default |
|-------|-----|-----|---------|
| ProjectsPanel | 200px | 320px | 240px |
| ProfilePanel | 200px | 280px | 240px |
| ToolsPanel | 160px | 280px | 200px |

### Canvas Area
- Aspect ratio: 16:9 default
- Minimum height: 300px
- Grid pattern: 20px spacing

### Timeline
- Total height: 140px
- Ruler height: 24px
- Track area: 80px
- Keyframe panel: max 150px

## Animation Timing

| Duration | Token | Usage |
|----------|-------|-------|
| 100ms | `--transition-fast` | Hover effects |
| 150ms | `--transition-normal` | Standard transitions |
| 200ms | `--transition-slow` | Modal animations |
| 300ms | `--transition-slide` | Panel open/close |

## Icon Sizes

| Size | Dimension | Usage |
|------|-----------|-------|
| sm | 16px | Inline icons |
| md | 20px | Toolbar icons |
| lg | 24px | Panel headers |
| xl | 32px | Empty states |

## Accessibility Tokens

```css
--focus-outline: 2px solid var(--accent-primary);
--focus-offset: 2px;
--click-target-min: 44px; /* Minimum touch target */
```

## Usage Examples

### Setting Theme
```typescript
document.documentElement.setAttribute('data-theme', 'jetbrains-dark');
localStorage.setItem('vm-theme', 'jetbrains-dark');
```

### Using CSS Variables
```css
.button {
  background: var(--accent-primary);
  color: var(--text-inverse);
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
}
```

### Layout
```css
.workspace {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.workspace-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}
```