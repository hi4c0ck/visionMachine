<script lang="ts">
  // SliderScroller — Wrapper with bold track and active/inactive theming
  import TwoThumbSlider from './TwoThumbSlider.svelte'
  
  export let values = $state([30, 70])
  export let min = $state(0)
  export let max = $state(100)
  export let step = $state(1)
  export let label = $state('')
  
  // Theme colors
  export let trackBgColor = $state('#1a1a2a')
  export let activeTrackBgColor = $state('#2a2a4a')
  export let borderColor = $state('#2a2a4a')
  export let activeBorderColor = $state('#58a6ff')
  
  // Pass-through to TwoThumbSlider
  export let colorMain = $state('#2a2a3a')
  export let colorTension = $state('#58a6ff')
  export let colorActioned = $state('#79c0ff')
  export let enablePins = $state(true)
  export let pinInterval = $state(10)
  
  // Active state tracking
  let isFocused = $state(false)
  
  $effect(() => {
    isFocused = true
  })
</script>

<div 
  class="slider-scroller"
  class:active={isFocused}
  style={`
    --track-bg: ${isFocused ? activeTrackBgColor : trackBgColor};
    --border: ${isFocused ? activeBorderColor : borderColor};
  `}
  tabindex={0}
  on:focusin={() => isFocused = true}
  on:focusout={() => isFocused = false}
>
  {/* Header */}
  <div class="scroller-header">
    {#if label}<span class="scroller-label">{label}</span>{/if}
    <span class="status-dot"></span>
  </div>
  
  {/* Slider */}
  <TwoThumbSlider
    bind:values
    {min} {max} {step}
    {colorMain}
    {colorTension}
    {colorActioned}
    {enablePins}
    {pinInterval}
  />
  
  {/* Readout */}
  <div class="scroller-readout">
    <span class="readout-start">{Math.round(values[0])}</span>
    <span class="readout-sep">—</span>
    <span class="readout-end">{Math.round(values[1])}</span>
  </div>
</div>

<style>
  :global(.slider-scroller) {
    --track-bg: #1a1a2a;
    --border: #2a2a4a;
    
    position: relative;
    padding: 14px 16px;
    background: var(--track-bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    margin-bottom: 8px;
    transition: all .2s ease;
    outline: none;
  }
  
  :global(.slider-scroller.active) {
    border-color: var(--border);
    box-shadow: 0 0 0 1px var(--border), 0 4px 12px rgba(0,0,0,.3);
  }
  
  :global(.scroller-header) {
    display: flex; align-items: center; gap: 8px;
    margin-bottom: 10px;
  }
  
  :global(.scroller-label) {
    font-size: 10px; font-weight: 600; color: #6e7681;
    text-transform: uppercase; letter-spacing: .5px;
  }
  
  :global(.status-dot) {
    width: 6px; height: 6px; border-radius: 50%;
    background: #3a3a4a; margin-left: auto;
    transition: background .2s ease;
  }
  
  :global(.slider-scroller.active .status-dot) {
    background: #58a6ff;
    box-shadow: 0 0 6px #58a6ff;
  }
  
  :global(.scroller-readout) {
    display: flex; justify-content: space-between;
    align-items: center;
    padding-top: 10px;
    margin-top: 4px;
    border-top: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
  }
  
  :global(.readout-start) { font-size: 11px; font-weight: 600; color: #79c0ff; }
  :global(.readout-end) { font-size: 11px; font-weight: 600; color: #56d364; }
  :global(.readout-sep) { font-size: 11px; color: #484f58; }
</style>
