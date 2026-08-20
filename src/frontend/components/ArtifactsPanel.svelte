<script lang="ts">
  interface Artifact {
    id: string;
    type: 'image' | 'video' | 'audio' | 'config';
    path: string;
    thumbnail?: string;
    created_at: string;
  }
  
  export let artifacts: Artifact[] = [];
  
  function getFileIcon(type: string): string {
    switch (type) {
      case 'image': return '🖼️';
      case 'video': return '🎬';
      case 'audio': return '🎵';
      case 'config': return '⚙️';
      default: return '📄';
    }
  }
  
  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString();
  }
</script>

<div class="artifacts-panel">
  <div class="panel-header">
    <h3>Artifacts</h3>
    <span class="artifact-count">{artifacts.length}</span>
  </div>
  
  <div class="artifacts-grid">
    {#each artifacts as artifact (artifact.id)}
      <div class="artifact-card">
        <div class="artifact-icon">{getFileIcon(artifact.type)}</div>
        <div class="artifact-info">
          <div class="artifact-name">{artifact.path.split('/').pop()}</div>
          <div class="artifact-meta">{artifact.type} • {formatDate(artifact.created_at)}</div>
        </div>
        <button class="artifact-action">↓</button>
      </div>
    {/each}
    
    {#if artifacts.length === 0}
      <div class="empty-artifacts">
        <p>No artifacts generated yet</p>
        <p class="hint">Add pipes to the composer and generate frames</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .artifacts-panel {
    width: 300px;
    background: #16161e;
    border-left: 1px solid #2a2a3a;
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  
  .panel-header {
    padding: 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #2a2a3a;
  }
  
  .panel-header h3 {
    margin: 0;
    color: #fff;
    font-size: 14px;
    font-weight: 600;
  }
  
  .artifact-count {
    background: #2a2a3a;
    color: #888;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 11px;
  }
  
  .artifacts-grid {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  
  .artifact-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: #1e1e2e;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.2s;
  }
  
  .artifact-card:hover {
    background: #2a2a3a;
  }
  
  .artifact-icon {
    font-size: 20px;
  }
  
  .artifact-info {
    flex: 1;
    min-width: 0;
  }
  
  .artifact-name {
    color: #fff;
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .artifact-meta {
    color: #888;
    font-size: 10px;
    margin-top: 2px;
  }
  
  .artifact-action {
    background: none;
    border: none;
    color: #4a9eff;
    cursor: pointer;
    font-size: 16px;
    padding: 4px;
  }
  
  .artifact-action:hover {
    color: #3a8eef;
  }
  
  .empty-artifacts {
    padding: 40px 20px;
    text-align: center;
    color: #888;
  }
  
  .empty-artifacts p {
    margin: 0 0 8px;
    font-size: 13px;
  }
  
  .empty-artifacts .hint {
    font-size: 11px;
    color: #666;
  }
</style>
