<script lang="ts">
  // Main App Component - Assembles all sections
  import Titlebar from '$components/Titlebar.svelte';
  import ProjectSidebar from '$components/ProjectSidebar.svelte';
  import AnimatedScene from '$components/AnimatedScene.svelte';
  import ComposerSection from '$components/ComposerSection.svelte';
  import ArtifactsPanel from '$components/ArtifactsPanel.svelte';
  
  // State
  let sidebarCollapsed = $state(false);
  let artifactsCollapsed = $state(false);
  let sceneMode = $state<'project' | 'default'>('project');
</script>

<div class="app-container">
  <!-- Titlebar -->
  <Titlebar />
  
  <!-- Main Layout -->
  <div class="app-body">
    <!-- Left: Project Sidebar -->
    <ProjectSidebar bind:collapsed={sidebarCollapsed} />
    
    <!-- Center: Content Area -->
    <div class="content-area">
      <!-- Top: Animated Scene (~150px, ~15% of height) -->
      <AnimatedScene 
        mode={sceneMode}
        sceneIndex={0}
        isPlaying={true}
      />
      
      <!-- Middle: Composer Section -->
      <ComposerSection 
        on:addTexture={() => console.log('Add texture')}
      />
    </div>
    
    <!-- Right: Artifacts Panel -->
    <ArtifactsPanel 
      bind:collapsed={artifactsCollapsed}
      on:refresh={() => console.log('Refresh artifacts')}
    />
  </div>
</div>

<style>
  :global(*) {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  
  :global(body) {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--color-bg-primary);
    color: var(--color-text-primary);
    overflow: hidden;
  }
  
  :root {
    --color-bg-primary: #0a0a0a;
    --color-bg-secondary: #141414;
    --color-bg-tertiary: #1e1e1e;
    --color-bg-hover: #252525;
    --color-border: #2a2a2a;
    --color-border-hover: #3a3a3a;
    
    --color-text-primary: #ffffff;
    --color-text-secondary: #a0a0a0;
    --color-text-muted: #666666;
    
    --color-accent: #6366f1;
    --color-accent-hover: #4f46e5;
    --color-accent-light: rgba(99, 102, 241, 0.1);
    
    --color-success: #22c55e;
    --color-warning: #f59e0b;
    --color-error: #ef4444;
    
    --space-xs: 4px;
    --space-sm: 8px;
    --space-md: 16px;
    --space-lg: 24px;
    --space-xl: 32px;
    
    --radius-sm: 4px;
    --radius-md: 8px;
    --radius-lg: 12px;
    
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
    --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
    --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.5);
  }
  
  .app-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
  }
  
  .app-body {
    display: flex;
    flex: 1;
    overflow: hidden;
  }
  
  .content-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
  }
</style>
