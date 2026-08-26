<script lang="ts">
	import type { SessionData, ProjectData } from '$types';
	import { APP_CONSTANTS } from '$constants';
	import { compilePrompt } from '$lib/compiler';

	let { 
		session, 
		project, 
		activeTool,
		onselect,
		ongenerate,
		onfpschange,
		onresolutionchange,
		onorientationchange
	} = $props<{
		session: SessionData | null;
		project: ProjectData | null;
		activeTool: string | null;
		onselect: (toolId: string) => void;
		ongenerate: () => void;
		onfpschange?: (fps: number) => void;
		onresolutionchange?: (resolution: string) => void;
		onorientationchange?: (orientation: string) => void;
	}>();

	let showModal = $state(false);
	let newSessionName = $state('');

	function openNewSessionModal() {
		if (!project) return;
		newSessionName = '';
		showModal = true;
	}

	function closeNewSessionModal() {
		showModal = false;
	}

	function confirmNewSession() {
		if (!newSessionName.trim() || !project) return;
		// This will be handled by the parent
		console.log('[ToolsPanel] Create session:', newSessionName);
		closeNewSessionModal();
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			confirmNewSession();
		}
	}

	function getStats() {
		if (!session) {
			return {
				sessions: project?.sessions.length || 0,
				pipes: 0,
				frames: 0,
				generations: project?.totalGenerations || 0,
			};
		}
		
		return {
			sessions: project?.sessions.length || 0,
			pipes: session?.pipes?.length ?? 0,
			frames: (session?.pipes ?? []).reduce((acc, p) => acc + (p?.lengthFrames || 0), 0),
			generations: session.totalGeneratedFrames,
		};
	}

	const stats = $derived(getStats());

	// T6: Compiled prompt output (T6)
	const compiledOutput = $derived.by(() => {
		if (!session?.pipes?.length) return '';
		// Use first pipe for compilation preview
		return compilePrompt(session.pipes[0]);
	});
</script>

<div class="tools-panel">
  <!-- Session Preview -->
  <div class="preview-section">
    <div class="section-header">
      <span class="section-title">Preview</span>
      {#if session}
        <button class="btn-generate" onclick={ongenerate}>
          {APP_CONSTANTS.strings.generate}
        </button>
      {/if}
    </div>
    <div class="preview-area">
      {#if session}
        <div class="preview-active">
          <div class="preview-icon">🎬</div>
          <p class="preview-name">{session.name}</p>
          <p class="preview-meta">{session?.pipes?.length ?? 0} pipes · {stats.frames}f</p>
        </div>
      {:else}
        <div class="preview-empty">
          <div class="preview-icon">🎬</div>
          <p>No preview available</p>
          <p class="hint">Select a session to see preview</p>
        </div>
      {/if}
    </div>
  </div>

  <!-- Settings -->
  <div class="settings-section">
    <div class="section-header">
      <span class="section-title">{APP_CONSTANTS.strings.settings}</span>
    </div>
    
    {#if session}
      <div class="settings-content">
        <div class="setting-row">
          <label class="setting-label">FPS</label>
          <select 
            class="setting-select"
            value={session.fps}
            onchange={(e) => onfpschange?.(Number(e.currentTarget.value))}
          >
            <option value="24">24 fps</option>
            <option value="30">30 fps</option>
            <option value="60">60 fps</option>
          </select>
        </div>

        <div class="setting-row">
          <label class="setting-label">Resolution</label>
          <select 
            class="setting-select"
            value={session.resolution}
            onchange={(e) => onresolutionchange?.(e.currentTarget.value)}
          >
            <option value="480p">480p</option>
            <option value="720p">720p</option>
            <option value="1080p">1080p</option>
          </select>
        </div>

        <div class="setting-row">
          <label class="setting-label">Orientation</label>
          <select 
            class="setting-select"
            value={session.orientation}
            onchange={(e) => onorientationchange?.(e.currentTarget.value)}
          >
            <option value="horizontal">Horizontal</option>
            <option value="vertical">Vertical</option>
          </select>
        </div>

        <div class="setting-row">
          <label class="setting-label">Quality</label>
          <input type="range" min="5" max="30" step="1" value="18" class="setting-slider" />
          <span class="setting-value">18</span>
        </div>

        <div class="setting-row">
          <label class="setting-label">Creativity</label>
          <input type="range" min="0.5" max="15" step="0.5" value="7" class="setting-slider" />
          <span class="setting-value">7</span>
        </div>
      </div>
    {:else}
      <div class="no-session-hint">
        <p>Select a session to configure settings</p>
      </div>
    {/if}
  </div>

  <!-- Stats -->
  <div class="stats-section">
    <div class="section-header">
      <span class="section-title">{APP_CONSTANTS.strings.stats}</span>
    </div>
    
    <div class="stats-content">
      <div class="stat-item">
        <span class="stat-value">{stats.sessions}</span>
        <span class="stat-label">Sessions</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">{stats.pipes}</span>
        <span class="stat-label">Pipes</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">{stats.frames}</span>
        <span class="stat-label">Frames</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">{stats.generations}</span>
        <span class="stat-label">Generations</span>
      </div>
    </div>
  </div>

  <!-- New Session Modal -->
  {#if showModal && project}
    <div class="modal-backdrop" onclick={closeNewSessionModal}>
      <div class="modal" onclick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <span class="modal-title">Create New Session</span>
          <button class="modal-close" onclick={closeNewSessionModal}>×</button>
        </div>
        
        <div class="modal-body">
          <label class="form-label">Session Name</label>
          <input 
            type="text" 
            class="modal-input"
            bind:value={newSessionName}
            placeholder="Enter session name..."
            onkeydown={handleKeyDown}
          />
        </div>
        
        <div class="modal-footer">
          <button class="btn-cancel" onclick={closeNewSessionModal}>{APP_CONSTANTS.strings.cancel}</button>
          <button 
            class="btn-confirm" 
            disabled={!newSessionName.trim()}
            onclick={confirmNewSession}
          >
            {APP_CONSTANTS.strings.create}
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .tools-panel {
    display: flex;
    flex-direction: column;
    width: 280px;
    min-width: 240px;
    max-width: 320px;
    border-left: 1px solid var(--border-color, #4E525A);
    background: var(--bg-secondary, #2A2A2E);
    overflow: hidden;
  }

  /* Sections */
  .preview-section,
  .settings-section,
  .stats-section {
    border-bottom: 1px solid var(--border-color, #3A3A3F);
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    background: var(--bg-tertiary, #3A3A3F);
  }

  .section-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted, #808080);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .btn-generate {
    padding: 6px 12px;
    background: var(--accent-primary, #59B5FF);
    color: #fff;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    font-weight: 500;
    transition: all 0.15s;
  }

  .btn-generate:hover {
    background: var(--accent-primary-hover, #7EC8FF);
    transform: translateY(-1px);
  }

  .btn-generate:active {
    transform: translateY(0);
  }

  /* Preview Area */
  .preview-area {
    padding: 16px;
    min-height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .preview-active {
    text-align: center;
  }

  .preview-icon {
    font-size: 32px;
    margin-bottom: 8px;
  }

  .preview-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary, #EEEEEE);
    margin-bottom: 4px;
  }

  .preview-meta {
    font-size: 11px;
    color: var(--text-muted, #808080);
  }

  .preview-empty {
    text-align: center;
    color: var(--text-muted, #606060);
  }

  .preview-empty .preview-icon {
    font-size: 24px;
    opacity: 0.5;
    margin-bottom: 8px;
  }

  .preview-empty p {
    font-size: 12px;
    margin: 4px 0;
  }

  .preview-empty .hint {
    font-size: 11px;
    color: var(--text-muted, #606060);
  }

  /* Settings */
  .settings-content {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .setting-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .setting-label {
    font-size: 11px;
    color: var(--text-muted, #808080);
    min-width: 70px;
  }

  .setting-select {
    flex: 1;
    padding: 6px 8px;
    background: var(--bg-primary, #1A1A1D);
    border: 1px solid var(--border-color, #3A3A3F);
    border-radius: 4px;
    color: var(--text-primary, #EEEEEE);
    font-size: 11px;
    cursor: pointer;
  }

  .setting-select:focus {
    outline: none;
    border-color: var(--accent-primary, #59B5FF);
  }

  .setting-slider {
    flex: 1;
    height: 4px;
    appearance: none;
    background: var(--bg-primary, #1A1A1D);
    border-radius: 2px;
    outline: none;
  }

  .setting-slider::-webkit-slider-thumb {
    appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--accent-primary, #59B5FF);
    cursor: pointer;
  }

  .setting-value {
    font-size: 11px;
    color: var(--text-muted, #808080);
    min-width: 24px;
    text-align: right;
    font-family: monospace;
  }

  .no-session-hint {
    padding: 20px;
    text-align: center;
    color: var(--text-muted, #606060);
    font-size: 12px;
  }

  /* Stats */
  .stats-content {
    padding: 12px;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 12px;
    background: var(--bg-tertiary, #3A3A3F);
    border-radius: 6px;
  }

  .stat-value {
    font-size: 20px;
    font-weight: 600;
    color: var(--accent-primary, #59B5FF);
  }

  .stat-label {
    font-size: 10px;
    color: var(--text-muted, #808080);
    text-transform: uppercase;
    margin-top: 4px;
  }

  /* Modal */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: var(--bg-secondary, #2A2A2E);
    border: 1px solid var(--border-color, #4E525A);
    border-radius: 8px;
    width: 360px;
    max-width: 90vw;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 16px;
    border-bottom: 1px solid var(--border-color, #3A3A3F);
  }

  .modal-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary, #EEEEEE);
  }

  .modal-close {
    background: none;
    border: none;
    color: var(--text-muted, #808080);
    font-size: 20px;
    cursor: pointer;
  }

  .modal-body {
    padding: 14px 16px;
  }

  .form-label {
    font-size: 11px;
    color: var(--text-muted, #808080);
    font-weight: 600;
    text-transform: uppercase;
    margin-bottom: 8px;
    display: block;
  }

  .modal-input {
    width: 100%;
    padding: 10px 12px;
    background: var(--bg-tertiary, #3A3A3F);
    border: 1px solid var(--border-color, #3A3A3F);
    border-radius: 4px;
    color: var(--text-primary, #EEEEEE);
    font-size: 13px;
    box-sizing: border-box;
  }

  .modal-input:focus {
    outline: none;
    border-color: var(--accent-primary, #59B5FF);
  }

  .modal-footer {
    padding: 12px 16px;
    border-top: 1px solid var(--border-color, #3A3A3F);
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  .btn-cancel {
    padding: 8px 18px;
    background: var(--bg-tertiary, #3A3A3F);
    color: var(--text-secondary, #BFBFBF);
    border: 1px solid var(--border-color, #3A3A3F);
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
  }

  .btn-cancel:hover {
    background: var(--bg-hover, #3A3A3F);
  }

  .btn-confirm {
    padding: 8px 18px;
    background: var(--accent-primary, #59B5FF);
    color: #fff;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
  }

  .btn-confirm:hover:not(:disabled) {
    background: var(--accent-primary-hover, #7EC8FF);
  }

    .btn-confirm:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* T6: Compiled Panel */
  .compiled-section {
    border-bottom: 1px solid var(--border-color, #3A3A3F);
  }

  .compiled-panel {
    padding: 12px;
  }

  .compiled-panel summary {
    font-size: 12px;
    color: var(--text-muted, #808080);
    cursor: pointer;
    margin-bottom: 8px;
  }

  .compiled-output {
    font-family: monospace;
    font-size: 11px;
    background: var(--bg-primary, #1A1A1D);
    padding: 10px;
    border-radius: 4px;
    overflow-x: auto;
    white-space: pre-wrap;
    color: var(--text-primary, #EEEEEE);
    max-height: 200px;
    overflow-y: auto;
    margin-bottom: 8px;
  }

  .btn-copy {
    width: 100%;
    padding: 6px 12px;
    background: var(--bg-input, #3c3c3c);
    color: var(--text-muted, #808080);
    border: 1px solid var(--border-color, #555);
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    transition: all 0.15s;
  }

  .btn-copy:hover {
    background: var(--bg-hover, #454545);
    color: var(--text-primary, #fff);
  }
</style>