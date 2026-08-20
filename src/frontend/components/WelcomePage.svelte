<script>
  import { createEventDispatcher } from 'svelte';
  
  const dispatch = createEventDispatcher();
  
  function startProject() {
    dispatch('start');
  }
  
  function loadComposer(sessionId) {
    dispatch('load-composer', sessionId);
  }
</script>

<div class="welcome">
  <div class="welcome-content">
    <div class="logo">
      <div class="logo-icon">🎬</div>
      <h1>VisionMachine</h1>
    </div>
    
    <p class="tagline">AI-Powered Video Generation Desktop</p>
    
    <div class="features">
      <div class="feature">
        <div class="feature-icon">🎨</div>
        <h3>Dual Composer</h3>
        <p>Manage multiple composition instances simultaneously</p>
      </div>
      <div class="feature">
        <div class="feature-icon">⚡</div>
        <h3>Fast Generation</h3>
        <p>Optimized pipeline for rapid video frame generation</p>
      </div>
      <div class="feature">
        <div class="feature-icon">🔒</div>
        <h3>Local First</h3>
        <p>All processing happens locally on your machine</p>
      </div>
    </div>
    
    <button class="cta-btn" on:click={startProject}>
      Start Creating
    </button>
  </div>
</div>

<style>
  .welcome {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  }
  
  .welcome-content {
    text-align: center;
    max-width: 600px;
    padding: 40px;
  }
  
  .logo {
    margin-bottom: 32px;
  }
  
  .logo-icon {
    font-size: 64px;
    margin-bottom: 16px;
  }
  
  .logo h1 {
    margin: 0;
    color: #fff;
    font-size: 42px;
    font-weight: 700;
  }
  
  .tagline {
    color: #888;
    font-size: 18px;
    margin: 16px 0 48px;
  }
  
  .features {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
    margin-bottom: 48px;
  }
  
  .feature {
    padding: 20px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }
  
  .feature-icon {
    font-size: 32px;
    margin-bottom: 12px;
  }
  
  .feature h3 {
    margin: 0 0 8px;
    color: #fff;
    font-size: 16px;
  }
  
  .feature p {
    margin: 0;
    color: #888;
    font-size: 12px;
    line-height: 1.5;
  }
  
  .cta-btn {
    padding: 14px 40px;
    background: #4a9eff;
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .cta-btn:hover {
    background: #3a8eef;
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(74, 158, 255, 0.3);
  }
</style>
