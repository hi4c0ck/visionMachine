<script lang="ts">
  // Sidebar Component - Navigation
  interface NavItem {
    id: string;
    label: string;
    icon: string;
  }
  
  export let currentView: string;
  
  const navItems: NavItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: '▦' },
    { id: 'generations', label: 'Generations', icon: '▶' },
    { id: 'camera', label: 'Camera', icon: '◉' },
    { id: 'status', label: 'Status', icon: '◈' },
  ];
</script>

<nav class="sidebar">
  <div class="sidebar-logo">
    <div class="logo-icon">V</div>
    <span class="logo-text">VisionMachine</span>
  </div>
  
  <div class="nav-section">
    {#each navItems as item}
      <button
        class="nav-item"
        class:active={currentView === item.id}
        onclick={() => $currentView = item.id}
      >
        <span class="nav-icon">{item.icon}</span>
        <span class="nav-label">{item.label}</span>
      </button>
    {/each}
  </div>
  
  <div class="sidebar-footer">
    <button class="settings-btn">
      <span>⚙</span>
      <span>Settings</span>
    </button>
  </div>
</nav>

<style>
  .sidebar {
    width: 220px;
    background: var(--bg-secondary);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    padding: 12px 0;
  }
  
  .sidebar-logo {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 16px 20px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 12px;
  }
  
  .logo-icon {
    width: 32px;
    height: 32px;
    background: linear-gradient(135deg, var(--accent), #8b5cf6);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 16px;
  }
  
  .logo-text {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
  }
  
  .nav-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 0 8px;
  }
  
  .nav-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
  }
  
  .nav-item:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }
  
  .nav-item.active {
    background: var(--accent);
    color: white;
  }
  
  .nav-icon {
    font-size: 16px;
    width: 20px;
    text-align: center;
  }
  
  .nav-label {
    font-size: 13px;
    font-weight: 500;
  }
  
  .sidebar-footer {
    padding: 12px 8px 0;
    border-top: 1px solid var(--border);
    margin-top: 12px;
  }
  
  .settings-btn {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 10px 12px;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 13px;
    transition: all 0.2s;
  }
  
  .settings-btn:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }
</style>
