<script lang="ts">
  // Artifacts Panel Component - Right side panel
  import { createEventDispatcher } from 'svelte';
  
  const dispatch = createEventDispatcher();
  
  export let collapsed = $state(false);
  
  let activeTab = $state('output');
  
  let recentOutputs = $state([
    { id: 1, title: 'Cyberpunk Night Scene', duration: '00:15', provider: 'Agnes', status: 'completed', createdAt: '2 hours ago' },
    { id: 2, title: 'Wave Animation', duration: '00:30', provider: 'OpenAI', status: 'completed', createdAt: '1 day ago' },
    { id: 3, title: 'Face Swap Test', duration: '00:10', provider: 'Agnes', status: 'failed', createdAt: '2 days ago' },
  ]);
  
  let sessions = $state([
    { id: 1, name: 'Morning Session', itemsCount: 12, totalDuration: '45m', createdAt: 'Today' },
    { id: 2, name: 'Afternoon Test', itemsCount: 8, totalDuration: '32m', createdAt: 'Yesterday' },
  ]);
  
  let historyItems = $state([
    { id: 1, type: 'video', title: 'Generated Video', provider: 'Agnes', status: 'completed' },
    { id: 2, type: 'image', title: 'Keyframe Extracted', provider: 'Internal', status: 'completed' },
    { id: 3, type: 'audio', title: 'Audio Generated', provider: 'Agnes', status: 'pending' },
  ]);
  
  function switchTab(tab: string) {
    activeTab = tab;
  }
</script>

<div class="artifacts-panel" class:collapsed>
  <PanelHeader>
    <PanelTitle text="Artifacts"/>
    <PanelActions>
      <Button icon="↻" size="sm" tooltip="Refresh" onclick={() => dispatch('refresh')}/>
      <Button icon="‹" size="sm" tooltip="Collapse" onclick={() => collapsed = !collapsed}/>
    </PanelActions>
  </PanelHeader>
  
  <TabGroup bind:activeTab>
    <Tab label="Output" value="output"/>
    <Tab label="Sessions" value="sessions"/>
    <Tab label="History" value="history"/>
  </TabGroup>
  
  <TabContent>
    <!-- Output Tab -->
    {#if activeTab === 'output'}
      <OutputPanel>
        <GenerationStats>
          <StatCard label="Total" value="24"/>
          <StatCard label="Completed" value="22" color="green"/>
          <StatCard label="Failed" value="2" color="red"/>
          <StatCard label="Pending" value="1" color="yellow"/>
        </GenerationStats>
        
        <RecentOutputs list={recentOutputs}>
          {#each recentOutputs as output (output.id)}
            <OutputItem bind:output>
              <OutputThumbnail/>
              <OutputInfo>
                <OutputTitle text="{{output.title}}"/>
                <OutputMeta duration="{{output.duration}}" provider="{{output.provider}}" time="{{output.createdAt}}"/>
              </OutputInfo>
              <StatusBadge status="{{output.status}}"/>
            </OutputItem>
          {/each}
        </RecentOutputs>
      </OutputPanel>
      
    {:else if activeTab === 'sessions'}
      <SessionsPanel>
        {#each sessions as session (session.id)}
          <SessionCard bind:session>
            <SessionHeader>
              <SessionName text="{{session.name}}"/>
              <SessionDate text="{{session.createdAt}}"/>
            </SessionHeader>
            <SessionDetails>
              <DetailItem label="Items" value="{{session.itemsCount}}"/>
              <DetailItem label="Duration" value="{{session.totalDuration}}"/>
            </SessionDetails>
            <SessionActions>
              <Button icon="📂" size="sm" label="Open"/>
              <Button icon="🗑" size="sm" danger label="Delete"/>
            </SessionActions>
          </SessionCard>
        {/each}
      </SessionsPanel>
      
    {:else if activeTab === 'history'}
      <HistoryPanel>
        {#each historyItems as item (item.id)}
          <HistoryItem bind:item>
            <HistoryIcon icon="{{item.type}}"/>
            <HistoryContent>
              <HistoryTitle text="{{item.title}}"/>
              <HistoryMeta provider="{{item.provider}}" status="{{item.status}}"/>
            </HistoryContent>
            <HistoryActions>
              <Button icon="⬇" size="sm"/>
              <Button icon="🗑" size="sm"/>
            </HistoryActions>
          </HistoryItem>
        {/each}
      </HistoryPanel>
    {/if}
  </TabContent>
  
  <PanelFooter>
    <Button variant="outline" label="View All Artifacts" block/>
  </PanelFooter>
</div>

<style>
  .artifacts-panel {
    width: 320px;
    background: var(--color-bg-secondary);
    border-left: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    transition: width 0.2s;
    overflow: hidden;
  }
  
  .artifacts-panel.collapsed {
    width: 40px;
  }
  
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px;
    border-bottom: 1px solid var(--color-border);
  }
  
  .panel-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-primary);
  }
  
  .panel-actions {
    display: flex;
    gap: 4px;
  }
  
  .tab-group {
    display: flex;
    border-bottom: 1px solid var(--color-border);
  }
  
  .tab {
    flex: 1;
    padding: 8px;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--color-text-secondary);
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }
  
  .tab:hover {
    color: var(--color-text-primary);
    background: var(--color-bg-hover);
  }
  
  .tab.active {
    color: var(--color-accent);
    border-bottom-color: var(--color-accent);
  }
  
  .tab-content {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
  }
  
  .generation-stats {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    margin-bottom: 16px;
  }
  
  .stat-card {
    padding: 10px;
    background: var(--color-bg-tertiary);
    border-radius: 6px;
    text-align: center;
  }
  
  .stat-value {
    font-size: 20px;
    font-weight: 600;
    color: var(--color-text-primary);
  }
  
  .stat-label {
    font-size: 10px;
    color: var(--color-text-muted);
    text-transform: uppercase;
  }
  
  .output-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    background: var(--color-bg-tertiary);
    border-radius: 6px;
    margin-bottom: 8px;
    cursor: pointer;
    transition: background 0.15s;
  }
  
  .output-item:hover {
    background: var(--color-bg-hover);
  }
  
  .output-thumbnail {
    width: 48px;
    height: 32px;
    background: var(--color-bg-primary);
    border-radius: 4px;
    flex-shrink: 0;
  }
  
  .output-info {
    flex: 1;
    min-width: 0;
  }
  
  .output-title {
    font-size: 11px;
    font-weight: 500;
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .output-meta {
    font-size: 10px;
    color: var(--color-text-muted);
    display: flex;
    gap: 8px;
    margin-top: 2px;
  }
  
  .session-card {
    padding: 10px;
    background: var(--color-bg-tertiary);
    border-radius: 6px;
    margin-bottom: 8px;
  }
  
  .session-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }
  
  .session-name {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-text-primary);
  }
  
  .session-date {
    font-size: 10px;
    color: var(--color-text-muted);
  }
  
  .session-details {
    display: flex;
    gap: 12px;
    margin-bottom: 8px;
  }
  
  .detail-item {
    font-size: 10px;
    color: var(--color-text-secondary);
  }
  
  .detail-value {
    font-weight: 500;
    color: var(--color-text-primary);
  }
  
  .session-actions {
    display: flex;
    gap: 4px;
  }
  
  .history-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    background: var(--color-bg-tertiary);
    border-radius: 6px;
    margin-bottom: 6px;
  }
  
  .history-icon {
    font-size: 16px;
  }
  
  .history-content {
    flex: 1;
    min-width: 0;
  }
  
  .history-title {
    font-size: 11px;
    font-weight: 500;
    color: var(--color-text-primary);
  }
  
  .history-meta {
    display: flex;
    gap: 6px;
    margin-top: 2px;
  }
  
  .meta-chip {
    font-size: 9px;
    padding: 1px 4px;
    background: var(--color-bg-hover);
    border-radius: 2px;
    color: var(--color-text-muted);
  }
  
  .history-actions {
    display: flex;
    gap: 4px;
  }
  
  .panel-footer {
    padding: 12px;
    border-top: 1px solid var(--color-border);
  }
  
  .status-badge {
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 9px;
    font-weight: 500;
    text-transform: uppercase;
  }
  
  .status-completed { background: rgba(34, 197, 94, 0.2); color: var(--color-success); }
  .status-failed { background: rgba(239, 68, 68, 0.2); color: var(--color-error); }
  .status-pending { background: rgba(245, 158, 11, 0.2); color: var(--color-warning); }
  
  .btn {
    padding: 4px 8px;
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    color: var(--color-text-secondary);
    font-size: 10px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
    transition: all 0.15s;
  }
  
  .btn:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }
  
  .btn.danger:hover {
    background: rgba(239, 68, 68, 0.1);
    border-color: var(--color-error);
    color: var(--color-error);
  }
  
  .btn.sm {
    padding: 2px 6px;
    font-size: 9px;
  }
  
  .btn-outline {
    width: 100%;
    justify-content: center;
  }
</style>
