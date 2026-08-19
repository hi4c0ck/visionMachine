<script lang="ts">
  // Enhanced Custom Slider - Multi-thumb with draggable endpoints and pin snapping
  export let values = $state([50]); // Array for multiple thumbs
  export let min = $state(0);
  export let max = $state(100);
  export let step = $state(1);
  export let label = $state('');
  export let trackColor = $state('#a8b5d6');
  export let showLabels = $state(true);
  export let enablePins = $state(true);
  export let pinInterval = $state(10); // Pin every N units
  
  // Calculate percentages for each thumb
  function getPercentage(value: number): number {
    return ((value - min) / (max - min)) * 100;
  }
  
  // Handle value change
  function onValueChange(index: number, newValue: number) {
    values = values.map((v, i) => i === index ? Math.max(min, Math.min(max, newValue)) : v);
  }
  
  // Add thumb (right-click or button)
  function addThumb(e?: MouseEvent) {
    if (e) e.preventDefault();
    const newValues = [...values];
    newValues.push(Math.round((min + max) / 2));
    values = newValues;
  }
  
  // Remove thumb
  function removeThumb(index: number) {
    if (values.length <= 1) return;
    values = values.filter((_, i) => i !== index);
  }
  
  // Snap to nearest pin
  function snapToPin(value: number): number {
    if (!enablePins) return value;
    const pinValue = Math.round(value / pinInterval) * pinInterval;
    return Math.max(min, Math.min(max, pinValue));
  }
  
  // Get pin positions
  let pins = $derived(
    Array.from(
      { length: Math.floor((max - min) / pinInterval) },
      (_, i) => min + (i + 1) * pinInterval
    ).filter(v => v <= max)
  );
  
  // Check if value is near a pin (for snapping feedback)
  function isNearPin(value: number): boolean {
    return pins.some(pin => Math.abs(value - pin) < step * 2);
  }
  
  // Get nearest pin
  function getNearestPin(value: number): number | null {
    let nearest = null;
    let minDist = Infinity;
    for (const pin of pins) {
      const dist = Math.abs(value - pin);
      if (dist < minDist) {
        minDist = dist;
        nearest = pin;
      }
    }
    return minDist < step * 3 ? nearest : null;
  }
  
  // Right-click handler to add thumb
  function onContextMenu(e: MouseEvent, index: number) {
    e.preventDefault();
    if (index === values.length - 1) {
      addThumb();
    }
  }
</script>

<div class="custom-slider" style:--track-color="{trackColor}">
  {/* Pin Ruler (Frame-ruler style at top) */}
  {#if enablePins}
    <div class="pin-ruler">
      {#each pins as pin (pin)}
        <div 
          class="pin-marker"
          class:active={getNearestPin(values[values.length - 1]) === pin}
        >
          <div class="pin-line"></div>
          <span class="pin-value">{pin}</span>
        </div>
      {/each}
    </div>
  {/if}
  
  {/* Label */}
  {#if label}
    <div class="slider-label">{label}</div>
  {/if}
  
  <div class="slider-container">
    {/* Track background */}
    <div class="track-background"></div>
    
    {/* Track fills for each segment */}
    {#each values as value, i (i)}
      {#if i > 0}
        <div 
          class="track-segment"
          class:snapped={!!getNearestPin(value)}
          style:--segment-start="{getPercentage(values[i - 1])}%"
          style:--segment-end="{getPercentage(value)}%"
        ></div>
      {/if}
    {/each}
    
    {/* Drag handle zone (invisible, larger hit area) */}
    <input 
      type="range" 
      class="drag-zone"
      min="{min}" 
      max="{max}" 
      step="{step}"
      value="{values[values.length - 1]}"
      oninput={(e) => onValueChange(values.length - 1, parseFloat(e.currentTarget.value))}
      oncontextmenu={(e) => onContextMenu(e, values.length - 1)}
    />
    
    {/* Start endpoint (draggable) */}
    <button 
      class="endpoint start"
      class:selected={values[0] === min}
      onclick={() => onValueChange(0, min)}
      oncontextmenu={(e) => { e.preventDefault(); addThumb(); }}
      title="Drag to move • Right-click to add thumb"
    >
      <span class="endpoint-text">{showLabels ? values[0] : ''}</span>
    </button>
    
    {/* Thumbs */}
    {#each values as value, i (i)}
      <div 
        class="thumb-wrapper"
        style:left="{getPercentage(value)}%"
        oncontextmenu={(e) => onContextMenu(e, i)}
      >
        {/* Vertical guide line when near pin */}
        {#if getNearestPin(value)}
          <div class="guide-line"></div>
        {/if}
        
        <div 
          class="thumb"
          class:snapped={!!getNearestPin(value)}
          class:last={i === values.length - 1}
        >
          <span class="thumb-text">{Math.round(value)}</span>
          {#if showLabels}
            <span class="thumb-label">#{i + 1}</span>
          {/if}
        </div>
        
        {/* Remove button (only for middle thumbs) */}
        {#if i > 0 && values.length > 1}
          <button 
            class="remove-btn"
            onclick={() => removeThumb(i)}
            title="Remove thumb"
          >✕</button>
        {/if}
      </div>
    {/each}
    
    {/* End endpoint */}
    <button 
      class="endpoint end"
      class:selected={values[values.length - 1] === max}
      onclick={() => onValueChange(values.length - 1, max)}
      title="Set to max"
    >
      <span class="endpoint-text">{showLabels ? max : ''}</span>
    </button>
    
    {/* Add thumb button */}
    <button 
      class="add-thumb-btn"
      onclick={addThumb}
      title="Add new thumb"
    >＋</button>
  </div>
</div>

<style>
  .custom-slider {
    --track-color: #a8b5d6;
    --track-height: 6px;
    --endpoint-size: 14px;
    --thumb-size: 24px;
    --pin-height: 8px;
    
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px 0;
    position: relative;
  }
  
  /* Pin Ruler (top section) */
  .pin-ruler {
    position: relative;
    height: var(--pin-height);
    margin-bottom: 4px;
    display: flex;
    align-items: flex-end;
  }
  
  .pin-marker {
    position: absolute;
    bottom: 0;
    transform: translateX(-50%);
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  
  .pin-line {
    width: 1px;
    height: 6px;
    background: #3a3a3a;
    transition: all 0.15s;
  }
  
  .pin-marker.active .pin-line {
    background: var(--track-color);
    height: 8px;
    box-shadow: 0 0 4px var(--track-color);
  }
  
  .pin-value {
    font-size: 7px;
    color: #4a4a4a;
    transition: color 0.15s;
  }
  
  .pin-marker.active .pin-value {
    color: var(--track-color);
    font-weight: 600;
  }
  
  /* Slider label */
  .slider-label {
    font-size: 10px;
    font-weight: 500;
    color: #6a6a6a;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding-left: 4px;
  }
  
  /* Slider container */
  .slider-container {
    position: relative;
    height: calc(var(--thumb-size) + 8px);
    display: flex;
    align-items: center;
    cursor: pointer;
  }
  
  /* Track backgrounds */
  .track-background {
    position: absolute;
    left: calc(var(--endpoint-size) / 2);
    right: calc(var(--endpoint-size) / 2);
    height: var(--track-height);
    background: #2a2a2a;
    border-radius: calc(var(--track-height) / 2);
    z-index: 1;
  }
  
  /* Track segments between thumbs */
  .track-segment {
    position: absolute;
    height: var(--track-height);
    background: var(--track-color);
    border-radius: calc(var(--track-height) / 2);
    z-index: 2;
    opacity: 0.6;
    transition: opacity 0.15s;
  }
  
  .track-segment.snapped {
    opacity: 1;
    box-shadow: 0 0 8px var(--track-color);
  }
  
  /* Drag zone (invisible but larger hit area) */
  .drag-zone {
    position: absolute;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: grab;
    z-index: 30;
    margin: 0;
    -webkit-appearance: none;
  }
  
  .drag-zone:active {
    cursor: grabbing;
  }
  
  /* Endpoints (start and end) */
  .endpoint {
    position: absolute;
    width: var(--endpoint-size);
    height: var(--endpoint-size);
    background: var(--track-color);
    border: 2px solid var(--track-color);
    border-radius: 50%;
    cursor: grab;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;
    transition: all 0.15s;
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.3);
  }
  
  .endpoint:active {
    cursor: grabbing;
  }
  
  .endpoint.start {
    left: 0;
  }
  
  .endpoint.end {
    right: 0;
  }
  
  .endpoint:hover {
    transform: scale(1.15);
    box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.4), 0 0 8px var(--track-color);
  }
  
  .endpoint.selected {
    transform: scale(1.1);
    box-shadow: 0 0 0 3px var(--track-color), 0 0 12px var(--track-color);
  }
  
  .endpoint-text {
    font-size: 7px;
    font-weight: 600;
    color: rgba(0, 0, 0, 0.6);
    pointer-events: none;
  }
  
  /* Thumb wrapper (contains thumb + guide line + remove btn) */
  .thumb-wrapper {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    z-index: 20;
  }
  
  /* Vertical guide line */
  .guide-line {
    position: absolute;
    top: -20px;
    left: 50%;
    transform: translateX(-50%);
    width: 1px;
    height: 20px;
    background: linear-gradient(to bottom, transparent, var(--track-color));
    opacity: 0;
    transition: opacity 0.15s;
    pointer-events: none;
  }
  
  .thumb-wrapper:has(.thumb.snapped) .guide-line {
    opacity: 1;
  }
  
  /* Thumb */
  .thumb {
    width: var(--thumb-size);
    height: var(--thumb-size);
    background: var(--track-color);
    border: 2px solid var(--track-color);
    border-radius: 50%;
    cursor: grab;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4), 0 0 0 2px rgba(0, 0, 0, 0.2);
    transition: all 0.1s;
    user-select: none;
  }
  
  .thumb:active {
    cursor: grabbing;
  }
  
  .thumb:hover {
    transform: scale(1.1);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5), 0 0 0 3px rgba(0, 0, 0, 0.3);
  }
  
  .thumb.snapped {
    box-shadow: 0 0 0 3px var(--track-color), 0 0 12px var(--track-color);
    transform: scale(1.1);
  }
  
  .thumb.last {
    z-index: 25;
  }
  
  .thumb-text {
    font-size: 8px;
    font-weight: 700;
    color: rgba(0, 0, 0, 0.8);
    line-height: 1;
    pointer-events: none;
  }
  
  .thumb-label {
    font-size: 5px;
    font-weight: 500;
    color: rgba(0, 0, 0, 0.5);
    text-transform: uppercase;
    pointer-events: none;
  }
  
  /* Remove button */
  .remove-btn {
    position: absolute;
    top: -28px;
    width: 16px;
    height: 16px;
    background: var(--color-error, #ef4444);
    border: none;
    border-radius: 50%;
    color: white;
    font-size: 10px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.15s;
    z-index: 30;
  }
  
  .thumb-wrapper:hover .remove-btn {
    opacity: 1;
  }
  
  .remove-btn:hover {
    transform: scale(1.1);
  }
  
  /* Add thumb button */
  .add-thumb-btn {
    position: absolute;
    right: calc(var(--endpoint-size) / 2);
    width: 20px;
    height: 20px;
    background: var(--track-color);
    border: none;
    border-radius: 50%;
    color: rgba(0, 0, 0, 0.7);
    font-size: 14px;
    font-weight: 300;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.6;
    transition: all 0.15s;
    z-index: 10;
  }
  
  .add-thumb-btn:hover {
    opacity: 1;
    transform: scale(1.1);
  }
</style>
