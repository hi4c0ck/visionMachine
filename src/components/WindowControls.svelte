<script lang="ts">
	// Custom window controls for the decoration-less Tauri window
	// (tauri.conf.json "decorations": false). Rendered only in the real
	// desktop shell — in the web/E2E browser the page has its own chrome,
	// so isTauri() hides this cluster entirely (and the surrounding
	// rows/spacers simply stay empty drag space).
	//
	// Close goes through Window.close() → the same WindowEvent::CloseRequested
	// the OS × used to fire, so the backend close-guard (close-blocked
	// while a generation task is live, fail-safe watchdog) applies to the
	// custom button exactly as before.
	import { isTauri } from '@tauri-apps/api/core';
	import { getCurrentWindow } from '@tauri-apps/api/window';

	function act(action: 'minimize' | 'maximize' | 'close') {
		if (!isTauri()) return;
		const win = getCurrentWindow();
		if (action === 'minimize') void win.minimize();
		else if (action === 'maximize') void win.toggleMaximize();
		else void win.close();
	}
</script>

{#if isTauri()}
	<div class="win-ctrls" role="group" aria-label="Window controls">
		<button type="button" class="wc-btn wc-min" title="Minimize" aria-label="Minimize"
			onclick={() => act('minimize')}><span class="wc-glyph wc-glyph-min" aria-hidden="true"></span></button>
		<button type="button" class="wc-btn wc-max" title="Maximize / restore" aria-label="Maximize or restore"
			onclick={() => act('maximize')}><span class="wc-glyph wc-glyph-max" aria-hidden="true"></span></button>
		<button type="button" class="wc-btn wc-close" title="Close" aria-label="Close"
			onclick={() => act('close')}><span class="wc-glyph wc-glyph-close" aria-hidden="true"></span></button>
	</div>
{/if}

<style>
	.win-ctrls {
		display: flex;
		align-items: center;
		height: 100%;
	}

	.wc-btn {
		position: relative;
		width: 34px;
		height: 30px;
		margin-left: 1px;
		background: transparent;
		border: none;
		border-radius: 5px;
		color: var(--text-secondary);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background var(--transition-fast), color var(--transition-fast);
	}

	.wc-btn:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}

	.wc-btn:focus-visible {
		outline: 1px solid var(--accent);
		outline-offset: -1px;
	}

	/* Close: the quiet red convention, without the loud fill. */
	.wc-close:hover {
		background: color-mix(in srgb, #ef4444 14%, transparent);
		color: var(--text-primary);
	}
	.wc-close:hover .wc-glyph-close::before,
	.wc-close:hover .wc-glyph-close::after {
		background: #ef4444;
	}

	/* ── CSS-drawn glyphs (no sprite dependency) ── */
	.wc-glyph {
		position: relative;
		display: block;
		width: 10px;
		height: 10px;
		color: var(--text-secondary);
	}

	.wc-glyph-min::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 1.5px;
		background: currentColor;
	}

	.wc-glyph-max::after {
		content: '';
		position: absolute;
		inset: 0;
		border: 1.5px solid currentColor;
		border-radius: 1px;
	}

	.wc-glyph-close::before,
	.wc-glyph-close::after {
		content: '';
		position: absolute;
		left: 50%;
		top: 50%;
		width: 12px;
		height: 1.5px;
		background: currentColor;
	}
	.wc-glyph-close::before { transform: translate(-50%, -50%) rotate(45deg); }
	.wc-glyph-close::after { transform: translate(-50%, -50%) rotate(-45deg); }

	.wc-btn:hover .wc-glyph { color: var(--text-primary); }
	.wc-close:hover .wc-glyph { color: var(--text-primary); }
</style>
