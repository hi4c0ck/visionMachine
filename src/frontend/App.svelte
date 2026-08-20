<script>
  import { onMount } from 'svelte';
  import WelcomeScreen from './components/WelcomeScreen.svelte';
  import Workspace from './components/Workspace.svelte';
  
  // App state
  let userName = localStorage.getItem('vm-username') || '';
  let isLoggedIn = !!userName;
  
  // Load saved preferences
  onMount(() => {
    const savedTheme = localStorage.getItem('vm-theme') || 'jetbrains-dark';
    applyTheme(savedTheme);
  });
  
  function handleLogin(name) {
    userName = name;
    isLoggedIn = true;
    localStorage.setItem('vm-username', name);
  }
  
  function handleLogout() {
    userName = '';
    isLoggedIn = false;
    localStorage.removeItem('vm-username');
  }
  
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('vm-theme', theme);
  }
</script>

{svelte:self}

{#if !isLoggedIn}
  <WelcomeScreen on:login={handleLogin} />
{:else}
  <Workspace 
    userName={userName} 
    on:logout={handleLogout}
  />
{/if}

<style>
  :global(:root) {
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
    --transition-slow: 350ms ease;
  }
  
  :global(body) {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    color: var(--text-primary);
    background: var(--bg-primary);
    margin: 0;
    padding: 0;
    overflow: hidden;
  }
  
  #app {
    width: 100vw;
    height: 100vh;
    overflow: hidden;
  }
</style>
