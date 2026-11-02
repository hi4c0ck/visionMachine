<script lang="ts">
	// Shared resizable text block (design §2). Geometry mirrors the modal
	// textareas (.modal-textarea: resize: vertical). Features:
	//   • generation icon overlapped bottom-right; when the last typed line
	//     comes within its 16px no-text zone it scales down (sin-tweened),
	//     never covering a glyph.
	//   • lock (header, right of label): after a generation completes the
	//     block auto-locks + collapses to one line; editing requires a manual
	//     unlock (anti-accidental-regen guarantee).
	//   • word-floor footer (only when a `floor` is supplied — honest, no
	//     invented data).
	// All motion = --transition-sin (additive token, design §6).

	let {
		label,
		value = $bindable(),
		generating = false,
		locked = false,
		onRun,
		floor = null,
	} = $props<{
		label: string;
		value: string;
		generating?: boolean;
		locked?: boolean;
		onRun: () => void;
		/** Expand-floor in words; null = no floor status shown. */
		floor?: number | null;
	}>();

	let textareaEl: HTMLTextAreaElement | null = $state(null);
	// True when the content nears the icon's 16px corner zone → scale the
	// icon down so text keeps its space.
	let nearIcon = $state(false);
	let readOnlyExpanded = $state(false); // user expanded a locked block
	let manuallyUnlocked = $state(false); // user re-activated editing
	let expanded = $state(!locked || value.length > 0);

	let prevLocked = $state(locked);

	// Word count (live) + below-floor flag.
	const words = $derived(value.trim() ? value.trim().split(/\s+/).length : 0);
	const belowFloor = $derived(floor !== null && words < floor);

	const canEdit = $derived(!locked || manuallyUnlocked);

	// Auto-collapse on the false→true lock transition (unless the user has
	// already re-unlocked this session).
	$effect(() => {
		if (locked && !prevLocked && !manuallyUnlocked) expanded = false;
		prevLocked = locked;
	});
	// Manual unlock re-expands so the user can edit.
	$effect(() => {
		if (manuallyUnlocked) expanded = true;
	});

	// The collapsed view is a one-line read-only affordance: clicking it
	// expands (read-only while locked, editable once re-unlocked).
	function toggleExpanded() {
		expanded = !expanded;
		readOnlyExpanded = true;
	}

	// The lock control toggles manual re-activation (only meaningful when
	// locked). When not locked the block is already fully editable.
	function toggleLock() {
		if (!locked) return;
		manuallyUnlocked = !manuallyUnlocked;
	}

	// Detect whether the textarea content overflows toward the bottom-right
	// corner (where the icon sits) → reserve the icon's space by scaling it.
	$effect(() => {
		const el = textareaEl;
		if (!el) return;
		const update = () => {
			nearIcon = el.scrollHeight - el.clientHeight > 8;
		};
		update();
		const ro = new ResizeObserver(update);
		ro.observe(el);
		el.addEventListener('input', update);
		return () => {
			ro.disconnect();
			el.removeEventListener('input', update);
		};
	});

	function run() {
		if (generating || !canEdit) return;
		onRun();
	}
</script>

<div class="text-block {locked ? 'is-locked' : ''} {nearIcon ? 'near-icon' : ''}">
	<header class="tb-header">
		<span class="tb-label">{label}</span>
		<button
			class="lock {canEdit ? 'lock-open' : 'lock-closed'}"
			onclick={toggleLock}
			disabled={!locked}
			aria-label={canEdit ? 'unlocked' : 'locked'}
			title={locked ? (manuallyUnlocked ? 'tap to re-lock' : 'locked — tap to edit') : ''}
		>
			<!-- padlock: open vs closed shackle -->
			<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
				{#if canEdit}
					<path class="shackle" d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" />
				{:else}
					<path class="shackle" d="M5 7V5a3 3 0 0 1 6 0v2" fill="none" />
				{/if}
				<rect class="body" x="3" y="7" width="10" height="7" rx="1" />
			</svg>
		</button>
	</header>

	{#if expanded}
		<div class="tb-field">
			<textarea
				bind:this={textareaEl}
				bind:value
				class="tb-textarea"
				disabled={!canEdit || generating}
				rows="4"
				aria-label={label}
			></textarea>

			<button
				class="gen-icon {generating ? 'is-generating' : ''}"
				onclick={run}
				disabled={generating || !canEdit}
				aria-label={generating ? 'generating' : 'run generation'}
			>
				{#if generating}
					<span class="gen-ring" aria-hidden="true"></span>
				{:else}
					<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
						<circle cx="10" cy="10" r="7" fill="none" />
						<circle cx="10" cy="10" r="2.5" />
					</svg>
				{/if}
			</button>
		</div>
	{:else}
		<!-- Collapsed one-line, read-only affordance (click to expand). -->
		<div
			class="tb-collapsed"
			onclick={toggleExpanded}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					toggleExpanded();
				}
			}}
			role="button"
			tabindex="0"
		>
			<span class="tb-collapsed-text">{value.trim() || '(empty)'}</span>
			<span class="tb-collapsed-meta">
				{locked ? (manuallyUnlocked ? 'unlocked' : 'locked') : 'click to expand'}
			</span>
		</div>
	{/if}

	<footer class="tb-footer">
		<span class="tb-words">{words} words</span>
		{#if floor !== null}
			<span class:warn={belowFloor}>
				{belowFloor ? `below floor (${floor})` : `floor ${floor} ✓`}
			</span>
		{/if}
	</footer>
</div>

<style>
	/* Template A: continuous surface, hairlines, quiet. No new colors.
	   Motion = --transition-sin (additive token, design §6). */

	.text-block {
		display: flex;
		flex-direction: column;
		gap: 6px;
		/* Native form chrome follows the app theme (color-scheme is set per
		   [data-theme] in design-system.css — don't pin it to dark here). */
	}

	.tb-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.tb-label {
		font-size: 12px;
		font-weight: 500;
		color: var(--text-secondary);
	}

	/* ── Lock control (right of label) ── */
	.lock {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: 1px solid transparent;
		border-radius: 5px;
		padding: 3px;
		cursor: pointer;
		color: var(--text-secondary);
		transition: color var(--transition-sin, 0.3s),
			border-color var(--transition-sin, 0.3s);
	}

	.lock:disabled {
		cursor: default;
		color: var(--text-muted);
	}

	.lock:not(:disabled):hover {
		border-color: var(--border-color);
		color: var(--text-primary);
	}
	.lock:focus-visible {
		outline: none;
		border-color: var(--accent-color);
		box-shadow: 0 0 0 3px var(--accent-bg, rgba(89, 181, 255, 0.25));
	}

	.lock-closed .shackle {
		/* Closed padlock: shackle engaged (drawn solid). */
		stroke: currentColor;
		stroke-width: 1.6;
	}

	.lock-open .shackle {
		/* Open padlock: raise the shackle. */
		stroke: currentColor;
		stroke-width: 1.6;
		transform: translateY(-1px);
		transform-origin: 11px 7px;
		transition: transform var(--transition-sin, 0.4s);
	}

	.lock-open .body {
		fill: transparent;
	}

	.lock-closed .body {
		fill: currentColor;
	}

	/* ── Editable field + overlapped generation icon ── */
	.tb-field {
		position: relative;
	}

	.tb-textarea {
		width: 100%;
		min-height: calc(4 * 1.5em);
		max-height: 40vh;
		resize: vertical;
		box-sizing: border-box;
		font: inherit;
		font-size: 13px;
		line-height: 1.5;
		color: var(--text-primary);
		background: var(--bg-tertiary);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		/* Reserve the icon's 16px no-text zone on the right + bottom so
		   text never runs under it at full icon size. */
		padding: 8px 44px 24px 8px;
		transition: border-color var(--transition-sin, 0.3s),
			box-shadow var(--transition-sin, 0.3s);
	}

	.tb-textarea:focus {
		outline: none;
		border-color: var(--accent-color);
		box-shadow: 0 0 0 3px var(--accent-bg, rgba(89, 181, 255, 0.25));
	}

	.tb-textarea:disabled {
		opacity: 0.7;
		resize: none;
	}

	.gen-icon {
		position: absolute;
		right: 10px;
		bottom: 10px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		padding: 0;
		background: var(--bg-elevated);
		border: 1px solid var(--border-color);
		border-radius: 7px;
		color: var(--accent-color);
		cursor: pointer;
		/* 16px no-text zone clearance rule: when content nears the corner,
		   scale the icon down (sin-tweened) so it keeps reserving space. */
		transform: scale(1);
		transform-origin: bottom right;
		transition: transform var(--transition-sin, 0.4s),
			opacity var(--transition-sin, 0.4s),
			border-color var(--transition-sin, 0.4s);
	}
	.gen-icon:focus-visible {
		outline: none;
		border-color: var(--accent-color);
		box-shadow: 0 0 0 3px var(--accent-bg, rgba(89, 181, 255, 0.25));
	}

	.near-icon .gen-icon {
		transform: scale(0.62);
	}

	.gen-icon:hover:not(:disabled) {
		border-color: var(--accent-color);
	}

	.gen-icon:disabled {
		cursor: default;
	}

	/* Progress ring while generating: thin accent ring, slow constant spin. */
	.gen-ring {
		width: 16px;
		height: 16px;
		border-radius: 50%;
		border: 2px solid var(--accent-bg, rgba(89, 181, 255, 0.25));
		border-top-color: var(--accent-color, #59b5ff);
		animation: spin 1.4s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* ── Collapsed one-line read-only affordance ── */
	.tb-collapsed {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 8px;
		background: var(--bg-tertiary);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		cursor: pointer;
		transition: border-color var(--transition-sin, 0.3s),
			box-shadow var(--transition-sin, 0.3s);
	}

	.tb-collapsed:hover {
		border-color: var(--accent-color);
	}
	.tb-collapsed:focus-visible {
		outline: none;
		border-color: var(--accent-color);
		box-shadow: 0 0 0 3px var(--accent-bg, rgba(89, 181, 255, 0.25));
	}

	.tb-collapsed-text {
		flex: 1;
		font-size: 12px;
		color: var(--text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.tb-collapsed-meta {
		flex-shrink: 0;
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--text-muted);
	}

	/* ── Footer: word count + floor status ── */
	.tb-footer {
		display: flex;
		gap: 12px;
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--text-muted);
	}

	.tb-footer .warn {
		color: var(--warning-color);
	}

	/* Respect the user's motion preference (design doc §6 is additive,
	   not load-bearing): the sine tweens + spin collapse to instant. */
	@media (prefers-reduced-motion: reduce) {
		.gen-ring {
			animation: none;
		}
		.lock-open .shackle,
		.gen-icon,
		.tb-textarea,
		.tb-collapsed {
			transition: none !important;
		}
	}
</style>
