# VisionMachine - UI Components Reference

## 🎨 Component Library Recommendations

For a video generation tool with custom sliders, overlays, and real-time previews, we need robust UI components.

---

## Option 1: Shadcn/UI (Recommended)

**Why**: Modern, accessible, Tailwind-based, excellent for data-heavy apps

### Installation
```powershell
# In src/frontend directory
npx shadcn-ui@latest init
npx shadcn-ui@latest add button slider input textarea select badge progress toast
```

### Key Components for VisionMachine
| Component | Use Case | Dependency |
|-----------|----------|------------|
| `Slider` | Duration, shot count, brightness | Built-in |
| `Dialog` | Settings, confirmations | Part of shadcn |
| `Tooltip` | Help text on hover | Part of shadcn |
| `Progress` | Generation progress bar | Built-in |
| `Toast` | Success/error notifications | Built-in |
| `Tabs` | Video/Image/Settings panels | Built-in |
| `Card` | Video history items | Built-in |

### Integration Example
```jsx
import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function GenerationPanel() {
  const [duration, setDuration] = useState(30)
  
  return (
    <div className="space-y-4">
      <Slider
        value={[duration]}
        onValueChange={([v]) => setDuration(v)}
        min={3}
        max={60}
        step={1}
      />
      <Input
        type="text"
        placeholder="Enter prompt..."
        className="min-h-[100px]"
      />
      <Button onClick={generate}>Generate Video</Button>
    </div>
  )
}
```

---

## Option 2: Radix UI + Custom Styling

**Why**: Unstyled primitives, maximum flexibility for custom designs

### Installation
```powershell
npm install @radix-ui/react-slider @radix-ui/react-dialog @radix-ui/react-tooltip
npm install -D tailwindcss postcss autoprefixer
```

### Core Components
- `@radix-ui/react-slider` - Range controls
- `@radix-ui/react-dialog` - Modals and settings
- `@radix-ui/react-toggle-group` - Style selection
- `@radix-ui/react-scroll-area` - History scrolling

---

## Option 3: PrimeVue (If Using Vue)

**Why**: Comprehensive component library, excellent documentation

### Installation
```powershell
npm install primevue @primeuix/themes
```

### Available Components
| Component | Feature |
|-----------|---------|
| `Slider` | Dual handles, ranges |
| `VideoPlayer` | Native video controls |
| `DataTable` | History grid view |
| `Timeline` | Shot sequence visualization |
| `Rating` | Quality feedback |
| `Skeleton` | Loading states |

---

## Option 4: Material UI (MUI)

**Why**: Mature, well-tested, extensive theming

### Installation
```powershell
npm install @mui/material @emotion/react @emotion/styled
```

### Key Components
- `Slider` - Material Design compliant
- `Video` - HTML5 video wrapper
- `LinearProgress` - Progress bars
- `Snackbar` - Notifications
- `DialogTitle` - Modal headers

---

## 🎯 Recommendation: Shadcn/UI

**Best fit for VisionMachine because:**

1. **Zero runtime dependencies** - Just Tailwind classes
2. **Fully customizable** - Matches our dark theme perfectly
3. **Accessible** - WCAG 2.1 AA compliant
4. **Copy-paste editable** - No black box abstractions
5. **Modern stack** - Works with React/Vanilla JS

### Proposed Component Set

```
src/frontend/components/
├── ui/                    # Shadcn components
│   ├── button.tsx
│   ├── slider.tsx
│   ├── input.tsx
│   ├── dialog.tsx
│   ├── tooltip.tsx
│   └── toast.tsx
├── generation/            # App-specific
│   ├── PromptInput.jsx
│   ├── DurationSlider.jsx
│   ├── StyleSelector.jsx
│   └── GenerateButton.jsx
├── preview/               # Video display
│   ├── VideoPlayer.jsx
│   ├── Timeline.jsx
│   └── ShotThumbnail.jsx
└── layout/                # Structure
    ├── Sidebar.jsx
    ├── Header.jsx
    └── StatusBar.jsx
```

---

## 📦 Implementation Plan

### Phase 1: Setup (1 hour)
```powershell
cd src/frontend
npx shadcn-ui@latest init
# Choose: CSS variables, Tailwind, etc.
```

### Phase 2: Core Components (2 hours)
1. Create all base UI components
2. Build Generation panel
3. Implement Video player
4. Add Timeline component

### Phase 3: Polish (1 hour)
1. Add animations/transitions
2. Implement keyboard shortcuts
3. Add loading states
4. Responsive adjustments

---

## 🔧 Technical Considerations

### Bundle Size Impact
| Library | Bundle Size | Impact |
|---------|-------------|--------|
| Shadcn/UI | ~5KB (zero runtime) | ✅ Minimal |
| Radix UI | ~40KB | ⚠️ Moderate |
| PrimeVue | ~150KB | ❌ Heavy |
| MUI | ~200KB | ❌ Heavy |

### Performance Notes
- Shadcn uses CSS-in-JS via Tailwind → instant render
- No re-renders from library internals
- Direct DOM manipulation possible

### Accessibility
All recommended components include:
- ✅ Keyboard navigation
- ✅ Screen reader support
- ✅ Focus management
- ✅ ARIA attributes

---

*Component reference for VisionMachine desktop app*