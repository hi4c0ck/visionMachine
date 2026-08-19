# Multi-Thumb Slider Components

## Architecture

### 1. TwoThumbSlider.svelte (Core Component)
**Path:** `src/frontend/components/TwoThumbSlider.svelte`

The fundamental two-thumb slider with 3-color theming system:
- **colorMain**: Track background color
- **colorTension**: Shared by both thumbs AND the fill between them
- **colorActioned**: Hover/active accent color

**Props:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `values` | `[number, number]` | `[30, 70]` | [start, end] positions |
| `min` | `number` | `0` | Minimum value |
| `max` | `number` | `100` | Maximum value |
| `step` | `number` | `1` | Snap increment |
| `label` | `string` | `''` | Optional label |
| `colorMain` | `string` | `#2a2a3a` | Track/background color |
| `colorTension` | `string` | `#58a6ff` | Shared thumb + fill color |
| `colorActioned` | `string` | `#79c0ff` | Hover/active accent |
| `enablePins` | `boolean` | `true` | Show pin markers |
| `pinInterval` | `number` | `10` | Distance between pins |
| `minGap` | `number` | `8` | Minimum gap between thumbs |

**Interaction:**
- Drag either thumb to adjust range
- Click on empty track → moves nearest thumb
- Minimum gap enforced (default: 8 units)
- Guide lines appear when near pins

### 2. SliderScroller.svelte (Wrapper Component)
**Path:** `src/frontend/components/SliderScroller.svelte`

Wraps multiple TwoThumbSlider instances with:
- Bold visible track border (distinguishes active/inactive state)
- Status indicator dot (glows when focused/active)
- Value readout below each slider
- Label header

## Usage

```svelte
<script>
  import TwoThumbSlider from './TwoThumbSlider.svelte'
  import SliderScroller from './SliderScroller.svelte'
  
  let positionValues = $state([30, 70])
  let durationValues = $state([20, 80])
</script>

<!-- Basic usage -->
<TwoThumbSlider
  bind:values={positionValues}
  label="Position"
  colorTension="#58a6ff"
/>

<!-- With wrapper for visual grouping -->
<SliderScroller
  bind:values={positionValues}
  label="Position Range"
  colorTension="#58a6ff"
  colorActioned="#79c0ff"
/>
```

## Files
```
src/frontend/components/
├── TwoThumbSlider.svelte    (core, 250 lines)
├── SliderScroller.svelte    (wrapper, 120 lines)
└── FrameRuler.svelte        (existing)

src/frontend/
└── test-slider.html         (demo with 3 examples)
```

## Design System

| Element | Style |
|---------|-------|
| Track rail | 6px height, colorMain |
| Fill segments | 3 segments: left (tinted), middle (tension, 60% opacity), right (tinted) |
| Left thumb | Tension color with actioned glow on hover |
| Right thumb | Tension color with actioned glow on hover |
| Hit areas | 32px wide for easy touching |
| Pin markers | 1px line, highlight on hover |
| Guide lines | Appear when within 2 steps of a pin |
