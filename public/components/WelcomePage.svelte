<script>
  import { onMount } from 'svelte';
  
  // User state
  export let userName = '';
  export let isReturningUser = false;
  export let onContinue;
  
  // Language options
  const languages = [
    { code: 'en', name: 'English' },
    { code: 'ru', name: 'Русский' },
    { code: 'de', name: 'Deutsch' },
    { code: 'ja', name: '日本語' }
  ];
  
  // Theme options
  const themes = [
    { id: 'jetbrains', name: 'JetBrains Gray' },
    { id: 'jetbrains-dark', name: 'JetBrains Dark' },
    { id: 'steel', name: 'Steel Light' },
    { id: 'steel-dark', name: 'Steel Dark' }
  ];
  
  // State
  let selectedLang = 'en';
  let selectedTheme = 'jetbrains-dark';
  let showLangDropdown = false;
  let showThemeDropdown = false;
  let checkUpdates = false;
  
  // Lifecycle
  onMount(() => {
    // Load saved preferences
    const savedLang = localStorage.getItem('vm-lang');
    const savedTheme = localStorage.getItem('vm-theme');
    
    if (savedLang && languages.find(l => l.code === savedLang)) {
      selectedLang = savedLang;
    }
    if (savedTheme && themes.find(t => t.id === savedTheme)) {
      selectedTheme = savedTheme;
    }
    
    applyTheme(selectedTheme);
  });
  
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('vm-theme', theme);
    selectedTheme = theme;
    showThemeDropdown = false;
  }
  
  function selectLanguage(lang) {
    localStorage.setItem('vm-lang', lang);
    selectedLang = lang;
    showLangDropdown = false;
    // In real app, would trigger i18n reload
    console.log(`Language switched to: ${lang}`);
  }
  
  function handleContinue() {
    if (onContinue) {
      onContinue(userName);
    }
  }
  
  function handleCheckUpdates() {
    if (checkUpdates) {
      // Trigger update check
      console.log('Checking for updates...');
      setTimeout(() => {
        alert(checkUpdates ? 'Checking for updates...' : '');
      }, 500);
    }
  }
  
  function handleAbout() {
    alert('VisionMachine v0.1.0\n\nLightweight AI video generation desktop app.\n\n© 2026 HorizonsMachine');
  }
  
  function handleBuildInfo() {
    alert(`Build: ${new Date().toISOString().split('T')[0]}\nPlatform: Windows\nVersion: 0.1.0`);
  }
</script>

<div class="welcome-container">
  <!-- Top Bar -->
  <header class="welcome-header">
    <div class="header-left">
      <div class="logo">
        <span class="logo-icon">🎬</span>
        <span class="logo-text">VisionMachine</span>
      </div>
    </div>
    
    <div class="header-controls">
      <!-- Language Switcher -->
      <div class="dropdown-wrapper">
        <button 
          class="btn btn-ghost btn-icon dropdown-trigger"
          onclick={() => showLangDropdown = !showLangDropdown}
          title="Switch Language"
        >
          <span class="lang-flag">{selectedLang === 'en' ? '🇺🇸' : selectedLang === 'ru' ? '🇷🇺' : selectedLang === 'de' ? '🇩🇪' : '🇯🇵'}</span>
          <span class="lang-code">{selectedLang.toUpperCase()}</span>
        </button>
        
        {#if showLangDropdown}
          <div class="dropdown-menu">
            {#each languages as lang}
              <button 
                class="dropdown-item" 
                class:active={selectedLang === lang.code}
                onclick={() => selectLanguage(lang.code)}
              >
                <span class="item-flag">{lang.code === 'en' ? '🇺🇸' : lang.code === 'ru' ? '🇷🇺' : lang.code === 'de' ? '🇩🇪' : '🇯🇵'}</span>
                <span class="item-name">{lang.name}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
      
      <!-- Theme Selector -->
      <div class="dropdown-wrapper">
        <button 
          class="btn btn-ghost btn-icon dropdown-trigger"
          onclick={() => showThemeDropdown = !showThemeDropdown}
          title="Switch Theme"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11z"/>
            <path d="M8 3a5 5 0 1 0 0 10A5 5 0 0 0 8 3zM6.5 8h3a1.5 1.5 0 0 1 0 3h-3V8z"/>
          </svg>
          <span class="theme-label">Theme</span>
        </button>
        
        {#if showThemeDropdown}
          <div class="dropdown-menu">
            {#each themes as theme}
              <button 
                class="dropdown-item" 
                class:active={selectedTheme === theme.id}
                onclick={() => applyTheme(theme.id)}
              >
                <span class="theme-preview" style="background: {theme.id.includes('dark') ? '#1a1f2e' : '#f0f2f5'}"></span>
                <span class="item-name">{theme.name}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </header>

  <!-- Main Content -->
  <main class="welcome-main">
    <div class="welcome-card">
      {#if !isReturningUser}
        <!-- New User: Enter Name -->
        <div class="welcome-content">
          <div class="welcome-icon">🎬</div>
          <h1 class="welcome-title">Welcome to VisionMachine</h1>
          <p class="welcome-subtitle">Your AI-powered video generation companion</p>
          
          <div class="input-group">
            <label for="username" class="input-label">What's your name?</label>
            <input
              type="text"
              id="username"
              bind:value={userName}
              placeholder="Enter your display name..."
              class="input input-large"
              onkeydown={(e) => e.key === 'Enter' && handleContinue()}
              autocomplete="off"
            />
          </div>
          
          <button 
            class="btn btn-primary btn-large"
            disabled={!userName.trim()}
            on:click={handleContinue}
          >
            Get Started
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zM6.5 8l3-3-1-1-2 2-2-2-1 1 3 3z"/>
            </svg>
          </button>
        </div>
      {:else}
        <!-- Returning User: Welcome Back -->
        <div class="welcome-content">
          <div class="welcome-icon">👋</div>
          <h1 class="welcome-title">Hello, {userName}!</h1>
          <p class="welcome-subtitle">Ready to create some amazing videos?</p>
          
          <button 
            class="btn btn-primary btn-large"
            on:click={handleContinue}
          >
            Continue
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M6 3l5 5-5 5V3z"/>
            </svg>
          </button>
        </div>
      {/if}
    </div>
  </main>

  <!-- Footer -->
  <footer class="welcome-footer">
    <div class="footer-left">
      <button class="btn btn-ghost btn-sm" on:click={handleBuildInfo}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zM7 4v4.5L11 8l-1-1.5-2 1V4H7z"/>
        </svg>
        Build Info
      </button>
      <button class="btn btn-ghost btn-sm" on:click={handleAbout}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zM7 7h2v5H7V7zm0-2h2v2H7V5z"/>
        </svg>
        About
      </button>
    </div>
    
    <div class="footer-right">
      <label class="update-check">
        <input 
          type="checkbox" 
          bind:checked={checkUpdates}
          onchange={handleCheckUpdates}
        />
        <span>Check for updates</span>
      </label>
      <span class="version-badge">v0.1.0</span>
    </div>
  </footer>
</div>

<style>
  .welcome-container {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    background: var(--bg-primary);
    color: var(--text-primary);
  }
  
  /* Header */
  .welcome-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-lg) var(--space-xl);
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-color);
  }
  
  .header-left {
    display: flex;
    align-items: center;
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
  
  .header-controls {
    display: flex;
    gap: var(--space-sm);
  }
  
  /* Dropdown */
  .dropdown-wrapper {
    position: relative;
  }
  
  .dropdown-trigger {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
  }
  
  .lang-flag, .theme-preview {
    font-size: 1.1rem;
  }
  
  .theme-label {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }
  
  .dropdown-menu {
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
  }
  
  .dropdown-item:hover {
    background: var(--bg-hover);
  }
  
  .dropdown-item.active {
    background: var(--bg-tertiary);
    color: var(--accent-primary);
  }
  
  .item-name {
    font-size: 0.875rem;
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
    margin-bottom: var(--space-sm);
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
  
  /* Input */
  .input-group {
    width: 100%;
    text-align: left;
  }
  
  .input-label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-secondary);
    margin-bottom: var(--space-sm);
  }
  
  .input-large {
    padding: var(--space-md);
    font-size: 1rem;
  }
  
  /* Buttons */
  .btn-large {
    padding: var(--space-md) var(--space-xl);
    font-size: 1.125rem;
    min-width: 200px;
  }
  
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  /* Footer */
  .welcome-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-md) var(--space-xl);
    background: var(--bg-secondary);
    border-top: 1px solid var(--border-color);
  }
  
  .footer-left {
    display: flex;
    gap: var(--space-sm);
  }
  
  .footer-right {
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
  
  .version-badge {
    padding: var(--space-xs) var(--space-sm);
    background: var(--bg-tertiary);
    border-radius: var(--radius-full);
    font-size: 0.75rem;
    color: var(--text-muted);
  }
  
  /* Responsive */
  @media (max-width: 640px) {
    .welcome-header {
      padding: var(--space-md);
    }
    
    .welcome-main {
      padding: var(--space-md);
    }
    
    .welcome-title {
      font-size: 1.5rem;
    }
    
    .welcome-footer {
      flex-direction: column;
      gap: var(--space-md);
      text-align: center;
    }
  }
</style>
