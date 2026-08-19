<script lang="ts">
  // Two-thumb range slider — working implementation
  export let values = $state([30, 70])
  export let min = $state(0)
  export let max = $state(100)
  export let step = $state(1)
  export let label = $state('')
  export let color = $state('#a8b5d6')
  export let enablePins = $state(true)
  export let pinInterval = $state(10)
  
  const MIN_GAP = 8
  
  function toPercent(v: number): number {
    return ((v - min) / (max - min)) * 100
  }
  
  function fromPercent(p: number): number {
    return min + (p / 100) * (max - min)
  }
  
  // Generate pin positions
  let pins = $derived(
    Array.from({ length: Math.floor((max - min) / pinInterval) }, (_, i) => 
      min + (i + 1) * pinInterval
    ).filter(v => v <= max)
  )
  
  // Track which thumb is being dragged
  let dragging: 'left' | 'right' | null = null
  
  function startDrag(side: 'left' | 'right', e: PointerEvent) {
    e.preventDefault()
    e.stopPropagation()
    dragging = side
    document.body.setPointerCapture(e.pointerId)
  }
  
  function onPointerMove(e: PointerEvent) {
    if (!dragging) return
    
    const track = e.currentTarget as HTMLElement
    const rect = track.getBoundingClientRect()
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const rawValue = fromPercent(percent * 100)
    const snapped = Math.round(rawValue / step) * step
    const clamped = Math.max(min, Math.min(max, snapped))
    
    if (dragging === 'left') {
      // Left thumb: can't exceed right - MIN_GAP
      const maxLeft = values[1] - MIN_GAP
      values[0] = Math.min(clamped, maxLeft)
      if (values[0] < min) values[0] = min
    } else {
      // Right thumb: can't go below left + MIN_GAP
      const minRight = values[0] + MIN_GAP
      values[1] = Math.max(clamped, minRight)
      if (values[1] > max) values[1] = max
    }
  }
  
  function onPointerUp() {
    dragging = null
  }
  
  // Click on empty track area moves nearest thumb
  function handleClick(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('.thumb-hit')) return
    
    const track = e.currentTarget as HTMLElement
    const rect = track.getBoundingClientRect()
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const rawValue = fromPercent(percent * 100)
    const snapped = Math.round(rawValue / step) * step
    const clamped = Math.max(min, Math.min(max, snapped))
    
    // Move nearest thumb
    const distToA = Math.abs(values[0] - clamped)
    const distToB = Math.abs(values[1] - clamped)
    
    if (distToA <= distToB) {
      const newLeft = Math.min(clamped, values[1] - MIN_GAP)
      if (newLeft >= min) {
        values[0] = newLeft
      }
    } else {
      const newRight = Math.max(clamped, values[0] + MIN_GAP)
      if (newRight <= max) {
        values[1] = newRight
      }
    }
  }
  
  // Check if value is near a pin for guide line
  function getSnapStatus(v: number): boolean {
    return Math.abs(v % pinInterval) < 3
  }
</script>

<div class="slider" style={`--c: ${color}`}>
  
  {/* Label */}
  {#if label}<div class="label">{label}</div>{/if}
  
  {/* Pin ruler */}
  {#if enablePins && pins.length > 0}
    <div class="pins-ruler">
      {#each pins as pin (pin)}
        <div class="pin" style={`left: ${toPercent(pin)}%`}>
          <span class="pin-line"></span>
          <span class="pin-value">{pin}</span>
        </div>
      {/each}
    </div>
  {/if}
  
  {/* Track container */}
  <div class="track-container" onclick={handleClick} on:pointermove={onPointerMove} on:pointerup={onPointerUp} on:pointerleave={onPointerUp}>
    <div class="rail"></div>
    <div 
      class="fill" 
      style={`left: ${toPercent(Math.min(values[0], values[1]))}%; width: ${Math.abs(toPercent(values[1]) - toPercent(values[0]))}%`}
    ></div>
    
    {/* Left thumb hit area */}
    <div class="thumb-hit" onpointerdown={(e) => startDrag('left', e)} style={`left: ${toPercent(values[0])}%`}>
      <div class="thumb thumb-a">
        {#if getSnapStatus(values[0])}<span class="guide-line"></span>{/if}
        <span class="thumb-value">{Math.round(values[0])}</span>
      </div>
    </div>
    
    {/* Right thumb hit area */}
    <div class="thumb-hit" onpointerdown={(e) => startDrag('right', e)} style={`left: ${toPercent(values[1])}%`}>
      <div class="thumb thumb-b">
        {#if getSnapStatus(values[1])}<span class="guide-line"></span>{/if}
        <span class="thumb-value">{Math.round(values[1])}</span>
      </div>
    </div>
  </div>
  
  {/* Value readout */}
  <div class="readout">
    <span class="value-chip value-a"><span class="dot dot-a"></span><span>{Math.round(values[0])}</span></span>
    <span class="value-chip value-b"><span class="dot dot-b"></span><span>{Math.round(values[1])}</span></span>
  </div>
</div>

<style>
  :global(.slider) {
    --c: #a8b5d6;
    display: flex; flex-direction: column; gap: 6px;
    padding: 10px 0; width: 100%;
    font-family: system-ui, sans-serif;
    touch-action: none;
  }
  
  :global(.label) {
    font-size: 9px; color: #6e7681; text-transform: uppercase;
    letter-spacing: .5px; padding-left: 2px;
  }
  
  /* Pin ruler */
  :global(.pins-ruler) { position: relative; height: 18px; }
  
  :global(.pin) {
    position: absolute; top: 0; transform: translateX(-50%);
    cursor: pointer; display: flex; flex-direction: column; align-items: center;
  }
  
  :global(.pin-line) {
    display: block; width: 1px; height: 6px;
    background: #3a3a3a; transition: all .12s;
  }
  
  :global(.pin:hover .pin-line) {
    background: var(--c); height: 8px; box-shadow: 0 0 4px var(--c);
  }
  
  :global(.pin-value) {
    font-size: 7px; color: #4a4a4a; margin-top: 2px;
    font-style: normal; font-weight: 400; transition: color .12s;
  }
  
  :global(.pin:hover .pin-value) { color: var(--c); font-weight: 600; }
  
  /* Track container */
  :global(.track-container) {
    position: relative; height: 36px; cursor: pointer;
  }
  
  :global(.rail) {
    position: absolute; top: 50%; transform: translateY(-50%);
    left: 0; right: 0; height: 10px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 5px;
  }
  
  :global(.fill) {
    position: absolute; top: 50%; transform: translateY(-50%);
    height: 10px; background: var(--c); border-radius: 5px;
    opacity: 0.5; pointer-events: none; transition: left .05s, width .05s;
  }
  
  /* Thumb hit areas */
  :global(.thumb-hit) {
    position: absolute; top: 50%;
    width: 36px; height: 36px;
    transform: translate(-50%, -50%);
    cursor: grab; z-index: 3;
    display: flex; align-items: center; justify-content: center;
  }
  
  :global(.thumb-hit:active) { cursor: grabbing; }
  
  /* Thumbs */
  :global(.thumb) {
    width: 20px; height: 20px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    position: relative; transition: transform .08s, box-shadow .12s;
    user-select: none;
  }
  
  :global(.thumb:hover) { transform: scale(1.12); }
  
  /* Left thumb - blue */
  :global(.thumb-a) {
    background: radial-gradient(circle at 35% 35%, #d0dbe8, #8ba4c4);
    border: 2px solid #6a8ab5;
    box-shadow: 0 2px 8px rgba(0,0,0,.4), inset 0 1px 2px rgba(255,255,255,.2);
  }
  
  /* Right thumb - green */
  :global(.thumb-b) {
    background: radial-gradient(circle at 35% 35%, #d0e8d8, #7fb89a);
    border: 2px solid #5a9a78;
    box-shadow: 0 2px 8px rgba(0,0,0,.4), inset 0 1px 2px rgba(255,255,255,.2);
  }
  
  :global(.thumb-value) {
    font-size: 7px; font-weight: 700;
    color: rgba(0, 0, 0, 0.7); pointer-events: none; line-height: 1;
  }
  
  /* Guide line when snapped */
  :global(.guide-line) {
    position: absolute; top: -16px; left: 50%; transform: translateX(-50%);
    width: 1px; height: 16px;
    background: linear-gradient(to bottom, transparent, var(--c));
    opacity: 0; transition: opacity .12s; pointer-events: none;
  }
  
  :global(.thumb:has(.guide-line)) .guide-line { opacity: 1; }
  
  /* Readout */
  :global(.readout) {
    display: flex; justify-content: space-between; padding: 0 4px;
  }
  
  :global(.value-chip) {
    font-size: 12px; font-weight: 600;
    display: flex; align-items: center; gap: 6px;
  }
  
  :global(.value-a) { color: #8ba4c4; }
  :global(.value-b) { color: #7fb89a; }
  
  :global(.dot) { width: 8px; height: 8px; border-radius: 50%; }
  :global(.dot-a) { background: #8ba4c4; }
  :global(.dot-b) { background: #7fb89a; }
</style>
