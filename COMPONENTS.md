# TwoThumbSlider Component

## Implementation
CSS-Tricks technique with two stacked native `<input type="range">` elements.

## Files
- `src/frontend/components/TwoThumbSlider.svelte` — Main component (190 lines)
- `src/frontend/test-slider.html` — Standalone demo
- `COMPONENTS.md` — This documentation

## Props
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `start` | `number` | `30` | Left thumb value |
| `end` | `number` | `70` | Right thumb value |
| `min` | `number` | `0` | Minimum value |
| `max` | `number` | `100` | Maximum value |
| `step` | `number` | `1` | Snap increment |
| `label` | `string` | `''` | Optional label |
| `colorTension` | `string` | `#58a6ff` | Fill/thumb color |

## Usage
```svelte
<script>
  import TwoThumbSlider from './TwoThumbSlider.svelte'
  let start = $state(30)
  let end = $state(70)
</script>

<TwoThumbSlider
  {start}
  {end}
  {min}
  {max}
  step={1}
  label="Position"
/>
```

## How It Works
- Two native range inputs are stacked on top of each other
- Left input has higher z-index (interacts first)
- Right input sits behind left input
- CSS customizes the visible thumbs while hiding default ones
- Fill segment shown between thumb positions
- Minimum 8-unit gap enforced between thumbs