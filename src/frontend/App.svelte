<script>
  import { onMount } from 'svelte';
  
  // User state
  let userName = localStorage.getItem('vm-username') || '';
  let showWelcome = !localStorage.getItem('vm-username');
  
  // Theme options - Two distinct palettes
  const themes = [
    { 
      id: 'jetbrains-dark', 
      name: 'JetBrains Dark',
      preview: ['#1e1e2e', '#313244'],
      desc: 'Soft dark gray, low contrast'
    },
    { 
      id: 'jetbrains-light', 
      name: 'JetBrains Light',
      preview: ['#f6f8fa', '#eef0f4'],
      desc: 'Clean light gray'
    },
    { 
      id: 'steel-dark', 
      name: 'Steel Machinery Dark',
      preview: ['#1a1d23', '#2a2d35'],
      desc: 'Deep steel blue-gray, industrial'
    },
    { 
      id: 'steel-light', 
      name: 'Steel Machinery Light',
      preview: ['#e8eaf0', '#f5f6f8'],
      desc: 'Light steel, minimal noise'
    }
  ];
  
  // Language options
  const languages = [
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'ru', name: 'Русский', flag: '🇷🇺' },
    { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
    { code: 'ja', name: '日本語', flag: '🇯🇵' }
  ];
  
  let selectedTheme = localStorage.getItem('vm-theme') || 'jetbrains-dark';
  let selectedLang = localStorage.getItem('vm-lang') || 'en';
  let showThemePicker = false;
  let showLangPicker = false;
  let checkUpdates = false;
  
  onMount(() => {
    applyTheme(selectedTheme);
  });
  
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('vm-theme', theme);
    selectedTheme = theme;
    showThemePicker = false;
  }
  
  function selectLanguage(lang) {
    localStorage.setItem('vm-lang', lang);
    selectedLang = lang;
    showLangPicker = false;
  }
  
  function handleLogin() {
    if (userName.trim()) {
      localStorage.setItem('vm-username', userName);
      showWelcome = false;
    }
  }
  
  function handleLogout() {
    userName = '';
    showWelcome = true;
    localStorage.removeItem('vm-username');
  }
  
  function checkForUpdates() {
    if (checkUpdates) {
      console.log('Checking for updates...');
    }
  }
  
  function showAbout() {
    alert('VisionMachine v0.1.0\n\nAI-Powered Video Generation Desktop App\n© 2026 HorizonsMachine');
  }
  
  function showBuildInfo() {
    const date = new Date().toISOString().split('T')[0];
    alert(`VisionMachine\nBuild: ${date}\nPlatform: Windows\nVersion: 0.1.0`);
  }
</script>

<div class="app">
  <!-- Header -->
  <header class="header">
    <div class="logo-section">
      <span class="logo-icon">🎬</span>
      <span class="logo-text">VisionMachine</span>
    </div>
    
    <div class="controls">
      <!-- Language Picker -->
      <div class="picker" onclick={() => showLangPicker = !showLangPicker}>
        <button class="btn btn-ghost">
          <span class="lang-flag">{languages.find(l => l.code === selectedLang)?.flag}</span>
          <span>{languages.find(l => l.code === selectedLang)?.name}</span>
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>
        
        {#if showLangPicker}
          <div class="dropdown">
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
        {/if}
      </div>
      
      <!-- Theme Picker -->
      <div class="picker" onclick={() => showThemePicker = !showThemePicker}>
        <button class="btn btn-ghost">
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 2v20M2 12h20"/>
          </svg>
          <span>Theme</span>
        </button>
        
        {#if showThemePicker}
          <div class="dropdown theme-dropdown">
            {#each themes as theme}
              <button 
                class="dropdown-item" 
                class:active={selectedTheme === theme.id}
                onclick={() => applyTheme(theme.id)}
              >
                <div class="theme-preview">
                  {#each theme.preview as color}
                    <span class="color-dot" style="background: {color}"></span>
                  {/each}
                </div>
                <span>{theme.name}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </header>

  <!-- Main Content -->
  <main class="main">
    {#if showWelcome}
      <!-- Welcome Screen -->
      <div class="welcome-card">
        <div class="welcome-icon">🎬</div>
        <h1 class="welcome-title">Welcome to VisionMachine</h1>
        <p class="welcome-subtitle">Your AI-powered video generation companion</p>
        
        <div class="input-group">
          <label for="username" class="input-label">What should we call you?</label>
          <input
            type="text"
            id="username"
            bind:value={userName}
            placeholder="Enter your name..."
            class="input"
            onkeydown={(e) => e.key === 'Enter' && handleLogin()}
            autocomplete="off"
          />
        </div>
        
        <button 
          class="btn btn-primary btn-large"
          disabled={!userName.trim()}
          on:click={handleLogin}
        >
          Get Started
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </button>
      </div>
    {:else}
      <!-- Main App (Placeholder) -->
      <div class="app-content">
        <div class="greeting">
          <h2>Hello, {userName}! 👋</h2>
          <p>Your video generation workspace is ready.</p>
        </div>
        
        <button class="btn btn-ghost" on:click={handleLogout}>
          Switch User
        </button>
      </div>
    {/if}
  </main>

  <!-- Footer -->
  <footer class="footer">
    <div class="footer-left">
      <button class="btn btn-ghost btn-sm" on:click={showBuildInfo}>
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
          <line x1="8" y1="21" x2="16" y2="21"/>
          <line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
        Build Info
      </button>
      <button class="btn btn-ghost btn-sm" on:click={showAbout}>
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 16v-4M12 8h.01"/>
        </svg>
        About
      </button>
    </div>
    
    <div class="footer-right">
      <label class="checkbox-label">
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
  /* Reset & Base */
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  
  :root {
    --space-xs: 4px;
    --space-sm: 8px;
    --space-md: 16px;
    --space-lg: 24px;
    --space-xl: 32px;
    
    --radius-sm: 4px;
    --radius-md: 8px;
    --radius-lg: 12px;
    
    --transition-fast: 150ms ease;
    --transition-normal: 250ms ease;
  }
  
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    color: var(--text-primary);
    background: var(--bg-primary);
    transition: background var(--transition-normal), color var(--transition-normal);
  }
  
  .app {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    background: var(--bg-primary);
  }
  
  /* Header */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-md) var(--space-lg);
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-color);
  }
  
  .logo-section {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }
  
  .logo-icon {
    font-size: 1.5rem;
  }
  
  .logo-text {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-primary);
  }
  
  .controls {
    display: flex;
    gap: var(--space-sm);
  }
  
  /* Pickers */
  .picker {
    position: relative;
  }
  
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
  }
  
  .btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
  
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .btn-primary {
    background: var(--accent-primary);
    color: var(--text-inverse);
    border-color: var(--accent-primary);
  }
  
  .btn-primary:hover:not(:disabled) {
    background: var(--accent-primary-hover);
    border-color: var(--accent-primary-hover);
  }
  
  .btn-ghost {
    background: transparent;
    border: none;
  }
  
  .btn-sm {
    padding: var(--space-xs) var(--space-sm);
    font-size: 0.75rem;
  }
  
  .btn-large {
    padding: var(--space-md) var(--space-xl);
    font-size: 1rem;
    min-width: 160px;
  }
  
  .icon {
    width: 16px;
    height: 16px;
    stroke: currentColor;
    stroke-width: 2;
    fill: none;
  }
  
  /* Dropdown */
  .dropdown {
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
  
  /* Main */
  .main {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-xl);
  }
  
  .welcome-card {
    width: 100%;
    max-width: 420px;
    text-align: center;
    animation: fadeInUp 0.4s ease;
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
  
  .welcome-icon {
    font-size: 4rem;
    margin-bottom: var(--space-md);
  }
  
  .welcome-title {
    font-size: 1.75rem;
    font-weight: 700;
    margin-bottom: var(--space-sm);
    color: var(--text-primary);
  }
  
  .welcome-subtitle {
    font-size: 1rem;
    color: var(--text-secondary);
    margin-bottom: var(--space-lg);
  }
  
  .input-group {
    margin-bottom: var(--space-lg);
    text-align: left;
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
  
  .app-content {
    text-align: center;
  }
  
  .greeting {
    margin-bottom: var(--space-xl);
  }
  
  .greeting h2 {
    font-size: 2rem;
    font-weight: 700;
    margin-bottom: var(--space-sm);
    color: var(--text-primary);
  }
  
  .greeting p {
    font-size: 1.125rem;
    color: var(--text-secondary);
  }
  
  /* Footer */
  .footer {
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
  
  .checkbox-label {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-size: 0.875rem;
    color: var(--text-secondary);
    cursor: pointer;
  }
  
  .checkbox-label input[type="checkbox"] {
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
  
  /* Responsive */
  @media (max-width: 640px) {
    .header {
      padding: var(--space-md);
    }
    
    .main {
      padding: var(--space-md);
    }
    
    .footer {
      flex-direction: column;
      gap: var(--space-md);
    }
  }
</style>
