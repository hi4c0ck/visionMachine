<script lang="ts">
  import type { SessionData, PipeRow } from '$types';
  import ComposerPanel from './ComposerPanel.svelte';

  let { session, onUpdate }: { session: SessionData | null; onUpdate: (session: SessionData) => void } = $props();

  // Handle pipe updates
  function handlePipeUpdate(pipes: PipeRow[]) {
    if (!session) return;
    onUpdate({
      ...session,
      pipes,
      updatedAt: Date.now(),
    });
  }
</script>

<div class="composer-container">
  {#if session}
    <ComposerPanel {session} onupdate={handlePipeUpdate} />
  {:else}
    <div class="composer-empty">
      <div class="composer-empty-icon">🎬</div>
      <h2>Select a Session</h2>
      <p>Choose or create a session from the project panel to start editing</p>
    </div>
  {/if}
</div>

<style>
  .composer-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--bg-primary, #1A1A1D);
  }

  .composer-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    color: var(--text-muted, #808080);
  }

  .composer-empty-icon {
    font-size: 64px;
    opacity: 0.5;
  }

  .composer-empty h2 {
    font-size: 24px;
    font-weight: 600;
    color: var(--text-primary, #EEEEEE);
  }

  .composer-empty p {
    font-size: 14px;
    max-width: 400px;
    text-align: center;
    line-height: 1.5;
  }
</style>
