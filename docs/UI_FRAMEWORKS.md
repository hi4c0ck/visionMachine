# UI Frameworks for VisionMachine (Tauri v2)

## Overview

Choosing the right UI framework is critical for VisionMachine's success. We need:
- Custom sliders and controls (many of them)
- Real-time video preview
- Dynamic features (instant playback)
- Simple migration path to web/mobile
- Lightweight footprint

---

## Recommended: React + Shadcn/UI

### Why This Stack?

| Factor | Rating | Notes |
|--------|--------|-------|
| **Sliders/Controls** | ⭐⭐⭐⭐⭐ | Perfect for our use case |
| **Video Preview** | ⭐⭐⭐⭐⭐ | Excellent ecosystem |
| **Migration Path** | ⭐⭐⭐⭐⭐ | React Native = easy mobile |
| **Bundle Size** | ⭐⭐⭐⭐ | ~50KB with Tree-shaking |
| **Learning Curve** | ⭐⭐⭐⭐ | Common patterns |
| **Community** | ⭐⭐⭐⭐⭐ | Massive support |

### Installation
```powershell
# Create React app with Vite (faster than CRA)
npm create vite@latest src/frontend -- --template react

# Install Shadcn/UI
cd src/frontend
npm install shadcn-ui
npx shadcn-ui@latest init

# Add components we need
npx shadcn-ui@latest add slider input textarea select badge progress toast tabs card
```

### Key Components for VisionMachine

| Component | Purpose | Example |
|-----------|---------|---------|
| `Slider` | Duration, shot count | `<Slider min={3} max={60} value={[30]} />` |
| `Dialog` | Settings modal | `<Dialog><DialogTrigger>Settings</DialogTrigger></Dialog>` |
| `Tooltip` | Help text | `<Tooltip>60s max duration</Tooltip>` |
| `Progress` | Generation status | `<Progress value={percent} />` |
| `Toast` | Notifications | `<Toast>Video generated!</Toast>` |
| `Tabs` | Panel switching | `<Tabs defaultValue="generate">` |
| `Card` | Video history | `<Card>{item.prompt}</Card>` |

### Code Example
```jsx
import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import { invoke } from "@tauri-apps/api/core"

function GenerationPanel() {
  const [duration, setDuration] = useState(30)
  
  const handleGenerate = async () => {
    const result = await invoke('generate_video', {
      prompt: "A beautiful sunset",
      duration: duration
    })
  }
  
  return (
    <div className="space-y-4">
      <Slider
        min={3}
        max={60}
        step={1}
        value={[duration]}
        onValueChange={([v]) => setDuration(v)}
      />
      <Button onClick={handleGenerate}>
        Generate Video
      </Button>
    </div>
  )
}
```

---

## Alternative: Vue 3 + PrimeVue

### Pros
- Great documentation
- Comprehensive component library
- Good TypeScript support

### Cons
- Migration to mobile requires Nuxt Native or separate codebase
- Larger bundle size

### Installation
```powershell
npm create vue@latest
npm install primevue @primeuix/themes
```

---

## Alternative: Svelte + SvelteKit

### Pros
- Smallest bundle size
- Great performance
- Simple syntax

### Cons
- Smaller ecosystem
- Less enterprise adoption

---

## Comparison Table

| Feature | React+Shadcn | Vue+PrimeVue | Svelte+SvelteKit |
|---------|-------------|--------------|------------------|
| Bundle Size | ~50KB | ~150KB | ~30KB |
| Learning Curve | Medium | Low | Low |
| Mobile Migration | ✅ Easy (React Native) | ⚠️ Harder | ⚠️ Harder |
| Component Quality | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| Community | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| Tauri Support | ✅ Official | ✅ Good | ✅ Good |

---

## My Recommendation

**Use React + Shadcn/UI** for VisionMachine because:

1. **Perfect fit**: Shadcn/UI has exactly the components we need (sliders, inputs, dialogs)
2. **Easy migration**: React Native for mobile, React for web
3. **Large ecosystem**: Thousands of packages, tutorials, and examples
4. **Well-maintained**: Active development, regular updates
5. **TypeScript-first**: Better developer experience
6. **Accessible**: WCAG compliant out of the box

---

## Implementation Plan

### Phase 1: Setup (1 day)
```powershell
npm create vite@latest src/frontend -- --template react-ts
cd src/frontend
npm install
npm install shadcn-ui
npx shadcn-ui@latest init
npx shadcn-ui@latest add slider input textarea select badge progress toast tabs card dialog tooltip
```

### Phase 2: Core Components (2 days)
- [ ] Build PromptInput component
- [ ] Build DurationSlider component
- [ ] Build ShotCountSelector component
- [ ] Build StyleSelector component
- [ ] Build VideoPlayer component

### Phase 3: Integration (1 day)
- [ ] Connect to Tauri backend
- [ ] Implement real-time progress
- [ ] Add error handling

### Phase 4: Polish (1 day)
- [ ] Add animations
- [ ] Optimize performance
- [ ] Add keyboard shortcuts

---

## Next Steps

1. Choose framework (React recommended)
2. Set up project structure
3. Implement core components
4. Connect to Tauri backend
5. Test and deploy

---

*UI Framework guide v1.0*
*Last updated: 2026-08-19*