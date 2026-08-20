<script>
  import { createEventDispatcher } from 'svelte';
  
  const dispatch = createEventDispatcher();
  export let userName = '';
  
  // State
  let layoutMode = 'landscape';
  let showProjects = true;
  let showProfile = false;
  let showTools = true;
  
  // Actions
  function setLayout(mode) {
    layoutMode = mode;
    switch(mode) {
      case 'landscape':
        showProjects = true;
        showProfile = false;
        showTools = true;
        break;
      case 'portrait':
        showProjects = true;
        showProfile = true;
        showTools = true;
        break;
      case 'single':
        showProjects = false;
        showProfile = false;
        showTools = false;
        break;
    }
  }
  
  function logout() {
    dispatch('logout');
  }
  
  function generateVideo() {
    alert('Generate clicked for: ' + userName);
  }
</script>

<div class="app">
  {/* Header */}
  <header class="header">
    <div class="left">
      <span class="logo">🎬 VisionMachine</span>
      <div class="layout-btns">
        <button class="btn {layoutMode === 'landscape' ? 'active' : ''}" onclick={() => setLayout('landscape')}>L</button>
        <button class="btn {layoutMode === 'portrait' ? 'active' : ''}" onclick={() => setLayout('portrait')}>P</button>
        <button class="btn {layoutMode === 'single' ? 'active' : ''}" onclick={() => setLayout('single')}>S</button>
      </div>
    </div>
    <div class="center"><h1>VisionMachine</h1></div>
    <div class="right">
      <button class="btn-ghost" onclick={logout}>Logout ({userName})</button>
    </div>
  </header>

  {/* Main Content */}
  <main class="main">
    {/* Projects Panel */}
    {#if showProjects}
      <aside class="panel projects">
        <div class="panel-header">Projects</div>
        <div class="panel-content">
          <div class="item active">🎬 My First Video</div>
          <div class="item">🎥 Product Demo</div>
          <div class="item">🎞️ Tutorial</div>
        </div>
      </aside>
    {/if}

    {/* Composer */}
    <section class="composer">
      <div class="header">
        <h2>Composer</h2>
        <button class="btn-primary" onclick={generateVideo}>Generate</button>
      </div>
      <div class="canvas">
        <div class="empty">
          <h3>Welcome, {userName}!</h3>
          <p>Click Generate to create your video</p>
        </div>
      </div>
      <div class="timeline">
        <div class="track">
          <span>Timeline</span>
          <div class="clips">
            <div class="clip">Shot 1</div>
            <div class="clip">Shot 2</div>
            <div class="clip">Shot 3</div>
          </div>
        </div>
      </div>
    </section>

    {/* Profile Panel */}
    {#if showProfile}
      <aside class="panel profile">
        <div class="panel-header">Profile</div>
        <div class="panel-content">
          <div class="user-card">
            <div class="avatar">{userName.charAt(0)}</div>
            <div>{userName}</div>
          </div>
        </div>
      </aside>
    {/if}

    {/* Tools Panel */}
    {#if showTools}
      <aside class="panel tools">
        <div class="panel-header">Tools</div>
        <div class="panel-content">
          <div class="item active">▶ Generator</div>
          <div class="item">🖼 Image</div>
          <div class="item">✏ Edit</div>
        </div>
      </aside>
    {/if}
  </main>
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: #1e1e1e;
    color: #d4d4d4;
  }
  
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 16px;
    background: #252526;
    border-bottom: 1px solid #3e3e42;
    height: 48px;
  }
  
  .left { display: flex; align-items: center; gap: 16px; }
  .logo { font-weight: 600; font-size: 16px; }
  .layout-btns { display: flex; gap: 4px; }
  .center { flex: 1; text-align: center; }
  .center h1 { margin: 0; font-size: 14px; font-weight: 500; color: #858585; }
  .right { display: flex; align-items: center; gap: 8px; }
  
  .main {
    display: flex;
    flex: 1;
    overflow: hidden;
  }
  
  .panel {
    display: flex;
    flex-direction: column;
    background: #252526;
    border-right: 1px solid #3e3e42;
    overflow: hidden;
  }
  
  .tools { border-left: 1px solid #3e3e42; border-right: none; }
  
  .panel-header {
    padding: 8px 12px;
    border-bottom: 1px solid #3e3e42;
    font-weight: 600;
    font-size: 13px;
  }
  
  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }
  
  .projects { width: 220px; }
  .profile { width: 200px; }
  .tools { width: 180px; }
  
  .item {
    padding: 8px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
  }
  
  .item:hover { background: #2d2d2d; }
  .item.active { background: #007acc; color: white; }
  
  .composer {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  
  .composer .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid #3e3e42;
  }
  
  .composer .header h2 { margin: 0; font-size: 14px; }
  
  .canvas {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  
  .empty { text-align: center; }
  .empty h3 { margin-bottom: 8px; }
  .empty p { color: #858585; margin-bottom: 24px; }
  
  .timeline {
    height: 80px;
    border-top: 1px solid #3e3e42;
    background: #252526;
  }
  
  .track {
    display: flex;
    height: 100%;
  }
  
  .track span {
    width: 80px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-right: 1px solid #3e3e42;
    font-size: 12px;
    color: #858585;
  }
  
  .clips {
    flex: 1;
    position: relative;
    padding: 8px;
  }
  
  .clip {
    position: absolute;
    height: 32px;
    background: #007acc;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    color: white;
    cursor: pointer;
  }
  
  .clip:nth-child(1) { left: 0%; width: 33%; }
  .clip:nth-child(2) { left: 33%; width: 33%; }
  .clip:nth-child(3) { left: 66%; width: 33%; }
  
  .user-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
  }
  
  .avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: #007acc;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
  }
  
  /* Buttons */
  .btn {
    padding: 4px 10px;
    border: 1px solid #3e3e42;
    background: #2d2d2d;
    color: #d4d4d4;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  }
  
  .btn:hover { background: #3e3e42; }
  .btn.active { background: #007acc; border-color: #007acc; color: white; }
  
  .btn-ghost {
    background: transparent;
    border: none;
    color: #d4d4d4;
    cursor: pointer;
    padding: 6px 12px;
    font-size: 13px;
  }
  
  .btn-ghost:hover { background: #2d2d2d; }
  
  .btn-primary {
    padding: 6px 16px;
    background: #007acc;
    border: none;
    color: white;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
  }
  
  .btn-primary:hover { background: #1a8adb; }
  
  /* Layout modes */
  .main.portrait .projects { width: 60px !important; }
  .main.single .projects,
  .main.single .profile,
  .main.single .tools { display: none; }
</style>
