<script lang="ts">
  // Frame Ruler Component - Minimal timeline with markers every N frames
  export let totalFrames = $state(1200);
  export let markerInterval = $state(8);
  export let zoomLevel = $state(1);
  export let selectedFrame = $state(0);
  
  // Calculate visible range based on zoom
  let visibleFrames = $derived(Math.floor(totalFrames * zoomLevel));
  let actualMarkerInterval = $derived(Math.max(1, Math.floor(markerInterval / zoomLevel)));
  
  // Generate marker positions
  let markers = $derived(
    Array.from(
      { length: Math.ceil(totalFrames / actualMarkerInterval) },
      (_, i) => i * actualMarkerInterval
    )
  );
  
  // Format frame number for display
  function formatFrame(frame: number): string {
    if (frame % 100 === 0) return `${frame}`;
    if (frame % 10 === 0) return `${frame}`;
    return '';
  }
  
  // Handle marker click
  function onMarkerClick(frame: number) {
    selectedFrame = frame;
  }
  
  // Handle hover
  let hoveredFrame = $state<number | null>(null);
  let mouseX = $state(0);
  
  function onMouseMove(e: MouseEvent, frame: number) {
    hoveredFrame = frame;
    mouseX = e.clientX;
  }
  
  function onMouseLeave() {
    hoveredFrame = null;
  }
</script>

<div class="frame-ruler" style:width="{totalFrames}px">
  {/* Main ruler bar */}
  <div class="ruler-bar">
    {/* Background line */}
    <div class="ruler-line"></div>
    
    {/* Markers */}
    {#each markers as frame (frame)}
      <div 
        class="marker"
        class:major={frame % 100 === 0}
        class:selected={selectedFrame === frame}
        onmouseenter={(e) => onMouseMove(e, frame)}
        onmouseleave={onMouseLeave}
        onclick={() => onMarkerClick(frame)}
      >
        {/* Marker tick */}
        <div class="tick" class:minor={!major}></div>
        
        {/* Label for major markers */}
        {#if frame % 100 === 0 && frame > 0}
          <span class="label">{frame}</span>
        {/if}
      </div>
    {/each}
    
    {/* Current position indicator */}
    <div class="playhead" style:left="{selectedFrame}px">
      <div class="playhead-tip"></div>
      <div class="playhead-line"></div>
    </div>
  </div>
  
  {/* Hover tooltip */}
  {#if hoveredFrame !== null}
    <div class="tooltip" style:left="{hoveredFrame}px">
      <span>Frame {hoveredFrame}</span>
    </div>
  {/if}
</div>

<style>
  .frame-ruler {
    position: relative;
    height: 12px;
    background: #1a1a1a;
    border-top: 1px solid #2a2a2a;
    cursor: pointer;
    user-select: none;
    overflow: hidden;
  }
  
  .ruler-bar {
    position: relative;
    height: 100%;
    display: flex;
    align-items: flex-end;
  }
  
  .ruler-line {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: #3a3a3a;
  }
  
  .marker {
    position: absolute;
    bottom: 0;
    height: 100%;
    cursor: pointer;
    transition: all 0.1s;
  }
  
  .marker:hover {
    background: rgba(99, 102, 241, 0.1);
  }
  
  .marker.selected {
    background: rgba(99, 102, 241, 0.2);
  }
  
  .tick {
    position: absolute;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 1px;
    height: 4px;
    background: #4a4a4a;
    transition: all 0.1s;
  }
  
  .marker.major .tick {
    height: 6px;
    width: 1px;
    background: #6a6a6a;
  }
  
  .marker:hover .tick {
    background: #6366f1;
    height: 8px;
  }
  
  .marker.selected .tick {
    background: #6366f1;
    height: 8px;
  }
  
  .label {
    position: absolute;
    bottom: 8px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 8px;
    color: #6a6a6a;
    white-space: nowrap;
    pointer-events: none;
  }
  
  .playhead {
    position: absolute;
    top: 0;
    width: 1px;
    height: 100%;
    pointer-events: none;
  }
  
  .playhead-tip {
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    border-left: 3px solid transparent;
    border-right: 3px solid transparent;
    border-top: 4px solid #6366f1;
  }
  
  .playhead-line {
    position: absolute;
    top: 4px;
    left: 50%;
    transform: translateX(-50%);
    width: 1px;
    height: calc(100% - 4px);
    background: #6366f1;
    opacity: 0.5;
  }
  
  .tooltip {
    position: absolute;
    top: -24px;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.8);
    color: #fff;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 10px;
    pointer-events: none;
    white-space: nowrap;
    z-index: 100;
  }
  
  .tooltip::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 3px solid transparent;
    border-top-color: rgba(0, 0, 0, 0.8);
  }
</style>
