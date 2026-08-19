<script lang="ts">
  // TwoThumbSlider — CSS-Tricks stacked inputs technique
  export let start = $state(30)
  export let end = $state(70)
  export let min = $state(0)
  export let max = $state(100)
  export let step = $state(1)
  export let label = $state('')
  export let colorTension = $state('#58a6ff')
  
  const MIN_GAP = 8
  
  function pct(v: number): number {
    return ((v - min) / (max - min)) * 100
  }
  
  function onLeftInput(e: Event) {
    const v = parseFloat((e.target as HTMLInputElement).value)
    start = Math.max(min, Math.min(v, end - MIN_GAP))
  }
  
  function onRightInput(e: Event) {
    const v = parseFloat((e.target as HTMLInputElement).value)
    end = Math.min(max, Math.max(v, start + MIN_GAP))
  }
</script>

<div class="slider" style={`--tension: ${colorTension};`}>
  {#if label}<div class="label">{label}</div>{/if}
  
  <div class="track-container">
    {/* Visual rail */}
    <div class="rail"></div>
    
    {/* Fill segment */}
    <div class="fill" 
      style={`left: ${pct(Math.min(start, end))}%; width: ${Math.abs(pct(end) - pct(start))}%`}
    ></div>
    
    {/* Left thumb input — stacked ON TOP of right */}
    <input 
      type="range" 
      class="input input-a"
      min={min}
      max={end - MIN_GAP}
      step={step}
      value={start}
      oninput={onLeftInput}
    >
    
    {/* Right thumb input — stacked BEHIND left */}
    <input 
      type="range" 
      class="input input-b"
      min={start + MIN_GAP}
      max={max}
      step={step}
      value={end}
      oninput={onRightInput}
    >
  </div>
</div>

<style>
  :global(.slider) {
    --tension: #58a6ff;
    display: flex; flex-direction: column; gap: 4px;
    width: 100%;
  }
  
  :global(.label) { font-size: 9px; color: #6e7681; text-transform: uppercase; }
  
  /* Track container */
  :global(.track-container) {
    position: relative;
    height: 28px;
    cursor: pointer;
  }
  
  /* Background rail */
  :global(.rail) {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    left: 0; right: 0;
    height: 6px;
    background: #2a2a3a;
    border-radius: 3px;
  }
  
  /* Fill between thumbs */
  :global(.fill) {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    height: 6px;
    background: var(--tension);
    opacity: 0.5;
    border-radius: 3px;
    pointer-events: none;
  }
  
  /* Range inputs — the core of CSS-Tricks technique */
  :global(.input) {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    cursor: grab;
    z-index: 1;
    background: transparent;
    -webkit-appearance: none;
    appearance: none;
  }
  
  /* Left thumb input — higher z-index (on top) */
  :global(.input-a) { z-index: 2; }
  
  /* Right thumb input — lower z-index (behind) */
  :global(.input-b) { z-index: 1; }
  
  /* Hide default tracks */
  :global(.input::-webkit-slider-runnable-track) {
    height: 6px;
    background: transparent;
  }
  
  :global(.input::-moz-range-track) {
    height: 6px;
    background: transparent;
    border: none;
  }
  
  /* Custom thumb for left (blue) */
  :global(.input-a::-webkit-slider-thumb) {
    -webkit-appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, #c8d8e8, #8ba4c4);
    border: 2px solid #6a8ab5;
    box-shadow: 0 2px 6px rgba(0,0,0,.4);
    cursor: grab;
    margin-top: -6px;
  }
  
  :global(.input-a::-moz-range-thumb) {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, #c8d8e8, #8ba4c4);
    border: 2px solid #6a8ab5;
    box-shadow: 0 2px 6px rgba(0,0,0,.4);
    cursor: grab;
  }
  
  /* Custom thumb for right (green) */
  :global(.input-b::-webkit-slider-thumb) {
    -webkit-appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, #c8e8d0, #7fb89a);
    border: 2px solid #5a9a78;
    box-shadow: 0 2px 6px rgba(0,0,0,.4);
    cursor: grab;
    margin-top: -6px;
  }
  
  :global(.input-b::-moz-range-thumb) {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, #c8e8d0, #7fb89a);
    border: 2px solid #5a9a78;
    box-shadow: 0 2px 6px rgba(0,0,0,.4);
    cursor: grab;
  }
  
  /* Hover effects */
  :global(.input-a:hover::-webkit-slider-thumb) {
    transform: scale(1.1);
    box-shadow: 0 0 0 3px rgba(139,164,196,.4), 0 2px 8px rgba(0,0,0,.5);
  }
  
  :global(.input-b:hover::-webkit-slider-thumb) {
    transform: scale(1.1);
    box-shadow: 0 0 0 3px rgba(127,184,154,.4), 0 2px 8px rgba(0,0,0,.5);
  }
</style>
