# MultiThumb Slider Component

## Features
- Two-thumb range slider with drag interaction
- Click on track to move nearest thumb
- Minimum 8-unit gap enforced between thumbs
- Bold visual track (10px height)
- Pin markers with vertical guide lines
- Color-coded thumbs (blue/green)
- Value readout below track

## Props
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `values` | `[number, number]` | `[30, 70]` | [start, end] positions |
| `min` | `number` | `0` | Minimum value |
| `max` | `number` | `100` | Maximum value |
| `step` | `number` | `1` | Snap increment |
| `label` | `string` | `''` | Optional label |
| `color` | `string` | `'#a8b5d6'` | Accent color |
| `enablePins` | `boolean` | `true` | Show pin markers |
| `pinInterval` | `number` | `10` | Distance between pins |

## Usage
```svelte
<script>
  import MultiThumbSlider from './MultiThumbSlider.svelte'
  let values = $state([30, 70])
</script>

<MultiThumbSlider 
  bind:values
  {min} {max} {step}
  label="Range"
  color="#a8b5d6"
/>
```

## Files
- `src/frontend/components/MultiThumbSlider.svelte` - Main component (237 lines)
- `src/frontend/test-slider.html` - Standalone demo

## Behavior
- Drag left thumb: moves left value (clamped to right - 8)
- Drag right thumb: moves right value (clamped to left + 8)
- Click track: moves nearest thumb to click point
- Pins appear every `pinInterval` units (default: 10)
- Guide line appears when thumb is near a pin
