<script>
  import { createEventDispatcher } from 'svelte';
  
  const dispatch = createEventDispatcher();
  
  // Theme options
  const themes = [
    { id: 'jetbrains-dark', name: 'JetBrains Dark', colors: ['#1e1e2e', '#313244'] },
    { id: 'jetbrains-light', name: 'JetBrains Light', colors: ['#f6f8fa', '#eef0f4'] },
    { id: 'steel-dark', name: 'Steel Dark', colors: ['#1a1d23', '#2a2d35'] },
    { id: 'steel-light', name: 'Steel Light', colors: ['#e8eaf0', '#f5f6f8'] }
  ];
  
  // Languages
  const languages = [
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'ru', name: 'Русский', flag: '🇷🇺' },
    { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
    { code: 'ja', name: '日本語', flag: '🇯🇵' }
  ];
  
  let inputName = '';
  let selectedTheme = localStorage.getItem('vm-theme') || 'jetbrains-dark';
  let selectedLang = localStorage.getItem('vm-lang') || 'en';
  let checkUpdates = false;
  
  function handleLogin() {
    if (inputName.trim()) {
      dispatch('login', inputName.trim());
    }
  }
  
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('vm-theme', theme);
    selectedTheme = theme;
  }
  
  function selectLanguage(lang) {
    localStorage.setItem('vm-lang', lang);
    selectedLang = lang;
  }
  
  function checkForUpdates() {
    if (checkUpdates) {
      console.log('Checking for updates...');
    }
  }
  
  function showAbout() {
    alert('VisionMachine v0.1.0\n\nAI-Powered Video Generation\n© 2026 HorizonsMachine');
  }
  
  function showBuildInfo() {
    const date = new Date().toISOString().split('T')[0];
    alert(`VisionMachine\nBuild: ${date}\nPlatform: Windows\nVersion: 0.1.0`);
  }
</script>

<div class="welcome">
  <!-- Header -->
  <header class="welcome-header">
    <div class="logo">
      <span class="logo-icon">🎬</span>
      <span class="logo-text">VisionMachine</span>
    </div>
    
    <div class="controls">
      <!-- Language Selector -->
      <div class="dropdown" class:show={false}>
        <button class="btn btn-ghost" onclick={() => document.getElementById('lang-dropdown').classList.toggle('show')}>
          <span class="lang-flag">{languages.find(l => l.code === selectedLang)?.flag}</span>
          <span>{languages.find(l => l.code === selectedLang)?.name}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>
        <div id="lang-dropdown" class="dropdown-menu">
          {#each languages as lang}
            <button 
              class="dropdown-item" 
              class:active={selectedLang === lang.code}
              onclick={() => selectLanguage(lang.code)}
            >
              <span>{lang.flag}</span>
              <span>{lang.name}</span>
            </button>
          {/each}
        </div>
      </div>
      
      <!-- Theme Selector -->
      <div class="dropdown">
        <button class="btn btn-ghost" onclick={() => document.getElementById('theme-dropdown').classList.toggle('show')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 2a10 10 0 0 1 0 20"/>
          </svg>
          Theme
        </button>
        <div id="theme-dropdown" class="dropdown-menu theme-picker">
          {#each themes as theme}
            <button 
              class="dropdown-item" 
              class:active={selectedTheme === theme.id}
              onclick={() => applyTheme(theme.id)}
            >
              <div class="theme-preview">
                {#each theme.colors as color}
                  <span class="color-dot" style="background: {color}"></span>
                {/each}
              </div>
              <span>{theme.name}</span>
            </button>
          {/each}
        </div>
      </div>
    </div>
  </header>

  <!-- Main Content -->
  <main class="welcome-main">
    <div class="welcome-card">
      <div class="welcome-content">
        <div class="welcome-icon">🎬</div>
        <h1 class="welcome-title">Welcome to VisionMachine</h1>
        <p class="welcome-subtitle">Your AI-powered video generation companion</p>
        
        <div class="input-group">
          <label for="username" class="input-label">What's your name?</label>
          <input
            type="text"
            id="username"
            bind:value={inputName}
            placeholder="Enter your display name..."
            class="input input-large"
            on:keydown={(e) => e.key === 'Enter' && handleLogin()}
            autocomplete="off"
            autofocus
          />
        </div>
        
        <button 
          class="btn btn-primary btn-large"
          disabled={!inputName.trim()}
          on:click={handleLogin}
        >
          Get Started
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </button>
      </div>
    </div>
  </main>

  <!-- Footer -->
  <footer class="welcome-footer">
    <div class="footer-left">
      <button class="btn btn-ghost btn-sm" on:click={showBuildInfo}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
          <line x1="8" y1="21" x2="16" y2="21"/>
          <line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
        Build Info
      </button>
      <button class="btn btn-ghost btn-sm" on:click={showAbout}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 16v-4M12 8h.01"/>
        </svg>
        About
      </button>
    </div>
    
    <div class="footer-right">
      <label class="update-check">
        <input 
          type="checkbox"
          bind:checked={checkUpdates}
          onchange={checkForUpdates}
        />
        <span>Check for updates</span>
      </label>
      <span class="version-badge">v0.1.0</span>
    </div>
  </footer>
</div>

<style>
  .welcome {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    background: var(--bg-primary);
  }
  
  /* Header */
  .welcome-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-md) var(--space-lg);
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-color);
  }
  
  .logo {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }
  
  .logo-icon {
    font-size: 1.5rem;
  }
  
  .logo-text {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
  }
  
  .controls {
    display: flex;
    gap: var(--space-sm);
    align-items: center;
  }
  
  /* Dropdowns */
  .dropdown {
    position: relative;
  }
  
  .dropdown-menu {
    display: none;
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    min-width: 180px;
    background: var(--surface-elevated);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    z-index: 1000;
    overflow: hidden;
  }
  
  .dropdown.show .dropdown-menu {
    display: block;
  }
  
  .dropdown-item {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    width: 100%;
    padding: var(--space-md);
    background: transparent;
    border: none;
    color: var(--text-primary);
    cursor: pointer;
    transition: background var(--transition-fast);
    text-align: left;
  }
  
  .dropdown-item:hover {
    background: var(--bg-hover);
  }
  
  .dropdown-item.active {
    background: var(--bg-tertiary);
    color: var(--accent-primary);
  }
  
  .theme-preview {
    display: flex;
    gap: 2px;
  }
  
  .color-dot {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 1px solid var(--border-color);
  }
  
  /* Main Content */
  .welcome-main {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-xl);
  }
  
  .welcome-card {
    width: 100%;
    max-width: 480px;
    text-align: center;
    animation: fadeInUp 0.5s ease;
  }
  
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .welcome-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-lg);
  }
  
  .welcome-icon {
    font-size: 4rem;
  }
  
  .welcome-title {
    font-size: 2rem;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: var(--space-xs);
  }
  
  .welcome-subtitle {
    font-size: 1.125rem;
    color: var(--text-secondary);
    margin-bottom: var(--space-md);
  }
  
  /* Inputs */
  .input-group {
    width: 100%;
    text-align: left;
    margin-bottom: var(--space-lg);
  }
  
  .input-label {
    display: block;
    margin-bottom: var(--space-sm);
    font-size: 0.875rem;
    color: var(--text-secondary);
    font-weight: 500;
  }
  
  .input {
    width: 100%;
    padding: var(--space-md);
    font-size: 1rem;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    transition: all var(--transition-fast);
  }
  
  .input:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px rgba(var(--accent-primary-rgb), 0.1);
  }
  
  .input::placeholder {
    color: var(--text-muted);
  }
  
  .input-large {
    padding: var(--space-md);
    font-size: 1rem;
  }
  
  /* Buttons */
  .btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    font-size: 0.875rem;
    font-weight: 500;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--transition-fast);
    background: transparent;
    color: var(--text-secondary);
    text-decoration: none;
  }
  
  .btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
    border-color: var(--border-color);
  }
  
  .btn-primary {
    background: var(--accent-primary);
    color: white;
    border-color: var(--accent-primary);
  }
  
  .btn-primary:hover:not(:disabled) {
    background: var(--accent-primary-hover);
    border-color: var(--accent-primary-hover);
  }
  
  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .btn-large {
    padding: var(--space-md) var(--space-xl);
    font-size: 1.125rem;
    min-width: 200px;
  }
  
  .btn-sm {
    padding: var(--space-xs) var(--space-sm);
    font-size: 0.75rem;
  }
  
  .btn-ghost {
    background: transparent;
    border: none;
  }
  
  .btn-ghost:hover {
    background: var(--bg-hover);
  }
  
  /* Footer */
  .welcome-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-md) var(--space-lg);
    background: var(--bg-secondary);
    border-top: 1px solid var(--border-color);
  }
  
  .footer-left, .footer-right {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }
  
  .update-check {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-size: 0.875rem;
    color: var(--text-secondary);
    cursor: pointer;
  }
  
  .update-check input[type="checkbox"] {
    width: 16px;
    height: 16px;
    cursor: pointer;
  }
  
  .version-badge {
    padding: var(--space-xs) var(--space-sm);
    background: var(--bg-tertiary);
    border-radius: var(--radius-full);
    font-size: 0.75rem;
    color: var(--text-muted);
  }
  
  /* Icons */
  svg {
    width: 16px;
    height: 16px;
    stroke: currentColor;
    stroke-width: 2;
    fill: none;
  }
</style>
