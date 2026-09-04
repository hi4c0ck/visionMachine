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
		onorientationchange,
		unsynced = false
	} = $props<{
		session: SessionData | null;
		project: ProjectData | null;
		activeTool: string | null;
		onselect: (toolId: string) => void;
		ongenerate: () => void;
		onfpschange?: (fps: number) => void;
		onresolutionchange?: (resolution: string) => void;
		onorientationchange?: (orientation: string) => void;
		unsynced?: boolean;
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
		return compilePrompt(session.pipes[0]);
	});
</script>

<div class="tools-panel">
  <!-- Session Preview -->
  <div class="preview-section">
    <div class="section-header">
      <span class="section-title">Preview</span>
      {#if session}
        <button class="btn-generate" onclick={ongenerate} disabled={!session.pipes?.length}>
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
          {#if unsynced}
            <span class="unsynced-badge">Unsynced</span>
          {/if}
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

  <!-- Compiler Preview -->
  <div class="compiler-section">
    <div class="section-header">
      <span class="section-title">Compiler</span>
    </div>
    <div class="compiler-preview">
      {#if compiledOutput}
        <div class="compiler-output">{compiledOutput}</div>
      {:else}
        <div class="compiler-empty">No pipes to compile</div>
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
          <input type="range" min="5" max="30" step="1" value={session?.qValue ?? 18} class="setting-slider" onchange={(e) => onfpschange?.(Number(e.currentTarget.value))} />
          <span class="setting-value">{session?.qValue ?? 18}</span>
        </div>

        <div class="setting-row">
          <label class="setting-label">Creativity</label>
          <input type="range" min="0.5" max="15" step="0.5" value={session?.cValue ?? 7} class="setting-slider" onchange={(e) => onresolutionchange?.(e.currentTarget.value)} />
          <span class="setting-value">{session?.cValue ?? 7}</span>
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

  <!-- Modal for new session -->
  {#if showModal && project}
    <div class="modal-backdrop" onclick={closeNewSessionModal} role="presentation">
      <div class="modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="new-session-title">
        <div class="modal-header">
          <span class="modal-title" id="new-session-title">{APP_CONSTANTS.strings.createSessionModal}</span>
          <button class="modal-close" onclick={closeNewSessionModal} aria-label="Close">×</button>
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
    width: 260px;
    min-width: 220px;
    max-width: 300px;
    border-left: 1px solid var(--panel-right-border);
    background: var(--panel-right-bg);
    overflow: hidden;
  }

  /* Sections */
  .preview-section,
  .settings-section,
  .stats-section,
  .compiler-section {
    border-bottom: 1px solid var(--panel-right-border);
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    background: var(--panel-right-bg);
  }

  .section-title {
    font-size: 10px;
    font-weight: 700;
    color: var(--panel-right-text);
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }

  .btn-generate {
    padding: 7px 14px;
    background: var(--gradient-btn);
    color: #fff;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 11px;
    font-weight: 700;
    transition: all var(--transition-fast);
    box-shadow: 0 4px 16px var(--accent-glow);
    letter-spacing: 0.02em;
  }

  .btn-generate:hover {
    background: var(--gradient-btn-hover);
    box-shadow: 0 6px 24px var(--accent-glow);
    transform: translateY(-1px);
  }

  .btn-generate:active {
    transform: translateY(0);
  }

  .btn-generate:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }

  /* Preview */
  .preview-area {
    padding: 16px;
  }

  .preview-active,
  .preview-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 6px;
    padding: 12px 0;
  }

  .preview-icon {
    font-size: 32px;
    margin-bottom: 4px;
  }

  .preview-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
    word-break: break-word;
  }

  .preview-meta {
    font-size: 11px;
    color: var(--text-secondary);
    margin: 0;
  }

  .preview-empty p {
    font-size: 12px;
    color: var(--text-muted);
    margin: 4px 0;
  }

  .preview-empty .hint {
    font-size: 10px;
    color: var(--text-muted);
    opacity: 0.7;
  }

  /* Unsynced badge */
  .unsynced-badge {
    display: inline-block;
    margin-top: 8px;
    padding: 2px 8px;
    background: #fbbf24;
    color: #000;
    font-size: 10px;
    font-weight: 600;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* Compiler preview */
  .compiler-preview {
    padding: 10px 12px;
    max-height: 200px;
    overflow-y: auto;
  }

  .compiler-output {
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 10px;
    color: var(--text-secondary);
    white-space: pre-wrap;
    word-break: break-all;
    line-height: 1.5;
    background: var(--bg-primary);
    padding: 8px;
    border-radius: 4px;
    border: 1px solid var(--border);
  }

  .compiler-empty {
    padding: 10px 12px;
    text-align: center;
    color: var(--text-muted);
    font-size: 11px;
    font-style: italic;
  }

  /* Settings */
  .settings-content {
    padding: 12px;
  }

  .setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 12px;
  }

  .setting-label {
    font-size: 11px;
    color: var(--text-secondary);
    font-weight: 500;
    min-width: 70px;
  }

  .setting-select {
    flex: 1;
    padding: 6px 8px;
    background: var(--bg-tertiary);
    color: var(--text-primary);
    border: 1px solid var(--border);
    border-radius: 6px;
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .setting-select:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-glow);
  }

  .setting-slider {
    flex: 1;
    height: 4px;
    background: var(--bg-tertiary);
    border-radius: 2px;
    outline: none;
    -webkit-appearance: none;
  }

  .setting-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    background: var(--accent);
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 2px 6px var(--accent-glow);
  }

  .setting-value {
    font-size: 11px;
    color: var(--text-secondary);
    min-width: 24px;
    text-align: right;
  }

  .no-session-hint {
    padding: 16px;
    text-align: center;
  }

  .no-session-hint p {
    font-size: 11px;
    color: var(--text-muted);
    font-style: italic;
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
    padding: 10px;
    background: var(--bg-tertiary);
    border-radius: 8px;
    border: 1px solid var(--border);
  }

  .stat-value {
    font-size: 20px;
    font-weight: 700;
    color: var(--text-primary);
    line-height: 1;
    margin-bottom: 4px;
  }

  .stat-label {
    font-size: 10px;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 500;
  }

  /* Modal */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .modal {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 12px;
    width: 360px;
    max-width: 90vw;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    animation: modalIn 0.15s ease-out;
  }

  @keyframes modalIn {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid var(--border);
  }

  .modal-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .modal-close {
    width: 28px;
    height: 28px;
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text-secondary);
    font-size: 18px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--transition-fast);
  }

  .modal-close:hover {
    background: var(--bg-tertiary);
    border-color: var(--accent);
    color: var(--accent);
  }

  .modal-body {
    padding: 16px;
  }

  .form-label {
    display: block;
    font-size: 11px;
    color: var(--text-secondary);
    margin-bottom: 6px;
    font-weight: 500;
  }

  .modal-input {
    width: 100%;
    padding: 10px 12px;
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text-primary);
    font-size: 14px;
    font-family: inherit;
    transition: all var(--transition-fast);
    box-sizing: border-box;
  }

  .modal-input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-glow);
  }

  .modal-footer {
    padding: 12px 16px;
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  .btn-cancel {
    padding: 8px 16px;
    background: var(--bg-tertiary);
    color: var(--text-secondary);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-family: inherit;
    transition: all var(--transition-fast);
  }

  .btn-cancel:hover {
    background: var(--bg-hover);
    border-color: var(--border-light);
  }

  .btn-confirm {
    padding: 8px 16px;
    background: var(--gradient-accent);
    color: #fff;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    font-family: inherit;
    transition: all var(--transition-fast);
  }

  .btn-confirm:hover:not(:disabled) {
    box-shadow: var(--shadow-glow);
    transform: translateY(-1px);
  }

  .btn-confirm:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }
</style>
