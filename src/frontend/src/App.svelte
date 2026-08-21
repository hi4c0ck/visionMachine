<script>
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  
  const VERSION = '0.1.0';
  const BUILD_NUMBER = import.meta.env.VITE_BUILD_NUMBER || 'dev';
  
  let currentView = 'welcome';
  let currentUser = null;
  let userName = '';
  let loginError = null;
  let loading = false;
  
  onMount(async () => {
    console.log(`VisionMachine v${VERSION} (Build ${BUILD_NUMBER})`);
    await checkAuth();
  });
  
  async function checkAuth() {
    try {
      const profile = await invoke('get_current_profile');
      if (profile) {
        currentUser = profile;
        currentView = 'main';
      } else {
        currentView = 'welcome';
      }
    } catch (e) {
      console.error('Auth check failed:', e);
      currentView = 'welcome';
    }
  }
  
  async function handleLogin() {
    if (!userName.trim()) return;
    
    loading = true;
    loginError = null;
    
    try {
      // Create new profile
      const profile = await invoke('create_profile', { 
        name: userName.trim(), 
        email: null 
      });
      
      // Login
      currentUser = await invoke('login_profile', { profileId: profile.id });
      currentView = 'main';
      userName = '';
    } catch (e) {
      loginError = `Login failed: ${e}`;
    } finally {
      loading = false;
    }
  }
  
  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      handleLogin();
    }
  }
  
  async function handleLogout() {
    try {
      await invoke('logout_profile');
      currentUser = null;
      currentView = 'welcome';
    } catch (e) {
      console.error('Logout failed:', e);
      currentView = 'welcome';
    }
  }
</script>

{#if currentView === 'welcome'}
  <div class="welcome-screen">
    <div class="logo">
      <div class="logo-icon">V</div>
      <h1>VisionMachine</h1>
      <p class="version">v{VERSION} (Build {BUILD_NUMBER})</p>
    </div>
    
    <div class="login-form">
      <h2>Welcome</h2>
      <p>Enter your name to continue</p>
      
      {#if loginError}
        <div class="error">{loginError}</div>
      {/if}
      
      <div class="input-group">
        <input 
          type="text" 
          bind:value={userName}
          on:keydown={handleKeyDown}
          placeholder="Your name..."
          disabled={loading}
        >
        <button 
          class="btn-primary" 
          on:click={handleLogin}
          disabled={loading || !userName.trim()}
        >
          {loading ? 'Signing in...' : 'Continue'}
        </button>
      </div>
    </div>
  </div>
{:else}
  <div class="app">
    <!-- Titlebar -->
    <div class="titlebar">
      <div class="title">VisionMachine v{VERSION}</div>
      <div class="user-info">
        <span class="username">👤 {currentUser?.name}</span>
        <button class="btn-logout" on:click={handleLogout}>Logout</button>
      </div>
    </div>
    
    <!-- Main Content -->
    <div class="main">
      <div class="content">
        <h2>Welcome, {currentUser?.name}!</h2>
        <p>Your workspace is ready.</p>
        
        <div class="features">
          <div class="feature-card">
            <h3>Projects</h3>
            <p>Create and manage your AI video generation projects</p>
          </div>
          <div class="feature-card">
            <h3>Sessions</h3>
            <p>Start new sessions and compose your video pipelines</p>
          </div>
          <div class="feature-card">
            <h3>Artifacts</h3>
            <p>View and manage your generated video outputs</p>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  :global(body) {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0f0f1a;
    color: #fff;
    overflow: hidden;
  }
  
  /* Welcome Screen */
  .welcome-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    background: linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 100%);
  }
  
  .logo {
    text-align: center;
    margin-bottom: 40px;
  }
  
  .logo-icon {
    width: 80px;
    height: 80px;
    background: linear-gradient(135deg, #4a9eff 0%, #1a56db 100%);
    border-radius: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 48px;
    font-weight: bold;
    margin: 0 auto 20px;
  }
  
  .logo h1 {
    font-size: 32px;
    font-weight: 600;
    margin: 0 0 8px;
  }
  
  .logo .version {
    font-size: 14px;
    color: #888;
  }
  
  .login-form {
    background: #16161e;
    padding: 40px;
    border-radius: 16px;
    border: 1px solid #2a2a3a;
    width: 100%;
    max-width: 400px;
  }
  
  .login-form h2 {
    margin: 0 0 8px;
    font-size: 24px;
  }
  
  .login-form p {
    color: #888;
    margin: 0 0 24px;
  }
  
  .input-group {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  
  .input-group input {
    padding: 14px 16px;
    background: #0f0f1a;
    border: 1px solid #2a2a3a;
    border-radius: 8px;
    color: #fff;
    font-size: 16px;
  }
  
  .input-group input:focus {
    outline: none;
    border-color: #4a9eff;
  }
  
  .input-group input:disabled {
    opacity: 0.5;
  }
  
  /* App Layout */
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }
  
  /* Titlebar */
  .titlebar {
    height: 40px;
    background: #16161e;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
    border-bottom: 1px solid #2a2a3a;
  }
  
  .title { font-size: 13px; font-weight: 500; }
  
  .user-info {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  
  .username {
    font-size: 13px;
    color: #888;
  }
  
  .btn-logout {
    padding: 4px 12px;
    background: transparent;
    border: 1px solid #2a2a3a;
    border-radius: 4px;
    color: #fff;
    cursor: pointer;
    font-size: 12px;
  }
  
  .btn-logout:hover {
    background: #ef4444;
    border-color: #ef4444;
  }
  
  /* Main */
  .main {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0f0f1a;
  }
  
  .content {
    text-align: center;
    max-width: 800px;
    padding: 40px;
  }
  
  .content h2 {
    font-size: 28px;
    font-weight: 600;
    margin: 0 0 16px;
  }
  
  .content p {
    color: #888;
    font-size: 16px;
    margin: 0 0 40px;
  }
  
  .features {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
  }
  
  .feature-card {
    background: #16161e;
    border: 1px solid #2a2a3a;
    border-radius: 12px;
    padding: 24px;
    text-align: left;
  }
  
  .feature-card h3 {
    margin: 0 0 8px;
    font-size: 16px;
    font-weight: 600;
  }
  
  .feature-card p {
    margin: 0;
    font-size: 13px;
    color: #888;
  }
  
  /* Buttons */
  .btn-primary {
    padding: 14px 24px;
    background: #4a9eff;
    color: #fff;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 16px;
    font-weight: 500;
    transition: background 0.2s;
  }
  
  .btn-primary:hover:not(:disabled) {
    background: #3a8eef;
  }
  
  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  /* Error */
  .error {
    padding: 12px;
    background: rgba(239, 68, 68, 0.1);
    border-radius: 6px;
    color: #ef4444;
    font-size: 13px;
    margin-bottom: 16px;
  }
  
  /* Scrollbar */
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-track { background: #16161e; }
  ::-webkit-scrollbar-thumb { background: #2a2a3a; border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: #3a3a4a; }
</style>
