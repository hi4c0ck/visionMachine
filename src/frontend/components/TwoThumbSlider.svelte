<script lang="ts">
  // TwoThumbSlider — Custom multi-thumb range slider
  export let start = $state(30)
  export let end = $state(70)
  export let min = $state(0)
  export let max = $state(100)
  export let step = $state(1)
  export let label = $state('')
  export let colorMain = $state('#2a2a3a')    // track/rail color
  export let colorTension = $state('#58a6ff') // thumbs + fill color
  export let showPins = $state(true)
  
  const MIN_GAP = 8
  const PIN_SNAP_THRESHOLD = 5
  
  function pct(v: number): number {
    return ((v - min) / (max - min)) * 100
  }
  
  function snapToPin(value: number): number {
    if (!showPins) return value
    const pinValue = Math.round(value / 10) * 10
    if (Math.abs(value - pinValue) < PIN_SNAP_THRESHOLD) return pinValue
    return value
  }
  
  function isSnapped(value: number): boolean {
    if (!showPins) return false
    const pinValue = Math.round(value / 10) * 10
    return Math.abs(value - pinValue) < PIN_SNAP_THRESHOLD
  }
  
  let activeThumb: 'start' | 'end' | null = null
  
  function pointerDown(e: PointerEvent, thumb: 'start' | 'end') {
    e.stopPropagation()
    e.preventDefault()
    activeThumb = thumb
    
    const handlePointerMove = (e: PointerEvent) => {
      if (!activeThumb) return
      e.preventDefault()
      
      const slider = (e.currentTarget as HTMLElement).closest('.slider-container')
      if (!slider) return
      
      const rect = slider.getBoundingClientRect()
      const p = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      let v = Math.round((min + p * (max - min)) / step) * step
      v = snapToPin(v)
      
      if (activeThumb === 'start') {
        start = Math.max(min, Math.min(v, end - MIN_GAP))
      } else {
        end = Math.min(max, Math.max(v, start + MIN_GAP))
      }
    }
    
    const handlePointerUp = () => {
      activeThumb = null
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('pointerup', handlePointerUp)
    }
    
    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', handlePointerUp)
  }
  
  function onClickTrack(e: MouseEvent) {
    if ((e.target as HTMLElement).matches('.thumb, .thumb-wrapper, .endpoint')) return
    
    const slider = (e.currentTarget as HTMLElement).closest('.slider-container')
    if (!slider) return
    
    const rect = slider.getBoundingClientRect()
    const p = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const v = Math.round((min + p * (max - min)) / step) * step
    
    const d0 = Math.abs(start - v)
    const d1 = Math.abs(end - v)
    
    if (d0 <= d1) {
      start = Math.max(min, Math.min(v, end - MIN_GAP))
    } else {
      end = Math.min(max, Math.max(v, start + MIN_GAP))
    }
  }
</script>

<div class="two-thumb-slider" style={`--track-color: ${colorTension}; --rail-color: ${colorMain};`}>
  {#if label}<div class="slider-label">{label}</div>{/if}
  
  {#if showPins}
  <div class="pin-ruler">
    {#each Array.from({length: Math.ceil(max / 10)}, (_, i) => i + 1) as num}
      <div class="pin-marker" 
           style={`left: ${pct(num * 10)}%;`}
           class:active={isSnapped(num * 10)}
      >
        <div class="pin-line"></div>
        <span class="pin-value">{num * 10}</span>
      </div>
    {/each}
  </div>
  {/if}
  
  <div class="slider-container" onclick={onClickTrack}>
    {/* Background rail */}
    <div class="track-background"></div>
    
    {/* Fill segment between thumbs */}
    <div class="track-segment" 
         style={`left: ${pct(Math.min(start, end))}%; width: ${Math.abs(pct(end) - pct(start))}%`}
         class:snapped={isSnapped(start) || isSnapped(end)}
    ></div>
    
    {/* Left endpoint */}
    <div class="endpoint-wrapper" style={`left: ${pct(start)}%;`}>
      <button class="endpoint" on:pointerdown={(e) => pointerDown(e, 'start')} disabled={start <= min}>
        <span class="endpoint-text">{Math.round(start)}</span>
      </button>
    </div>
    
    {/* Start thumb */}
    <div class="thumb-wrapper" style={`left: ${pct(start)}%;`}>
      <div class="guide-line" style={`opacity: ${isSnapped(start) ? 1 : 0}`}></div>
      <div class="thumb" 
           on:pointerdown={(e) => pointerDown(e, 'start')}
           class:snapped={isSnapped(start)}
      >
        <span class="thumb-text">{Math.round(start)}</span>
        <span class="thumb-label">S</span>
      </div>
    </div>
    
    {/* End thumb */}
    <div class="thumb-wrapper" style={`left: ${pct(end)}%;`}>
      <div class="guide-line" style={`opacity: ${isSnapped(end) ? 1 : 0}`}></div>
      <div class="thumb" 
           on:pointerdown={(e) => pointerDown(e, 'end')}
           class:snapped={isSnapped(end)}
      >
        <span class="thumb-text">{Math.round(end)}</span>
        <span class="thumb-label">E</span>
      </div>
    </div>
    
    {/* Right endpoint */}
    <div class="endpoint-wrapper" style={`left: ${pct(end)}%;`}>
      <button class="endpoint" on:pointerdown={(e) => pointerDown(e, 'end')} disabled={end >= max}>
        <span class="endpoint-text">{Math.round(end)}</span>
      </button>
    </div>
  </div>
</div>

<style>
  :global(.two-thumb-slider) {
    --track-color: #58a6ff;
    --rail-color: #2a2a3a;
    
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px 0;
    width: 100%;
    user-select: none;
  }
  
  /* Pin ruler */
  :global(.pin-ruler) {
    position: relative;
    height: 10px;
    margin-bottom: 4px;
  }
  
  :global(.pin-marker) {
    position: absolute;
    bottom: 0;
    transform: translateX(-50%);
    cursor: default;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    opacity: 0.4;
    transition: all 0.15s;
  }
  
  :global(.pin-line) {
    width: 1px;
    height: 6px;
    background: #4a4a4a;
    transition: all 0.15s;
  }
  
  :global(.pin-value) {
    font-size: 7px;
    color: #4a4a4a;
    transition: color 0.15s;
  }
  
  :global(.pin-marker.active .pin-line) {
    background: var(--track-color);
    height: 8px;
  }
  
  :global(.pin-marker.active .pin-value) {
    color: var(--track-color);
    font-weight: 600;
  }
  
  /* Slider container */
  :global(.slider-container) {
    position: relative;
    height: 36px;
    display: flex;
    align-items: center;
    cursor: pointer;
  }
  
  /* Background rail */
  :global(.track-background) {
    position: absolute;
    left: 8px;
    right: 8px;
    height: 6px;
    background: var(--rail-color);
    border-radius: 3px;
    z-index: 1;
  }
  
  /* Active fill segment */
  :global(.track-segment) {
    position: absolute;
    height: 6px;
    background: var(--track-color);
    border-radius: 3px;
    z-index: 2;
    opacity: 0.6;
    transition: opacity 0.15s;
    pointer-events: none;
  }
  
  :global(.track-segment.snapped) {
    opacity: 1;
    box-shadow: 0 0 8px var(--track-color);
  }
  
  /* Endpoint wrapper */
  :global(.endpoint-wrapper) {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    z-index: 10;
  }
  
  /* Endpoints */
  :global(.endpoint) {
    width: 16px;
    height: 16px;
    background: transparent;
    border: 2px solid var(--track-color);
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    margin: 0;
    transition: transform 0.1s, box-shadow 0.1s;
  }
  
  :global(.endpoint:hover:not(:disabled)) {
    transform: scale(1.1);
    box-shadow: 0 0 0 3px rgba(var(--track-color), 0.3);
  }
  
  :global(.endpoint:disabled) {
    opacity: 0.3;
    cursor: default;
  }
  
  :global(.endpoint-text) {
    font-size: 6px;
    font-weight: 600;
    color: rgba(0,0,0,.7);
    pointer-events: none;
  }
  
  /* Thumbs */
  :global(.thumb-wrapper) {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    z-index: 20;
  }
  
  /* Guide line */
  :global(.guide-line) {
    position: absolute;
    top: -24px;
    left: 50%;
    transform: translateX(-50%);
    width: 1px;
    height: 24px;
    background: linear-gradient(to bottom, transparent, var(--track-color));
    pointer-events: none;
    transition: opacity 0.15s;
  }
  
  :global(.thumb) {
    width: 20px;
    height: 20px;
    background: var(--track-color);
    border: 2px solid var(--track-color);
    border-radius: 50%;
    cursor: grab;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(0,0,0,.4);
    transition: transform 0.1s, box-shadow 0.1s;
    line-height: 1;
  }
  
  :global(.thumb:active) {
    cursor: grabbing;
  }
  
  :global(.thumb:hover) {
    transform: scale(1.1);
    box-shadow: 0 4px 12px rgba(0,0,0,.5);
  }
  
  :global(.thumb.snapped) {
    box-shadow: 0 0 0 3px var(--track-color), 0 0 12px var(--track-color);
    transform: scale(1.1);
  }
  
  :global(.thumb-text) {
    font-size: 8px;
    font-weight: 700;
    color: rgba(0,0,0,.8);
    pointer-events: none;
  }
  
  :global(.thumb-label) {
    font-size: 5px;
    font-weight: 500;
    color: rgba(0,0,0,.5);
    text-transform: uppercase;
    pointer-events: none;
  }
  
  /* Label */
  :global(.slider-label) {
    font-size: 10px;
    font-weight: 500;
    color: #6a6a6a;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding-left: 4px;
  }
</style>
