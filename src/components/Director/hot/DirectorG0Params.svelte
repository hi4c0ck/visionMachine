<script lang="ts">
	// Front-loaded G0 seed parameters (the knobs that STEER a generation).
	// Presentational child of DirectorHotPath — all state is parent-owned via
	// the $bindable `entry`; this component only renders the controls and
	// writes back through the binding. Disabled while a run is in flight.
	//
	// These used to live INSIDE the Advanced disclosure (engine-gated), so
	// they were only reachable AFTER a run completed. Several of them are
	// pre-generation specific (they shape the next run), so the panel now
	// front-loads them into the hot path, always visible.
	import {
		GENRE_PRESETS,
		RATIOS,
		VOCAB,
		type EngineEntryInput,
	} from '$lib/directorStore/engine';
	import MoodSlider from '../adv/MoodSlider.svelte';

	let {
		entry = $bindable(),
		disabled = false,
	} = $props<{
		/** The G0 entry (parent-owned; every control writes back here). */
		entry: EngineEntryInput;
		/** While a run is in flight the seed params are read-only. */
		disabled?: boolean;
	}>();
	// B10: the structure chip's expansion state (scenes × shots number
	// inputs live under the chip — the chip is the compact face).
	let structOpen = $state(false);
</script>

<!-- ── ② DIRECTION PARAMETERS — the pre-generation knobs, front-loaded ──
	     Always visible (not engine-gated): mood, format, scale, time & weather
	     all shape the NEXT run, so they must be reachable before it finishes. -->
<section class="stage params" aria-label="Direction parameters" class:is-disabled={disabled}>
	<h3 class="block-heading">
		② DIRECTION PARAMETERS <span class="muted">· steer the next run</span>
	</h3>
	<div class="g0-grid">
		<!-- B10: mood — compact inline control (label + ~250px slider +
		     band name). No longer spans the full grid row. -->
		<div class="field mood-compact">
			<MoodSlider bind:mood={entry.mood} />
		</div>

		<label class="field">
			<span class="field-label">title</span>
			<input bind:value={entry.title} placeholder="optional film title (defaults from the idea)" disabled={disabled} />
		</label>

		<label class="field">
			<span class="field-label">time of day</span>
			<select bind:value={entry.time_of_day} disabled={disabled}>
				{#each VOCAB.time_of_day as t}<option value={t}>{t}</option>{/each}
			</select>
		</label>

		<!-- B10: look compound — genre + style in one cell/row. Same two
		     bindings as before (entry.genre.name / entry.genre.style). -->
		<div class="field look-field">
			<span class="field-label">look · genre + style</span>
			<div class="look-row">
				<select aria-label="genre" bind:value={entry.genre.name} disabled={disabled}>
					{#each GENRE_PRESETS as g}<option value={g.name}>{g.name}</option>{/each}
				</select>
				<input aria-label="style" bind:value={entry.genre.style} placeholder="visual style string" disabled={disabled} />
			</div>
		</div>

		<label class="field">
			<span class="field-label">weather</span>
			<input bind:value={entry.weather} placeholder="clear, brief clouds, …" disabled={disabled} />
		</label>

		<!-- B10: structure chip — scenes × shots in one control; click
		     expands the two number inputs (same scale bindings). -->
		<div class="field struct-cell">
			<span class="field-label">structure</span>
			<button
				type="button"
				class="struct-chip"
				title="Click to edit scene / shot counts"
				aria-expanded={structOpen}
				disabled={disabled}
				onclick={() => (structOpen = !structOpen)}>
				<code>{entry.scale.scenes}×{entry.scale.shots_per_scene}</code>
				<span class="struct-chip-sub">scenes × shots</span>
			</button>
			{#if structOpen}
				<div class="struct-edit">
					<input type="number" min="1" max="24" aria-label="scenes" bind:value={entry.scale.scenes} disabled={disabled} />
					<span aria-hidden="true">×</span>
					<input type="number" min="1" max="5" aria-label="shots per scene" bind:value={entry.scale.shots_per_scene} disabled={disabled} />
				</div>
			{/if}
		</div>

		<label class="field">
			<span class="field-label">ratio</span>
			<select bind:value={entry.ratio} disabled={disabled}>
				{#each RATIOS as r}<option value={r}>{r}</option>{/each}
			</select>
		</label>

		<label class="field">
			<span class="field-label">clip_s</span>
			<span class="clip-range">
				<input type="number" min="4" max="12" bind:value={entry.scale.clip_s[0]} disabled={disabled} />–
				<input type="number" min="4" max="12" bind:value={entry.scale.clip_s[1]} disabled={disabled} />
			</span>
		</label>
	</div>
</section>

<style>
	/* Template A: continuous surface, hairlines, quiet, no new color families.
	   The parameter panel reads as one tidy card in the hot path. */
	.params {
		border-top: none;
		border: 1px solid var(--border-color);
		border-radius: 12px;
		background: var(--bg-secondary);
		padding: 14px 16px;
		gap: 10px;
		box-shadow: var(--shadow-sm, none);
	}
	.params.is-disabled {
		opacity: 0.6;
	}
	.params.is-disabled .field input,
	.params.is-disabled .field select {
		pointer-events: none;
	}

	/* Section heading: quiet hairline text + the theme's accent tick. */
	.block-heading {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.02em;
		color: var(--text-secondary);
		margin: 0;
	}
	.block-heading::before {
		content: '';
		flex-shrink: 0;
		width: 3px;
		height: 12px;
		border-radius: 2px;
		background: var(--gradient-accent, var(--accent-color));
	}
	.block-heading .muted {
		font-weight: 400;
		color: var(--text-muted);
		letter-spacing: 0.04em;
	}

	/* B10: 5 rows → 3. Explicit 3-column template packs the 8 cells into
	   three visual rows at the panel width (auto row-major placement; mood
	   compact no longer spans a row):
	     row 1: mood · title · time of day
	     row 2: look (genre+style compound) · weather · structure chip
	     row 3: ratio · clip_s
	   Same `entry` fields and bindings — nothing renamed or removed. */
	.g0-grid {
		display: grid;
		grid-template-columns: minmax(230px, 1.2fr) minmax(170px, 1fr) minmax(130px, 0.8fr);
		gap: 10px 12px;
	}
	.g0-grid > .field {
		min-width: 0;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	/* B10(a): the mood cell — fixed-ish width so the slider reads ~250px
	   (label + slider + band name), no longer spanning the grid row. */
	.mood-compact {
		max-width: 280px;
	}
	/* B10(b): the look compound — genre select + style input side by side
	   in one cell (one visual row). */
	.look-field {
		grid-column: 1 / 2;
	}
	.look-row {
		display: flex;
		gap: 8px;
		min-width: 0;
	}
	.look-row > select,
	.look-row > input {
		flex: 1;
		min-width: 0;
	}
	/* B10(c): the structure chip — scenes × shots in one compact control;
	   the two number inputs materialize under it on click. */
	.struct-cell {
		align-items: flex-start;
	}
	.struct-chip {
		display: flex;
		align-items: center;
		gap: 6px;
		width: 100%;
		padding: 4px 9px;
		border: 1px solid var(--border-color);
		border-radius: 5px;
		background: var(--bg-tertiary);
		color: var(--text-primary);
		font: inherit;
		cursor: pointer;
		transition: border-color var(--transition-sin, 0.3s);
	}
	.struct-chip:hover:not(:disabled) {
		border-color: var(--accent-color);
	}
	.struct-chip:focus-visible {
		outline: none;
		border-color: var(--accent-color);
		box-shadow: 0 0 0 3px var(--accent-bg, rgba(89, 181, 255, 0.2));
	}
	.struct-chip code {
		font-family: var(--font-mono, monospace);
		font-size: 11px;
		font-weight: 600;
	}
	.struct-chip-sub {
		font-family: var(--font-mono, monospace);
		font-size: 9px;
		color: var(--text-muted);
	}
	.struct-edit {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-top: 4px;
	}
	.struct-edit input {
		width: 56px;
	}
	.struct-edit span {
		color: var(--text-muted);
		font-size: 11px;
	}
	.field-label {
		font-family: var(--font-mono, monospace);
		font-size: 10px;
		color: var(--text-muted);
		letter-spacing: 0.04em;
	}
	.field select,
	.field input {
		font: inherit;
		font-size: 12px;
		color: var(--text-primary);
		background: var(--bg-tertiary);
		border: 1px solid var(--border-color);
		border-radius: 5px;
		padding: 5px 7px;
		width: 100%;
		box-sizing: border-box;
		transition: border-color var(--transition-sin, 0.3s),
			box-shadow var(--transition-sin, 0.3s);
	}
	.field select:hover:not(:disabled),
	.field input:hover:not(:disabled) {
		border-color: var(--border-light, var(--border-color));
	}
	.field select:focus,
	.field input:focus {
		outline: none;
		border-color: var(--accent-color);
		box-shadow: 0 0 0 3px var(--accent-bg, rgba(89, 181, 255, 0.2));
	}
	.field select {
		appearance: none;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23808080' stroke-width='1.2'/%3E%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 8px center;
		padding-right: 24px;
		cursor: pointer;
	}
	.field input:disabled,
	.field select:disabled {
		opacity: 0.6;
	}
	.field input[type='number'] {
		width: 100%;
	}
	.clip-range {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		width: 100%;
		color: var(--text-muted);
	}
	.clip-range input {
		width: 100%;
	}

	@media (prefers-reduced-motion: reduce) {
		* {
			transition-duration: 0.001ms !important;
		}
	}
</style>
