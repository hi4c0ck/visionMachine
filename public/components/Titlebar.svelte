<script lang="ts">
  // Titlebar Component - Custom Tauri window controls
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { emit } from '@tauri-apps/api/event';
  
  let showProfileMenu = $state(false);
  
  async function minimize() {
    await getCurrentWindow().minimize();
  }
  
  async function maximize() {
    const win = getCurrentWindow();
    const isMaximized = await win.isMaximized();
    if (isMaximized) {
      await win.unmaximize();
    } else {
      await win.maximize();
    }
  }
  
  async function close() {
    await getCurrentWindow().close();
  }
  
  function toggleProfile() {
    showProfileMenu = !showProfileMenu;
  }
</script>

<div class="titlebar" data-tauri-drag-region>
  <div class="titlebar-left">
    <div class="app-logo">
      <span class="logo-icon">V</span>
      <span class="logo-text">VisionMachine</span>
    </div>
    
    <div class="titlebar-buttons">
      <button class="tb-btn" onclick={() => emit('new-project')} title="New Project">
        <span class="tb-icon">＋</span>
        <span>New Project</span>
      </button>
      <button class="tb-btn" onclick={() => emit('save-project')} title="Save">
        <span class="tb-icon">💾</span>
        <span>Save</span>
      </button>
      <button class="tb-btn primary" onclick={() => emit('generate')} title="Generate">
        <span class="tb-icon">▶</span>
        <span>Generate</span>
      </button>
    </div>
  </div>
  
  <div class="titlebar-right">
    <div class="profile-area" class:open={showProfileMenu}>
      <button class="profile-btn" onclick={toggleProfile}>
        <Avatar initials="VM" size="sm"/>
        <span class="username">User</span>
        <span class="dropdown-arrow" class:rotated={showProfileMenu}>▼</span>
      </button>
      
      {#if showProfileMenu}
        <div class="profile-dropdown" onclick={(e) => e.stopPropagation()}>
          <div class="dropdown-header">
            <Avatar initials="VM" size="md"/>
            <div class="user-info">
              <span class="user-name">VisionMachine User</span>
              <span class="user-email">user@visionmachine.ai</span>
            </div>
          </div>
          
          <div class="dropdown-menu">
            <MenuItem icon="⚙" label="Settings" shortcut="⌘,"/>
            <MenuItem icon="👤" label="Account"/>
            <MenuItem icon="❓" label="Help & Support"/>
            <Separator/>
            <MenuItem icon="🌙" label="Dark Mode" toggleable bind:toggled={isDarkMode}/>
            <Separator/>
            <MenuItem icon="🚪" label="Logout" danger/>
          </div>
        </div>
      {/if}
    </div>
    
    <div class="window-controls">
      <button class="win-btn" onclick={minimize} title="Minimize">─</button>
      <button class="win-btn" onclick={maximize} title="Maximize">□</button>
      <button class="win-btn close" onclick={close} title="Close">✕</button>
    </div>
  </div>
</div>

<style>
  .titlebar {
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--color-bg-secondary);
    border-bottom: 1px solid var(--color-border);
    padding: 0 8px;
    -webkit-app-region: drag;
    user-select: none;
  }
  
  .titlebar-left, .titlebar-right {
    display: flex;
    align-items: center;
    gap: 8px;
    -webkit-app-region: no-drag;
  }
  
  .app-logo {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 8px;
  }
  
  .logo-icon {
    width: 20px;
    height: 20px;
    background: linear-gradient(135deg, var(--color-accent), #8b5cf6);
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    color: white;
  }
  
  .logo-text {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-primary);
  }
  
  .titlebar-buttons {
    display: flex;
    gap: 4px;
  }
  
  .tb-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--color-text-secondary);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s;
  }
  
  .tb-btn:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }
  
  .tb-btn.primary {
    background: var(--color-accent);
    color: white;
  }
  
  .tb-btn.primary:hover {
    background: var(--color-accent-hover);
  }
  
  .tb-icon {
    font-size: 10px;
  }
  
  .profile-area {
    position: relative;
  }
  
  .profile-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all 0.15s;
  }
  
  .profile-btn:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }
  
  .username {
    font-size: 11px;
  }
  
  .dropdown-arrow {
    font-size: 8px;
    transition: transform 0.2s;
  }
  
  .dropdown-arrow.rotated {
    transform: rotate(180deg);
  }
  
  .profile-dropdown {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 4px;
    width: 200px;
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    z-index: 1000;
    overflow: hidden;
  }
  
  .dropdown-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px;
    border-bottom: 1px solid var(--color-border);
  }
  
  .user-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  
  .user-name {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-text-primary);
  }
  
  .user-email {
    font-size: 10px;
    color: var(--color-text-muted);
  }
  
  .dropdown-menu {
    padding: 4px;
  }
  
  .menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--color-text-secondary);
    font-size: 12px;
    cursor: pointer;
    width: 100%;
    text-align: left;
    transition: all 0.15s;
  }
  
  .menu-item:hover {
    background: var(--color-bg-hover);
    color: var(--color-text-primary);
  }
  
  .menu-item.danger {
    color: var(--color-error);
  }
  
  .menu-item.danger:hover {
    background: rgba(239, 68, 68, 0.1);
  }
  
  .menu-shortcut {
    margin-left: auto;
    font-size: 10px;
    color: var(--color-text-muted);
  }
  
  .separator {
    height: 1px;
    background: var(--color-border);
    margin: 4px 0;
  }
  
  .window-controls {
    display: flex;
    margin-left: 8px;
  }
  
  .win-btn {
    width: 46px;
    height: 32px;
    background: transparent;
    border: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    font-size: 10px;
    transition: background 0.15s;
  }
  
  .win-btn:hover {
    background: var(--color-bg-hover);
  }
  
  .win-btn.close:hover {
    background: var(--color-error);
    color: white;
  }
</style>
