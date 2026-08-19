<script>
  import { onMount } from 'svelte';
  import WelcomePage from './components/WelcomePage.svelte';
  
  // App state
  let userName = '';
  let isLoggedIn = false;
  
  // Load user from localStorage
  onMount(() => {
    const savedUser = localStorage.getItem('vm-username');
    if (savedUser) {
      userName = savedUser;
      isLoggedIn = true;
    }
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
</script>

{#if !isLoggedIn}
  <WelcomePage 
    userName={userName} 
    isReturningUser={false}
    onContinue={handleLogin}
  />
{:else}
  <div class="app-container">
    <!-- Main app content will go here -->
    <header class="app-header">
      <div class="header-left">
        <h1>VisionMachine</h1>
      </div>
      <div class="header-right">
        <span class="user-greeting">Hello, {userName}!</span>
        <button class="btn btn-ghost btn-sm" on:click={handleLogout}>Logout</button>
      </div>
    </header>
    
    <main class="app-main">
      <!-- Main content area -->
      <div class="empty-state">
        <p>Welcome, {userName}! Your video generation workspace.</p>
      </div>
    </main>
  </div>
{/if}

<style>
  .app-container {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    background: var(--bg-primary);
  }
  
  .app-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-md) var(--space-lg);
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-color);
  }
  
  .header-left h1 {
    font-size: 1.25rem;
    color: var(--text-primary);
  }
  
  .header-right {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }
  
  .user-greeting {
    font-size: 0.9375rem;
    color: var(--text-secondary);
  }
  
  .app-main {
    flex: 1;
    padding: var(--space-lg);
  }
  
  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--text-muted);
  }
  
  .btn-sm {
    padding: var(--space-xs) var(--space-sm);
    font-size: 0.875rem;
  }
</style>
