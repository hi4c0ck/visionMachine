<script lang="ts">
  // Multi-thumb slider — CSS-Tricks technique (two stacked native inputs)
  export let values = $state([30, 70]);
  export let min = $state(0);
  export let max = $state(100);
  export let step = $state(1);
  export let label = $state('');
  export let trackColor = $state('#58a6ff');
  export let showLabels = $state(true);
  
  function getPercentage(value: number): number {
    return ((value - min) / (max - min)) * 100;
  }
  
  function onInput(e: Event, thumbId: 'a' | 'b') {
    const t = e.target as HTMLInputElement;
    const v = parseFloat(t.value);
    if (thumbId === 'a') values = [v, values[1]];
    else values = [values[0], v];
  }
  
  function getFillStyle(): { left: string; width: string } {
    const a = getPercentage(values[0]);
    const b = getPercentage(values[1]);
    if (a <= b) return { left: `${a}%`, width: `${b - a}%` };
    else return { left: `${b}%`, width: `${a - b}%` };
  }
</script>

<div class="custom-slider" style={`--track-color: ${trackColor}; --min: ${min}; --max: ${max}`}>
  
  {#if label}
    <div class="slider-label">{label}</div>
  {/if}
  
  <div class="slider-wrapper">
    <div class="track-container">
      <div class="track-bg"></div>
      <div class="track-fill" style={`left: ${getFillStyle().left}; width: ${getFillStyle().width}`}></div>
    </div>
    
    <div class="inputs-stack">
      <div class="input-layer input-a">
        <input type="range" id="thumb-a" min="{min}" max="{max}" step="{step}" 
               value="{values[0]}" oninput={(e) => onInput(e, 'a')} class="range-input" />
        {#if showLabels}
          <div class="thumb-label thumb-label-a" style={`left: ${getPercentage(values[0])}%`}>
            {Math.round(values[0])}
          </div>
        {/if}
      </div>
      
      <div class="input-layer input-b">
        <input type="range" id="thumb-b" min="{min}" max="{max}" step="{step}" 
               value="{values[1]}" oninput={(e) => onInput(e, 'b')} class="range-input" />
        {#if showLabels}
          <div class="thumb-label thumb-label-b" style={`left: ${getPercentage(values[1])}%`}>
            {Math.round(values[1])}
          </div>
        {/if}
      </div>
    </div>
    
    <div class="value-badges">
      <span class="badge badge-a"><span class="dot dot-a"></span>{Math.round(values[0])}</span>
      <span class="badge badge-b"><span class="dot dot-b"></span>{Math.round(values[1])}</span>
    </div>
  </div>
</div>

<style>
  .custom-slider {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 0;
    width: 100%;
  }
  
  .slider-label {
    font-size: 10px;
    font-weight: 600;
    color: #6e7681;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    padding-left: 4px;
  }
  
  .slider-wrapper {
    position: relative;
    padding: 20px 0 24px;
  }
  
  .track-container {
    position: relative;
    height: 4px;
    margin: 18px 0;
  }
  
  .track-bg {
    position: absolute;
    inset: 0;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
  }
  
  .track-fill {
    position: absolute;
    height: 100%;
    background: var(--track-color);
    border-radius: 2px;
    opacity: 0.8;
    transition: left 0.06s ease-out, width 0.06s ease-out;
  }
  
  .inputs-stack {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  
  .input-layer {
    position: relative;
    width: 100%;
    height: 20px;
    display: flex;
    align-items: center;
  }
  
  .range-input {
    position: absolute;
    width: 100%;
    height: 4px;
    -webkit-appearance: none;
    appearance: none;
    background: transparent;
    cursor: pointer;
    z-index: 10;
    margin: 0;
  }
  
  .range-input::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--track-color);
    border: 2px solid rgba(0,0,0,0.3);
    box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    cursor: grab;
    transition: transform 0.1s, box-shadow 0.15s;
  }
  
  .range-input::-webkit-slider-thumb:active {
    cursor: grabbing;
    transform: scale(1.15);
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  }
  
  .range-input::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--track-color);
    border: 2px solid rgba(0,0,0,0.3);
    box-shadow: 0 2px 6px rgba(0,0,0,0.4);
    cursor: grab;
    transition: transform 0.1s, box-shadow 0.15s;
  }
  
  .range-input::-moz-range-thumb:active {
    cursor: grabbing;
    transform: scale(1.15);
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  }
  
  .range-input:focus { outline: none; }
  
  .range-input:focus-visible::-webkit-slider-thumb {
    box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.4), 0 2px 6px rgba(0,0,0,0.4);
  }
  
  .range-input:focus-visible::-moz-range-thumb {
    box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.4), 0 2px 6px rgba(0,0,0,0.4);
  }
  
  .input-a .range-input::-webkit-slider-thumb { background: #58a6ff; }
  .input-a .range-input::-moz-range-thumb { background: #58a6ff; }
  
  .input-b .range-input::-webkit-slider-thumb { background: #3fb950; }
  .input-b .range-input::-moz-range-thumb { background: #3fb950; }
  
  .thumb-label {
    position: absolute;
    top: -24px;
    transform: translateX(-50%);
    font-size: 10px;
    font-weight: 600;
    color: #8b949e;
    pointer-events: none;
    white-space: nowrap;
    transition: left 0.06s ease-out;
  }
  
  .thumb-label-a { color: #58a6ff; }
  .thumb-label-b { color: #3fb950; }
  
  .value-badges {
    display: flex;
    justify-content: space-between;
    padding: 0 2px;
    margin-top: 8px;
  }
  
  .badge {
    font-size: 11px;
    font-weight: 600;
    color: #8b949e;
    display: flex;
    align-items: center;
    gap: 5px;
  }
  
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  
  .dot-a { background: #58a6ff; }
  .dot-b { background: #3fb950; }
</style>
