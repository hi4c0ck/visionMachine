<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  
  interface Pipe {
    id: string;
    name: string;
    order: number;
    status: 'idle' | 'generating' | 'completed' | 'error';
  }
  
  export let pipes: Pipe[] = [];
  export let sessionId: string;
  
  let isGenerating = false;
  
  async function generateFrame(pipeId: string) {
    isGenerating = true;
    
    try {
      // This would call the actual generation API
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Update pipe status
      pipes = pipes.map(p => 
        p.id === pipeId ? { ...p, status: 'completed' } : p
      );
    } catch (error) {
      pipes = pipes.map(p => 
        p.id === pipeId ? { ...p, status: 'error' } : p
      );
    } finally {
      isGenerating = false;
    }
  }
  
  async function addPipe() {
    const newPipe: Pipe = {
      id: crypto.randomUUID(),
      name: `Pipe ${pipes.length + 1}`,
      order: pipes.length,
      status: 'idle'
    };
    pipes = [...pipes, newPipe];
  }
  
  function removePipe(pipeId: string) {
    pipes = pipes.filter(p => p.id !== pipeId);
  }
</script>

<div class="composer">
  <div class="composer-header">
    <h2>Composer</h2>
    <div class="composer-actions">
      <button class="action-btn" on:click={addPipe}>+ Add Pipe</button>
      <button class="action-btn generate" on:click={() => pipes.forEach(p => generateFrame(p.id))} disabled={isGenerating || pipes.length === 0}>
        {isGenerating ? 'Generating...' : 'Generate All'}
      </button>
    </div>
  </div>
  
  <div class="pipes-container">
    {#each pipes as pipe (pipe.id)}
      <div class="pipe-card {pipe.status}">
        <div class="pipe-header">
          <span class="pipe-name">{pipe.name}</span>
          <span class="pipe-status">
            {#if pipe.status === 'idle'}⏳ Idle
            {:else if pipe.status === 'generating'}🔄 Generating
            {:else if pipe.status === 'completed'}✅ Done
            {:else}❌ Error
            {/if}
          </span>
          <button class="remove-btn" on:click={() => removePipe(pipe.id)}>×</button>
        </div>
        
        <div class="pipe-config">
          <div class="config-row">
            <label>Model:</label>
            <select>
              <option>stable-video-diffusion</option>
              <option>animatediff</option>
            </select>
          </div>
          <div class="config-row">
            <label>Steps:</label>
            <input type="number" value="30" min="1" max="100" />
          </div>
          <div class="config-row">
            <label>Cfg Scale:</label>
            <input type="number" value="7.5" step="0.5" min="1" max="30" />
          </div>
        </div>
        
        <button 
          class="generate-btn"
          on:click={() => generateFrame(pipe.id)}
          disabled={isGenerating || pipe.status === 'generating'}
        >
          {pipe.status === 'generating' ? 'Generating...' : 'Generate Frame'}
        </button>
      </div>
    {/each}
    
    {#if pipes.length === 0}
      <div class="empty-composer">
        <p>No pipes configured</p>
        <button class="action-btn" on:click={addPipe}>+ Add First Pipe</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .composer {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 20px;
    overflow-y: auto;
  }
  
  .composer-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }
  
  .composer-header h2 {
    margin: 0;
    color: #fff;
    font-size: 20px;
  }
  
  .composer-actions {
    display: flex;
    gap: 10px;
  }
  
  .action-btn {
    padding: 8px 16px;
    background: #2a2a3a;
    color: #fff;
    border: 1px solid #3a3a4a;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.2s;
  }
  
  .action-btn:hover:not(:disabled) {
    background: #3a3a4a;
  }
  
  .action-btn.generate {
    background: #4a9eff;
    border-color: #4a9eff;
  }
  
  .action-btn.generate:hover:not(:disabled) {
    background: #3a8eef;
  }
  
  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .pipes-container {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  
  .pipe-card {
    background: #1e1e2e;
    border: 1px solid #2a2a3a;
    border-radius: 12px;
    padding: 16px;
    position: relative;
  }
  
  .pipe-card.generating {
    border-color: #4a9eff;
  }
  
  .pipe-card.completed {
    border-color: #4ade80;
  }
  
  .pipe-card.error {
    border-color: #ef4444;
  }
  
  .pipe-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }
  
  .pipe-name {
    flex: 1;
    color: #fff;
    font-weight: 500;
    font-size: 14px;
  }
  
  .pipe-status {
    font-size: 12px;
    padding: 4px 8px;
    background: #2a2a3a;
    border-radius: 4px;
    color: #888;
  }
  
  .pipe-card.generating .pipe-status {
    background: #4a9eff20;
    color: #4a9eff;
  }
  
  .pipe-card.completed .pipe-status {
    background: #4ade8020;
    color: #4ade80;
  }
  
  .pipe-card.error .pipe-status {
    background: #ef444420;
    color: #ef4444;
  }
  
  .remove-btn {
    background: none;
    border: none;
    color: #888;
    cursor: pointer;
    font-size: 18px;
    padding: 4px 8px;
  }
  
  .remove-btn:hover {
    color: #ef4444;
  }
  
  .pipe-config {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 12px;
  }
  
  .config-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  
  .config-row label {
    color: #888;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  
  .config-row select,
  .config-row input {
    background: #2a2a3a;
    border: 1px solid #3a3a4a;
    color: #fff;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 13px;
  }
  
  .generate-btn {
    width: 100%;
    padding: 10px;
    background: #4a9eff;
    color: #fff;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    transition: background 0.2s;
  }
  
  .generate-btn:hover:not(:disabled) {
    background: #3a8eef;
  }
  
  .generate-btn:disabled {
    background: #2a2a3a;
    color: #888;
    cursor: not-allowed;
  }
  
  .empty-composer {
    text-align: center;
    padding: 60px 20px;
    color: #888;
  }
  
  .empty-composer p {
    margin: 0 0 20px;
  }
</style>
