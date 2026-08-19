<script lang="ts">
  // Generations View - List and manage AI generations
  import { searchable } from 'svelte/reactivity';
  
  let searchQuery = searchable('');
  let statusFilter = $state('all');
  let providerFilter = $state('all');
  
  let generations = $state([
    { id: 1, title: 'Cyberpunk City at Night', provider: 'Agnes', status: 'completed', duration: '00:15', createdAt: '2024-01-15', prompt: 'A cyberpunk city at night with neon lights' },
    { id: 2, title: 'Ocean Waves timelapse', provider: 'OpenAI', status: 'completed', duration: '00:30', createdAt: '2024-01-14', prompt: 'Ocean waves crashing on rocks' },
    { id: 3, title: 'Abstract Motion Graphics', provider: 'Agnes', status: 'in_progress', duration: '00:20', createdAt: '2024-01-14', prompt: 'Abstract geometric patterns moving' },
    { id: 4, title: 'Portrait Animation', provider: 'Agnes', status: 'pending', duration: '00:10', createdAt: '2024-01-13', prompt: 'Portrait coming to life' },
    { id: 5, title: 'Forest Walkthrough', provider: 'OpenAI', status: 'failed', duration: '00:25', createdAt: '2024-01-13', prompt: 'Walking through a forest' },
  ]);
  
  function getFilteredGenerations() {
    return generations.filter(gen => {
      const matchesSearch = gen.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           gen.prompt.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || gen.status === statusFilter;
      const matchesProvider = providerFilter === 'all' || gen.provider === providerFilter;
      return matchesSearch && matchesStatus && matchesProvider;
    });
  }
  
  async function deleteGeneration(id: number) {
    generations = generations.filter(g => g.id !== id);
  }
</script>

<div class="generations-view">
  <header class="view-header">
    <h1 class="view-title">Generations</h1>
    <button class="btn btn-primary">+ Create New</button>
  </header>
  
  <div class="toolbar">
    <div class="search-box">
      <span class="search-icon">🔍</span>
      <input 
        type="text" 
        placeholder="Search generations..." 
        bind:value={searchQuery}
      />
    </div>
    
    <div class="filters">
      <select bind:value={statusFilter}>
        <option value="all">All Status</option>
        <option value="completed">Completed</option>
        <option value="in_progress">In Progress</option>
        <option value="pending">Pending</option>
        <option value="failed">Failed</option>
      </select>
      
      <select bind:value={providerFilter}>
        <option value="all">All Providers</option>
        <option value="Agnes">Agnes</option>
        <option value="OpenAI">OpenAI</option>
      </select>
    </div>
    
    <button class="btn btn-outline">Export All</button>
  </div>
  
  <div class="generation-grid">
    {#if getFilteredGenerations().length === 0}
      <div class="empty-state">
        <span class="empty-icon">🎬</span>
        <p>No generations found</p>
        <button class="btn btn-primary">Create First Video</button>
      </div>
    {:else}
      {#each getFilteredGenerations() as gen (gen.id)}
        <div class="generation-card">
          <div class="card-thumbnail">
            <span class="play-overlay">▶</span>
          </div>
          <div class="card-content">
            <h3 class="card-title">{gen.title}</h3>
            <p class="card-prompt">{gen.prompt}</p>
            <div class="card-meta">
              <span class="meta-item">⏱ {gen.duration}</span>
              <span class="meta-item">🤖 {gen.provider}</span>
              <span class="meta-item">📅 {gen.createdAt}</span>
            </div>
          </div>
          <div class="card-actions">
            <span class="status-badge status-{gen.status}">{gen.status}</span>
            <button class="icon-btn" onclick={() => deleteGeneration(gen.id)}>🗑</button>
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .generations-view {
    max-width: 1200px;
    margin: 0 auto;
  }
  
  .view-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
  }
  
  .view-title {
    font-size: 24px;
    font-weight: 600;
  }
  
  .toolbar {
    display: flex;
    gap: 12px;
    margin-bottom: 20px;
    align-items: center;
  }
  
  .search-box {
    flex: 1;
    position: relative;
    display: flex;
    align-items: center;
  }
  
  .search-icon {
    position: absolute;
    left: 12px;
    color: var(--text-secondary);
  }
  
  .search-box input {
    width: 100%;
    padding: 10px 12px 10px 36px;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text-primary);
    font-size: 14px;
  }
  
  .search-box input:focus {
    outline: none;
    border-color: var(--accent);
  }
  
  .filters {
    display: flex;
    gap: 8px;
  }
  
  .filters select {
    padding: 10px 12px;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text-primary);
    font-size: 13px;
    cursor: pointer;
  }
  
  .generation-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 16px;
  }
  
  .generation-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    transition: transform 0.2s, box-shadow 0.2s;
  }
  
  .generation-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0,0,0,0.3);
  }
  
  .card-thumbnail {
    height: 160px;
    background: var(--bg-tertiary);
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }
  
  .play-overlay {
    width: 48px;
    height: 48px;
    background: rgba(0,0,0,0.6);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 16px;
    cursor: pointer;
    transition: background 0.2s;
  }
  
  .play-overlay:hover {
    background: var(--accent);
  }
  
  .card-content {
    padding: 16px;
  }
  
  .card-title {
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .card-prompt {
    font-size: 12px;
    color: var(--text-secondary);
    margin-bottom: 12px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  
  .card-meta {
    display: flex;
    gap: 12px;
    font-size: 11px;
    color: var(--text-secondary);
  }
  
  .card-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-top: 1px solid var(--border);
  }
  
  .icon-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 14px;
    opacity: 0.6;
    transition: opacity 0.2s;
  }
  
  .icon-btn:hover {
    opacity: 1;
  }
  
  .empty-state {
    grid-column: 1 / -1;
    text-align: center;
    padding: 60px 20px;
    color: var(--text-secondary);
  }
  
  .empty-icon {
    font-size: 48px;
    display: block;
    margin-bottom: 16px;
  }
  
  .btn {
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }
  
  .btn-primary {
    background: var(--accent);
    color: white;
  }
  
  .btn-primary:hover {
    background: var(--accent-hover);
  }
  
  .btn-outline {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-primary);
  }
  
  .btn-outline:hover {
    background: var(--bg-tertiary);
  }
  
  .status-badge {
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
  }
  
  .status-completed { background: rgba(34, 197, 94, 0.2); color: var(--success); }
  .status-in_progress { background: rgba(245, 158, 11, 0.2); color: var(--warning); }
  .status-pending { background: rgba(99, 102, 241, 0.2); color: var(--accent); }
  .status-failed { background: rgba(239, 68, 68, 0.2); color: var(--error); }
</style>
