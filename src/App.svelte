<script lang="ts">
  import { onMount } from 'svelte';
  
  // Svelte 5 runes - reactive state
  let userName = $state(localStorage.getItem('vm-username') || '');
  let showWelcome = $state(!localStorage.getItem('vm-username'));
  let selectedTheme = $state(localStorage.getItem('vm-theme') || 'jetbrains-dark');
  let appInfo = $state();
  let error = $state();
  let errorLog = $state();
  let isShutdownPending = $state(false);
  let preflightReport = $state();
  let showPreflight = $state(false);
  
  const themes = [
    { id: 'jetbrains-dark', name: 'JetBrains Dark' },
    { id: 'steel-dark', name: 'Steel Machinery Dark' },
    { id: 'light', name: 'Light' },
  ];
  
  // Flush pending state before shutdown
  async function flushState() {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      localStorage.setItem('vm-theme', selectedTheme);
      if (userName) {
        localStorage.setItem('vm-username', userName);
      }
      await invoke('report_error', { 
        errorMsg: 'Application shutting down gracefully', 
        context: 'shutdown_flush' 
      });
    } catch (err) {
      console.error('Failed to flush state:', err);
    }
  }
  
  // Error boundary handlers for unhandled rejections and errors
  onMount(async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      appInfo = await invoke('get_app_info');
      errorLog = await invoke('get_errors', { limit: 10 });
      
      // Load preflight report
      try {
        preflightReport = await invoke('get_preflight_report');
        showPreflight = true;
      } catch (e) {
        console.error('Failed to load preflight report:', e);
      }
    } catch (err) {
      error = String(err);
    }
    
    applyTheme(selectedTheme);
    
    // Listen for unhandled promise rejections
    window.addEventListener('unhandledrejection', (e) => {
      const errorMsg = e.reason?.message || String(e.reason);
      invoke('report_error', { errorMsg, context: 'unhandledrejection' });
      console.error('Unhandled rejection:', e.reason);
    });
    
    // Listen for global errors
    window.addEventListener('error', (e) => {
      const errorMsg = e.message || String(e.error);
      invoke('report_error', { errorMsg, context: 'global_error' });
    });
    
    // Handle browser/app close
    window.addEventListener('beforeunload', async () => {
      isShutdownPending = true;
      await flushState();
    });
  });
  
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('vm-theme', theme);
    invoke('set_theme', { theme });
  }
  
  async function handleLogin() {
    const name = userName.trim();
    if (!name) return;
    
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('login_user', { username: name });
      showWelcome = false;
      error = null;
    } catch (err) {
      error = String(err);
    }
  }
  
  async function handleLogout() {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('logout_user');
      userName = '';
      showWelcome = true;
    } catch (err) {
      error = String(err);
    }
  }
  
  async function refreshErrors() {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      errorLog = await invoke('get_errors', { limit: 20 });
    } catch (err) {
      console.error('Failed to refresh errors:', err);
    }
  }
  
  function handleError(error, reset) {
    console.error('Component error caught by boundary:', error);
    invoke('report_error', { 
      errorMsg: String(error), 
      context: 'component_boundary' 
    });
    reset();
  }
  
  function getCheckStatus(count) {
    if (!preflightReport || !preflightReport.checks) return '';
    const fails = preflightReport.checks.filter(c => c.category === 'fail').length;
    const warns = preflightReport.checks.filter(c => c.category === 'warning').length;
    if (fails > 0) return 'error';
    if (warns > 0) return 'warning';
    return 'success';
  }
</script>

<svelte:boundary onerror={handleError}>
  <div class="app">
    <header class="header">
      <div class="logo-section">
        <span class="logo-text">VisionMachine</span>
        {#if appInfo}
          <span class="version-badge">v{appInfo.version}</span>
        {/if}
      </div>
      
      <div class="controls">
        {#if showPreflight && preflightReport}
          <div class="preflight-status" class:error={getCheckStatus() === 'error'} class:warning={getCheckStatus() === 'warning'} class:success={getCheckStatus() === 'success'}>
            <span class="status-dot"></span>
            <span class="status-text">{preflightReport.passed ? 'System Ready' : 'System Check Failed'}</span>
          </div>
        {/if}
        <select class="theme-select" bind:value={selectedTheme} onchange={() => applyTheme(selectedTheme)}>
          {#each themes as theme}
            <option value={theme.id}>{theme.name}</option>
          {/each}
        </select>
      </div>
    </header>

    {#if error}
      <div class="error-banner">
        <span>{error}</span>
        <button onclick={async () => { error = null; await refreshErrors(); }}>Dismiss</button>
      </div>
    {/if}

    {#if showPreflight && preflightReport && !preflightReport.passed}
      <div class="preflight-banner">
        <div class="preflight-title">Environment Check Failed</div>
        <div class="preflight-details">
          {#each preflightReport.checks as check}
            {#if check.category === 'fail'}
              <div class="check-item fail">{check.message}</div>
            {/if}
          {/each}
        </div>
        <a href="https://docs.visionmachine.app/troubleshooting" target="_blank" class="help-link">View Troubleshooting Guide</a>
      </div>
    {/if}

    <main class="main">
      {#if showWelcome}
        <div class="welcome-card">
          <h1 class="welcome-title">Welcome to VisionMachine</h1>
          <input bind:value={userName} placeholder="Enter your name" class="input" onkeydown={(e) => e.key === 'Enter' && handleLogin()} />
          <button class="btn btn-primary" disabled={!userName.trim()} onclick={handleLogin}>Get Started</button>
        </div>
      {:else}
        <div class="app-content">
          <h2>Hello, {userName}!</h2>
          <button class="btn btn-ghost" onclick={handleLogout}>Switch User</button>
        </div>
      {/if}
    </main>

    <footer class="footer">
      <span class="status">{isShutdownPending ? 'Saving...' : 'Ready'}</span>
      <span class="copyright">© 2026 HorizonsMachine</span>
    </footer>
  </div>
</svelte:boundary>

<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  
  body {
    font-family: Arial, sans-serif;
    background: var(--bg-primary, #2B2B2B);
    color: var(--text-primary, #EEEEEE);
  }
  
  .app {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    height: 100vh;
    width: 100%;
    background: var(--bg-primary, #2B2B2B);
  }
  
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 24px;
    background: var(--bg-secondary, #3C3F46);
    border-bottom: 1px solid var(--border-color, #4E525A);
    height: 60px;
    flex-shrink: 0;
  }
  
  .logo-section {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  
  .logo-text {
    font-size: 1.2rem;
    font-weight: bold;
    color: var(--text-primary, #EEEEEE);
  }
  
  .version-badge {
    font-size: 0.75rem;
    padding: 2px 8px;
    background: var(--bg-tertiary, #4E525A);
    border-radius: 12px;
    color: var(--text-muted, #808080);
  }
  
  .controls {
    display: flex;
    gap: 16px;
    align-items: center;
  }
  
  .preflight-status {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 12px;
    border-radius: 4px;
    font-size: 0.875rem;
  }
  
  .preflight-status.error {
    background: rgba(220, 38, 38, 0.1);
    color: #dc2626;
  }
  
  .preflight-status.warning {
    background: rgba(245, 158, 11, 0.1);
    color: #f59e0b;
  }
  
  .preflight-status.success {
    background: rgba(34, 197, 94, 0.1);
    color: #22c55e;
  }
  
  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: currentColor;
  }
  
  .theme-select {
    padding: 8px 12px;
    background: var(--bg-tertiary, #4E525A);
    color: var(--text-primary, #EEEEEE);
    border: 1px solid var(--border-color, #4E525A);
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
  }
  
  .main {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px;
    overflow: auto;
    background: var(--bg-primary, #2B2B2B);
  }
  
  .welcome-card {
    text-align: center;
    max-width: 400px;
    width: 100%;
  }
  
  .welcome-title {
    font-size: 2rem;
    margin-bottom: 24px;
    color: var(--text-primary, #EEEEEE);
  }
  
  .input {
    width: 100%;
    padding: 12px;
    margin-bottom: 16px;
    background: var(--bg-secondary, #3C3F46);
    border: 1px solid var(--border-color, #4E525A);
    border-radius: 4px;
    color: var(--text-primary, #EEEEEE);
    font-size: 1rem;
  }
  
  .input:focus {
    outline: none;
    border-color: var(--accent-primary, #59B5FF);
  }
  
  .btn {
    padding: 10px 20px;
    font-size: 1rem;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }
  
  .btn-primary {
    background: var(--accent-primary, #59B5FF);
    color: var(--text-inverse, #FFFFFF);
  }
  
  .btn-primary:hover:not(:disabled) {
    background: var(--accent-primary-hover, #7EC8FF);
  }
  
  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .btn-ghost {
    background: transparent;
    color: var(--text-secondary, #BFBFBF);
    border: 1px solid var(--border-color, #4E525A);
  }
  
  .btn-ghost:hover {
    background: var(--bg-hover, #4E525A);
    color: var(--text-primary, #EEEEEE);
  }
  
  .error-banner {
    padding: 12px;
    background: #fee2e2;
    color: #dc2626;
    text-align: center;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }
  
  .error-banner button {
    background: #dc2626;
    color: white;
    border: none;
    padding: 4px 12px;
    border-radius: 4px;
    cursor: pointer;
  }
  
  .preflight-banner {
    padding: 16px 24px;
    background: #fef2f2;
    border-bottom: 1px solid #fecaca;
  }
  
  .preflight-title {
    font-weight: bold;
    color: #dc2626;
    margin-bottom: 8px;
  }
  
  .preflight-details {
    margin-bottom: 8px;
  }
  
  .check-item.fail {
    color: #dc2626;
    padding: 4px 0;
  }
  
  .help-link {
    color: #2563eb;
    text-decoration: underline;
    font-size: 0.875rem;
  }
  
  .app-content {
    text-align: center;
  }
  
  .app-content h2 {
    font-size: 2rem;
    margin-bottom: 16px;
    color: var(--text-primary, #EEEEEE);
  }
  
  .footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 24px;
    background: var(--bg-secondary, #3C3F46);
    border-top: 1px solid var(--border-color, #4E525A);
    font-size: 0.875rem;
    color: var(--text-muted, #808080);
    height: 40px;
    flex-shrink: 0;
  }
  
  .status {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .status::before {
    content: '';
    width: 8px;
    height: 8px;
    background: #22c55e;
    border-radius: 50%;
  }
  
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
</style>
