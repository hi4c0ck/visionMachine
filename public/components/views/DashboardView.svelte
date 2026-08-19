<script lang="ts">
  // Dashboard View - Main landing page
  import { onMount } from 'svelte';
  
  let recentGenerations = $state([
    { id: 1, title: 'AI Generated Scene', duration: '00:15', provider: 'Agnes', status: 'completed', thumbnail: null },
    { id: 2, title: 'Motion Capture Result', duration: '00:30', provider: 'OpenAI', status: 'completed', thumbnail: null },
    { id: 3, title: 'Face Swap Test', duration: '00:10', provider: 'Agnes', status: 'pending', thumbnail: null },
  ]);
  
  let apiStatus = $state('Online');
  let gpuMemory = $state('4.2GB / 8GB');
  let queueCount = $state(2);
</script>

<div class="dashboard-view">
  <header class="view-header">
    <div>
      <h1 class="view-title">Dashboard</h1>
      <p class="view-subtitle">AI Video Generation Hub</p>
    </div>
    <div class="header-actions">
      <button class="btn btn-primary">+ New Generation</button>
      <button class="btn btn-secondary">Settings</button>
    </div>
  </header>
  
  <div class="dashboard-grid">
    <!-- Quick Actions Card -->
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">Quick Actions</h2>
      </div>
      <div class="card-body">
        <div class="action-buttons">
          <button class="action-btn">
            <span class="action-icon">▶</span>
            <span>Generate Video</span>
          </button>
          <button class="action-btn">
            <span class="action-icon">◉</span>
            <span>Capture Scene</span>
          </button>
          <button class="action-btn">
            <span class="action-icon">↑</span>
            <span>Import Assets</span>
          </button>
        </div>
      </div>
    </div>
    
    <!-- Recent Generations Card -->
    <div class="card card-large">
      <div class="card-header">
        <h2 class="card-title">Recent Generations</h2>
        <button class="btn-link">View All</button>
      </div>
      <div class="card-body">
        <div class="generation-list">
          {#each recentGenerations as gen (gen.id)}
            <div class="generation-item">
              <div class="generation-thumb">
                <span class="thumb-placeholder">▶</span>
              </div>
              <div class="generation-info">
                <h3 class="generation-title">{gen.title}</h3>
                <div class="generation-meta">
                  <span class="meta-item">⏱ {gen.duration}</span>
                  <span class="meta-item">🤖 {gen.provider}</span>
                </div>
              </div>
              <span class="status-badge status-{gen.status}">
                {gen.status}
              </span>
            </div>
          {/each}
        </div>
      </div>
    </div>
    
    <!-- System Status Card -->
    <div class="card">
      <div class="card-header">
        <h2 class="card-title">System Health</h2>
      </div>
      <div class="card-body">
        <div class="metrics-grid">
          <div class="metric-item">
            <span class="metric-label">API Status</span>
            <span class="metric-value status-online">{apiStatus}</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">GPU Memory</span>
            <span class="metric-value">{gpuMemory}</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">Queue</span>
            <span class="metric-value">
              {queueCount} pending
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .dashboard-view {
    max-width: 1200px;
    margin: 0 auto;
  }
  
  .view-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 24px;
  }
  
  .view-title {
    font-size: 24px;
    font-weight: 600;
    margin-bottom: 4px;
  }
  
  .view-subtitle {
    color: var(--text-secondary);
    font-size: 14px;
  }
  
  .header-actions {
    display: flex;
    gap: 8px;
  }
  
  .dashboard-grid {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: 16px;
  }
  
  .card {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
  }
  
  .card-header {
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .card-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
  }
  
  .card-body {
    padding: 20px;
  }
  
  .card-large {
    grid-column: span 8;
  }
  
  .action-buttons {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  
  .action-btn {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text-primary);
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
    font-size: 14px;
  }
  
  .action-btn:hover {
    background: var(--accent);
    border-color: var(--accent);
  }
  
  .action-icon {
    font-size: 18px;
  }
  
  .generation-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  
  .generation-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: var(--bg-tertiary);
    border-radius: 8px;
    transition: background 0.2s;
  }
  
  .generation-item:hover {
    background: var(--bg-primary);
  }
  
  .generation-thumb {
    width: 48px;
    height: 32px;
    background: var(--bg-primary);
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
    font-size: 12px;
  }
  
  .generation-info {
    flex: 1;
    min-width: 0;
  }
  
  .generation-title {
    font-size: 13px;
    font-weight: 500;
    margin-bottom: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .generation-meta {
    display: flex;
    gap: 12px;
    font-size: 11px;
    color: var(--text-secondary);
  }
  
  .status-badge {
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
  }
  
  .status-completed {
    background: rgba(34, 197, 94, 0.2);
    color: var(--success);
  }
  
  .status-pending {
    background: rgba(245, 158, 11, 0.2);
    color: var(--warning);
  }
  
  .status-failed {
    background: rgba(239, 68, 68, 0.2);
    color: var(--error);
  }
  
  .metrics-grid {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  
  .metric-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border);
  }
  
  .metric-item:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }
  
  .metric-label {
    font-size: 13px;
    color: var(--text-secondary);
  }
  
  .metric-value {
    font-size: 13px;
    font-weight: 500;
  }
  
  .status-online {
    color: var(--success);
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
  
  .btn-secondary {
    background: var(--bg-tertiary);
    color: var(--text-primary);
    border: 1px solid var(--border);
  }
  
  .btn-secondary:hover {
    background: var(--border);
  }
  
  .btn-link {
    background: transparent;
    border: none;
    color: var(--accent);
    font-size: 12px;
    cursor: pointer;
    padding: 0;
  }
  
  .btn-link:hover {
    text-decoration: underline;
  }
  
  @media (max-width: 900px) {
    .card-large {
      grid-column: span 12;
    }
  }
</style>
