<script lang="ts">
  // TwoThumbSlider — NO GAP VERSION
  export let values = $state([30, 70])
  export let min = $state(0)
  export let max = $state(100)
  export let step = $state(1)
  export let label = $state('')
  
  export let colorMain = $state('#2a2a3a')
  export let colorTension = $state('#58a6ff')
  export let colorActioned = $state('#79c0ff')
  
  const MIN_GAP = 8
  
  function pct(v: number): number {
    return ((v - min) / (max - min)) * 100
  }
  
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
  
  function getPercentFromEvent(e: PointerEvent): number {
    const track = document.querySelector('.slider-track') as HTMLElement
    if (!track) return 50
    
    const rect = track.getBoundingClientRect()
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  }
  
  function handlePointerMove(e: PointerEvent) {
    if (!dragging) return
    
    const p = getPercentFromEvent(e)
    const v = Math.round((min + p * (max - min)) / step) * step
    
    if (dragging === 'left') {
      const newVal = Math.min(v, values[1] - MIN_GAP)
      values[0] = Math.max(min, newVal)
    } else {
      const newVal = Math.max(v, values[0] + MIN_GAP)
      values[1] = Math.min(max, newVal)
    }
  }
  
  function handleClick(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('.thumb-hit')) return
    if (dragging) return
    
    const p = getPercentFromEvent(e as PointerEvent)
    const v = Math.round((min + p * (max - min)) / step) * step
    
    const d0 = Math.abs(values[0] - v)
    const d1 = Math.abs(values[1] - v)
    
    if (d0 <= d1) {
      const newLeft = Math.min(v, values[1] - MIN_GAP)
      if (newLeft >= min) values[0] = newLeft
    } else {
      const newRight = Math.max(v, values[0] + MIN_GAP)
      if (newRight <= max) values[1] = newRight
    }
  }
</script>

<div 
  class="slider"
  style={`--tension: ${colorTension}; --actioned: ${colorActioned};`}
  on:pointermove={handlePointerMove}
  on:pointerup={endDrag}
  on:pointerleave={endDrag}
>
  {#if label}<div class="label">{label}</div>{/if}
  
  {/* Track — edge to edge, no gaps */}
  <div class="slider-track" onclick={handleClick}>
    {/* Rail spans full width */}
    <div class="rail"></div>
    
    {/* Fill between thumbs */}
    <div 
      class="fill" 
      style={`left: ${pct(Math.min(values[0], values[1]))}%; width: ${Math.abs(pct(values[1]) - pct(values[0]))}%`}
    ></div>
    
    {/* Left thumb — edge to edge positioning */}
    <div 
      class="thumb-hit"
      on:pointerdown={(e) => startDrag('left', e)}
      style={`left: ${pct(values[0])}%`}
    >
      <div class="thumb thumb-a" class:active={dragging === 'left'}>
        <span class="val">{Math.round(values[0])}</span>
      </div>
    </div>
    
    {/* Right thumb — edge to edge positioning */}
    <div 
      class="thumb-hit"
      on:pointerdown={(e) => startDrag('right', e)}
      style={`left: ${pct(values[1])}%`}
    >
      <div class="thumb thumb-b" class:active={dragging === 'right'}>
        <span class="val">{Math.round(values[1])}</span>
      </div>
    </div>
  </div>
</div>

<style>
  :global(.slider) {
    --tension: #58a6ff;
    --actioned: #79c0ff;
    
    display: flex; flex-direction: column; gap: 4px;
    width: 100%;
  }
  
  :global(.label) {
    font-size: 9px; color: #6e7681; text-transform: uppercase;
    letter-spacing: .5px; padding-left: 2px;
  }
  
  /* TRACK — no padding, no margin, no gaps */
  :global(.slider-track) {
    position: relative;
    height: 24px;
    cursor: pointer;
    width: 100%;
  }
  
  /* RAIL — FULL width, NO padding */
  :global(.rail) {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    left: 0;      /* NO padding-left! */
    right: 0;     /* NO padding-right! */
    height: 6px;
    background: #2a2a3a;
    border-radius: 3px;
  }
  
  /* FILL — exactly between thumbs */
  :global(.fill) {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    height: 6px;
    background: var(--tension);
    opacity: 0.6;
    border-radius: 3px;
    pointer-events: none;
    transition: left 0.06s, width 0.06s;
  }
  
  /* THUMB HIT AREA — centered on value */
  :global(.thumb-hit) {
    position: absolute;
    top: 50%;
    width: 28px;   /* Slightly wider than thumb for easier targeting */
    height: 24px;
    transform: translate(-50%, -50%);
    cursor: grab;
    z-index: 2;
  }
  
  :global(.thumb-hit:active) { cursor: grabbing; }
  
  /* THUMB — centered in hit area */
  :global(.thumb) {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    transition: transform 0.1s, box-shadow 0.15s;
    user-select: none;
    
    /* Shared tension color */
    background: radial-gradient(circle at 35% 35%, color-mix(in srgb, var(--tension) 80%, white 20%), var(--tension));
    border: 2px solid var(--tension);
    box-shadow: 0 1px 4px rgba(0,0,0,0.3);
  }
  
  :global(.thumb:hover) { transform: translate(-50%, -50%) scale(1.1); }
  :global(.thumb.active) { transform: translate(-50%, -50%) scale(1.15); }
  
  :global(.thumb.active) {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--actioned) 40%, transparent), 0 2px 6px rgba(0,0,0,0.4);
  }
  
  :global(.val) {
    font-size: 6px;
    font-weight: 700;
    color: rgba(0,0,0,0.7);
    pointer-events: none;
  }
</style>