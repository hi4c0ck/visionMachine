# Design System

## Color Palette

### JetBrains Dark Theme
```css
:root[data-theme="jetbrains-dark"] {
  --bg-primary: #2B2B2B;
  --bg-secondary: #3C3F46;
  --bg-tertiary: #4E525A;
  --bg-hover: #4E525A;
  
  --text-primary: #EEEEEE;
  --text-secondary: #BFBFBF;
  --text-muted: #808080;
  --text-inverse: #FFFFFF;
  
  --accent-primary: #59B5FF;
  --accent-primary-hover: #7EC8FF;
  --accent-secondary: #BB88EE;
  
  --border-color: #4E525A;
  --shadow-color: rgba(0, 0, 0, 0.3);
}
```

### Steel Machinery Dark Theme
```css
:root[data-theme="steel-dark"] {
  --bg-primary: #1A1D23;
  --bg-secondary: #2A2D35;
  --bg-tertiary: #3A3D45;
  --bg-hover: #3A3D45;
  
  --text-primary: #E8EAF0;
  --text-secondary: #B8BCC8;
  --text-muted: #787C88;
  --text-inverse: #FFFFFF;
  
  --accent-primary: #4A90E2;
  --accent-primary-hover: #5BA0F2;
  --accent-secondary: #9B59B6;
  
  --border-color: #3A3D45;
  --shadow-color: rgba(0, 0, 0, 0.4);
}
```

### Light Theme
```css
:root[data-theme="light"] {
  --bg-primary: #F6F8FA;
  --bg-secondary: #E8EAF0;
  --bg-tertiary: #D0D5DD;
  --bg-hover: #D0D5DD;
  
  --text-primary: #1F2328;
  --text-secondary: #444D56;
  --text-muted: #6E7781;
  --text-inverse: #FFFFFF;
  
  --accent-primary: #0969DA;
  --accent-primary-hover: #1C7FFF;
  --accent-secondary: #8250DF;
  
  --border-color: #D0D5DD;
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
| `--text-xs` | 0.625rem (10px) | Tiny labels |
| `--text-sm` | 0.75rem (12px) | Meta text, hotkeys |
| `--text-base` | 0.875rem (14px) | Body text, buttons |
| `--text-lg` | 1rem (16px) | Headings, important text |
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

## Spacing

### Scale
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

## Component Styles

### Frame (Header)
- Height: 140px
- Display: flex, column
- Background: `--bg-secondary`
- Border-bottom: 1px solid `--border-color`

### Panel (Sidebar)
- Width: 220-280px
- Background: `--bg-secondary`
- Border-right/left: 1px solid `--border-color`
- Padding: 16px

### Button Primary
```css
background: var(--accent-primary);
color: var(--text-inverse);
padding: 6px 12px;
border-radius: var(--radius-md);
border: none;
cursor: pointer;
transition: all 0.15s ease;
```

### Button Secondary
```css
background: var(--bg-tertiary);
color: var(--text-primary);
padding: 6px 12px;
border-radius: var(--radius-md);
border: 1px solid var(--border-color);
cursor: pointer;
transition: all 0.15s ease;
```

### Input
```css
background: var(--bg-primary);
color: var(--text-primary);
border: 1px solid var(--border-color);
border-radius: var(--radius-md);
padding: 8px 12px;
font-size: var(--text-base);
```

### Card
```css
background: var(--bg-secondary);
border: 1px solid var(--border-color);
border-radius: var(--radius-lg);
padding: 16px;
```

## Layout Guidelines

### Panel Widths
| Panel | Min Width | Max Width | Default |
|-------|-----------|-----------|---------|
| Projects | 200px | 320px | 240px |
| Profile | 200px | 280px | 240px |
| Tools | 160px | 280px | 200px |

### Canvas Aspect Ratio
- Default: 16:9
- Available: 16:9, 4:3, 1:1

### Timeline
- Height: 140px
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