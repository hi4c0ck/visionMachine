<script lang="ts">
  // Status View - System health and provider status
  let activeTab = $state('providers');
  
  let providers = $state([
    {
      id: 'agnes',
      name: 'Agnes',
      icon: '🤖',
      connection: 'connected',
      latency: 120,
      usage: { tokens: 15420, cost: '$0.45', remaining: 85 }
    },
    {
      id: 'openai',
      name: 'OpenAI',
      icon: '🧠',
      connection: 'disconnected',
      latency: 0,
      usage: { tokens: 0, cost: '$0.00', remaining: 0 }
    }
  ]);
  
  let queueItems = $state([
    { id: 1, name: 'Scene Generation #42', priority: 'high', progress: 75, eta: '2m' },
    { id: 2, name: 'Face Swap Test', priority: 'medium', progress: 30, eta: '5m' },
    { id: 3, name: 'Style Transfer', priority: 'low', progress: 0, eta: '8m' },
  ]);
</script>

<div class="status-view">
  <header class="view-header">
    <h1 class="view-title">Status</h1>
  </header>
  
  <div class="tab-group">
    <button 
      class="tab-btn" 
      class:active={activeTab === 'providers'}
      onclick={() => activeTab = 'providers'}
    >
      Providers
    </button>
    <button 
      class="tab-btn" 
      class:active={activeTab === 'queue'}
      onclick={() => activeTab = 'queue'}
    >
      Queue
    </button>
    <button 
      class="tab-btn" 
      class:active={activeTab === 'logs'}
      onclick={() => activeTab = 'logs'}
    >
      Logs
    </button>
  </div>
  
  <div class="tab-content">
    {#if activeTab === 'providers'}
      <div class="providers-panel">
        {#each providers as provider (provider.id)}
          <div class="provider-card">
            <div class="provider-header">
              <span class="provider-icon">{provider.icon}</span>
              <span class="provider-name">{provider.name}</span>
              <span class="connection-status status-{provider.connection}">
                {provider.connection}
              </span>
            </div>
            
            <div class="provider-metrics">
              <div class="metric">
                <span class="metric-label">Response Time</span>
                <span class="metric-value">{provider.latency}ms</span>
              </div>
              <div class="metric">
                <span class="metric-label">Tokens Used</span>
                <span class="metric-value">{provider.usage.tokens.toLocaleString()}</span>
              </div>
              <div class="metric">
                <span class="metric-label">Cost Today</span>
                <span class="metric-value">{provider.usage.cost}</span>
              </div>
              <div class="metric">
                <span class="metric-label">Rate Limit</span>
                <span class="metric-value">{provider.usage.remaining}%</span>
              </div>
            </div>
            
            <div class="provider-actions">
              <button class="btn btn-secondary">Configure</button>
              <button class="btn btn-primary">Test Connection</button>
            </div>
          </div>
        {/each}
      </div>
      
    {:else if activeTab === 'queue'}
      <div class="queue-panel">
        <div class="queue-list">
          {#each queueItems as item (item.id)}
            <div class="queue-item">
              <div class="queue-item-header">
                <span class="priority-badge priority-{item.priority}">{item.priority}</span>
                <span class="queue-name">{item.name}</span>
              </div>
              
              <div class="progress-section">
                <progress value={item.progress} max="100"></progress>
                <span class="progress-text">{item.progress}%</span>
              </div>
              
              <div class="queue-footer">
                <span class="eta">ETA: {item.eta}</span>
              </div>
            </div>
          {/each}
        </div>
      </div>
      
    {:else if activeTab === 'logs'}
      <div class="logs-panel">
        <div class="log-entry"><span class="log-time">14:32:01</span> <span class="log-level info">INFO</span> Application started</div>
        <div class="log-entry"><span class="log-time">14:32:05</span> <span class="log-level success">OK</span> Connected to Agnes API</div>
        <div class="log-entry"><span class="log-time">14:32:10</span> <span class="log-level warning">WARN</span> OpenAI API key missing</div>
        <div class="log-entry"><span class="log-time">14:33:15</span> <span class="log-level info">INFO</span> Generation #42 started</div>
        <div class="log-entry"><span class="log-time">14:35:22</span> <span class="log-level error">ERR</span> Failed to connect to external camera</div>
      </div>
    {/if}
  </div>
</div>

<style>
  .status-view {
    max-width: 900px;
    margin: 0 auto;
  }
  
  .view-header {
    margin-bottom: 20px;
  }
  
  .view-title {
    font-size: 24px;
    font-weight: 600;
  }
  
  .tab-group {
    display: flex;
    gap: 4px;
    background: var(--bg-secondary);
    padding: 4px;
    border-radius: 8px;
    margin-bottom: 20px;
    width: fit-content;
  }
  
  .tab-btn {
    padding: 8px 16px;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .tab-btn:hover {
    color: var(--text-primary);
  }
  
  .tab-btn.active {
    background: var(--accent);
    color: white;
  }
  
  .tab-content {
    min-height: 400px;
  }
  
  .providers-panel {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  
  .provider-card {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 20px;
  }
  
  .provider-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }
  
  .provider-icon {
    font-size: 24px;
  }
  
  .provider-name {
    font-size: 16px;
    font-weight: 600;
    flex: 1;
  }
  
  .connection-status {
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
  }
  
  .status-connected {
    background: rgba(34, 197, 94, 0.2);
    color: var(--success);
  }
  
  .status-disconnected {
    background: rgba(239, 68, 68, 0.2);
    color: var(--error);
  }
  
  .provider-metrics {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    margin-bottom: 16px;
  }
  
  .metric {
    display: flex;
    justify-content: space-between;
    padding: 12px;
    background: var(--bg-tertiary);
    border-radius: 8px;
  }
  
  .metric-label {
    font-size: 12px;
    color: var(--text-secondary);
  }
  
  .metric-value {
    font-size: 13px;
    font-weight: 500;
  }
  
  .provider-actions {
    display: flex;
    gap: 8px;
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
    border: 1px solid var(--border);
    color: var(--text-primary);
  }
  
  .btn-secondary:hover {
    background: var(--border);
  }
  
  .queue-panel {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 20px;
  }
  
  .queue-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  
  .queue-item {
    padding: 16px;
    background: var(--bg-tertiary);
    border-radius: 8px;
  }
  
  .queue-item-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }
  
  .priority-badge {
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
  }
  
  .priority-high { background: rgba(239, 68, 68, 0.2); color: var(--error); }
  .priority-medium { background: rgba(245, 158, 11, 0.2); color: var(--warning); }
  .priority-low { background: rgba(99, 102, 241, 0.2); color: var(--accent); }
  
  .queue-name {
    font-size: 14px;
    font-weight: 500;
  }
  
  .progress-section {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
  }
  
  progress {
    flex: 1;
    height: 6px;
    appearance: none;
    background: var(--bg-primary);
    border-radius: 3px;
  }
  
  progress::-webkit-progress-bar {
    background: var(--bg-primary);
    border-radius: 3px;
  }
  
  progress::-webkit-progress-value {
    background: var(--accent);
    border-radius: 3px;
  }
  
  .progress-text {
    font-size: 12px;
    color: var(--text-secondary);
    min-width: 40px;
    text-align: right;
  }
  
  .queue-footer {
    display: flex;
    justify-content: flex-end;
  }
  
  .eta {
    font-size: 11px;
    color: var(--text-secondary);
  }
  
  .logs-panel {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 16px;
    font-family: monospace;
    font-size: 12px;
    max-height: 400px;
    overflow-y: auto;
  }
  
  .log-entry {
    padding: 6px 0;
    border-bottom: 1px solid var(--border);
    display: flex;
    gap: 12px;
  }
  
  .log-entry:last-child {
    border-bottom: none;
  }
  
  .log-time {
    color: var(--text-secondary);
  }
  
  .log-level {
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: 600;
  }
  
  .log-level.info { background: rgba(99, 102, 241, 0.2); color: var(--accent); }
  .log-level.success { background: rgba(34, 197, 94, 0.2); color: var(--success); }
  .log-level.warning { background: rgba(245, 158, 11, 0.2); color: var(--warning); }
  .log-level.error { background: rgba(239, 68, 68, 0.2); color: var(--error); }
</style>
