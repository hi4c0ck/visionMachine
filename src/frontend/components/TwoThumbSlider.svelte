<script lang="ts">
  // TwoThumbSlider — Clean implementation matching reference structure
  export let values = $state([30, 70])
  export let min = $state(0)
  export let max = $state(100)
  export let step = $state(1)
  export let label = $state('')
  
  // 3-color system: main (track), tension (shared thumbs+fill), actioned (hover/active)
  export let colorMain = $state('#2a2a3a')
  export let colorTension = $state('#58a6ff')
  export let colorActioned = $state('#79c0ff')
  
  export let enablePins = $state(true)
  export let pinInterval = $state(10)
  export let minGap = $state(8)
  
  function toPercent(v: number): number {
    return ((v - min) / (max - min)) * 100
  }
  
  function fromPercent(p: number): number {
    return min + (p / 100) * (max - min)
  }
  
  // Generate pins
  let pins = $derived(
    Array.from({ length: Math.floor((max - min) / pinInterval) }, (_, i) => 
      min + (i + 1) * pinInterval
    ).filter(v => v <= max)
  )
  
  // Drag state
  let dragging: 'left' | 'right' | null = null
  
  function startDrag(side: 'left' | 'right', e: PointerEvent) {
    e.preventDefault()
    e.stopPropagation()
    dragging = side
    document.body.setPointerCapture(e.pointerId)
  }
  
  function endDrag() {
    dragging = null
  }
  
  // Get value from pointer position relative to track
  function getValueFromEvent(e: PointerEvent): number {
    const track = document.querySelector('.track-container') as HTMLElement
    if (!track) return values[0]
    
    const rect = track.getBoundingClientRect()
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const rawValue = fromPercent(percent * 100)
    return Math.round(rawValue / step) * step
  }
  
  // Global move handler
  function handlePointerMove(e: PointerEvent) {
    if (!dragging) return
    
    const v = getValueFromEvent(e)
    
    if (dragging === 'left') {
      const newVal = Math.min(v, values[1] - minGap)
      values[0] = Math.max(min, newVal)
    } else {
      const newVal = Math.max(v, values[0] + minGap)
      values[1] = Math.min(max, newVal)
    }
  }
  
  // Click on track moves nearest thumb
  function handleClick(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('.thumb-hit')) return
    if (dragging) return
    
    const v = getValueFromEvent(e as PointerEvent)
    
    const d0 = Math.abs(values[0] - v)
    const d1 = Math.abs(values[1] - v)
    
    if (d0 <= d1) {
      const newLeft = Math.min(v, values[1] - minGap)
      if (newLeft >= min) values[0] = newLeft
    } else {
      const newRight = Math.max(v, values[0] + minGap)
      if (newRight <= max) values[1] = newRight
    }
  }
  
  // Check snap status
  function isSnapped(v: number): boolean {
    return Math.abs(v % pinInterval) < step * 2
  }
</script>

<div 
  class="two-thumb-slider"
  style={`--color-main: ${colorMain}; --color-tension: ${colorTension}; --color-actioned: ${colorActioned};`}
  on:pointermove={handlePointerMove}
  on:pointerup={endDrag}
  on:pointerleave={endDrag}
>
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
  <div class="track-container" onclick={handleClick}>
    <div class="rail"></div>
    
    {/* Fill segments */}
    <div class="fill fill-left" style={`width: ${toPercent(Math.min(values[0], values[1]))}%`}></div>
    <div 
      class="fill fill-middle" 
      style={`left: ${toPercent(Math.min(values[0], values[1]))}%; width: ${Math.abs(toPercent(values[1]) - toPercent(values[0]))}%`}
    ></div>
    <div class="fill fill-right" style={`left: ${toPercent(Math.max(values[0], values[1]))}%`}></div>
    
    {/* Left thumb */}
    <div 
      class="thumb-hit" 
      on:pointerdown={(e) => startDrag('left', e)}
      ontouchstart={(e) => startDrag('left', e)}
      style={`left: ${toPercent(values[0])}%`}
    >
      <div class="thumb thumb-a" class:active={dragging === 'left'}>
        {#if isSnapped(values[0])}<span class="guide-line"></span>{/if}
        <span class="value">{Math.round(values[0])}</span>
      </div>
    </div>
    
    {/* Right thumb */}
    <div 
      class="thumb-hit" 
      on:pointerdown={(e) => startDrag('right', e)}
      ontouchstart={(e) => startDrag('right', e)}
      style={`left: ${toPercent(values[1])}%`}
    >
      <div class="thumb thumb-b" class:active={dragging === 'right'}>
        {#if isSnapped(values[1])}<span class="guide-line"></span>{/if}
        <span class="value">{Math.round(values[1])}</span>
      </div>
    </div>
  </div>
</div>

<style>
  :global(.two-thumb-slider) {
    --color-main: #2a2a3a;
    --color-tension: #58a6ff;
    --color-actioned: #79c0ff;
    
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 0;
    width: 100%;
    touch-action: none;
    user-select: none;
  }
  
  :global(.label) {
    font-size: 9px; color: #6e7681; text-transform: uppercase;
    letter-spacing: .5px; padding-left: 2px;
  }
  
  /* Pins */
  :global(.pins-ruler) { position: relative; height: 16px; }
  :global(.pin) {
    position: absolute; top: 0; transform: translateX(-50%);
    cursor: pointer; display: flex; flex-direction: column; align-items: center;
  }
  :global(.pin-line) {
    display: block; width: 1px; height: 5px;
    background: #3a3a3a; transition: all .12s;
  }
  :global(.pin:hover .pin-line) {
    background: var(--color-actioned); height: 7px; box-shadow: 0 0 4px var(--color-actioned);
  }
  :global(.pin-value) { font-size: 7px; color: #4a4a4a; margin-top: 2px; }
  :global(.pin:hover .pin-value) { color: var(--color-actioned); }
  
  /* Track */
  :global(.track-container) { position: relative; height: 28px; cursor: pointer; }
  :global(.rail) {
    position: absolute; top: 50%; transform: translateY(-50%);
    left: 0; right: 0; height: 6px; background: var(--color-main); border-radius: 3px;
  }
  
  /* Fills */
  :global(.fill) {
    position: absolute; top: 50%; transform: translateY(-50%);
    height: 6px; border-radius: 3px; pointer-events: none;
    transition: left .06s ease-out, width .06s ease-out;
  }
  :global(.fill-left), :global(.fill-right) { background: color-mix(in srgb, var(--color-main) 60%, var(--color-tension) 40%); }
  :global(.fill-middle) { background: var(--color-tension); opacity: 0.5; }
  
  /* Thumb hit areas */
  :global(.thumb-hit) {
    position: absolute; top: 50%; width: 32px; height: 28px;
    transform: translate(-50%, -50%); cursor: grab; z-index: 3;
    display: flex; align-items: center; justify-content: center;
  }
  :global(.thumb-hit:active) { cursor: grabbing; }
  
  /* Thumbs — BOTH use tension color */
  :global(.thumb) {
    width: 18px; height: 18px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    transition: transform .1s ease, box-shadow .15s ease;
    user-select: none;
    
    background: radial-gradient(circle at 35% 35%, color-mix(in srgb, var(--color-tension) 80%, white 20%), var(--color-tension));
    border: 2px solid var(--color-tension);
    box-shadow: 0 1px 4px rgba(0,0,0,.3);
  }
  
  :global(.thumb:hover) { transform: scale(1.15); }
  :global(.thumb.active) { transform: scale(1.2); }
  
  :global(.thumb.active) {
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--color-actioned) 40%, transparent), 0 4px 12px rgba(0,0,0,.4);
  }
  
  :global(.value) {
    font-size: 6px; font-weight: 700; color: rgba(0,0,0,.7); pointer-events: none;
  }
  
  /* Guide line when snapped */
  :global(.guide-line) {
    position: absolute; top: -14px; left: 50%; transform: translateX(-50%);
    width: 1px; height: 14px;
    background: linear-gradient(to bottom, transparent, var(--color-actioned));
    opacity: 0; transition: opacity .12s; pointer-events: none;
  }
  
  :global(.thumb:has(.guide-line):hover) .guide-line,
  :global(.thumb:has(.guide-line).active) .guide-line { opacity: 1; }
</style>
