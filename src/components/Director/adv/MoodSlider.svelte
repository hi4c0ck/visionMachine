<script lang="ts">
	// M4 mood slider: a single 0..100 range input bound to a `mood` prop
	// ($bindable). Presentational — the parent owns entry.mood.
	//
	// Band readout mirrors the Rust MoodProfile (seed.rs::for_mood):
	//   0..=33   "Subtle"    clip [6,8]   hard_cut/cut_on_action · static · fx 0 · medium
	//   34..=66  "Balanced"  clip [8,10]  hard_cut/crossfade     · pan    · fx 1 · medium
	//   67..=100 "Cinematic" clip [10,12] match_cut/crossfade    · crane  · fx 3 · high

	type MoodBand = 'subtle' | 'balanced' | 'cinematic';

	// Two-way: the parent owns entry.mood; the range input writes back
	// through this $bindable prop. The prop is optional — pre-M4 drafts and
	// fresh entries may hand over undefined, which the `val` guard below
	// coerces to the balanced band (50) for display; dragging always writes
	// a concrete number back into entry.mood.
	let { mood = $bindable() } = $props<{ mood?: number }>();

	// Defensive: the parent may hand over an undefined mood (pre-M4 drafts);
	// readouts fall back to the balanced band (50) instead of NaN.
	const val = $derived(typeof mood === 'number' && Number.isFinite(mood) ? mood : 50);

	function band(v: number): MoodBand {
		const n = Math.max(0, Math.min(100, Math.round(v)));
		if (n <= 33) return 'subtle';
		if (n <= 66) return 'balanced';
		return 'cinematic';
	}

	const label = $derived(
		{ subtle: 'Subtle', balanced: 'Balanced', cinematic: 'Cinematic' }[band(val)],
	);
	// Compact parameter echo: clip range / transition pair / effects count /
	// contrast — the knobs the band actually stamps. Muted mono.
	const echo = $derived(
		{
			subtle: 'clip 6–8 · hard_cut/cut_on_action · fx 0 · med',
			balanced: 'clip 8–10 · hard_cut/crossfade · fx 1 · med',
			cinematic: 'clip 10–12 · match_cut/crossfade · fx 3 · high',
		}[band(val)],
	);
</script>

<div class="mood-field">
	<span class="field-label">mood</span>
	<div class="mood-row">
		<input
			type="range"
			min="0"
			max="100"
			step="1"
			bind:value={mood}
			aria-label="Mood 0 (subtle) to 100 (cinematic)"
		/>
		<code class="mood-band">{label}</code>
	</div>
	<code class="mood-echo">{echo}</code>
</div>

<style>
	/* Design tokens only (Template A): hairline, quiet, muted mono echo. */
	.mood-field {
		display: flex;
		flex-direction: column;
		gap: 3px;
		grid-column: 1 / -1; /* span the full G0 grid row */
	}

	.field-label {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--text-muted);
	}

	.mood-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	input[type='range'] {
		--track: var(--border-color);
		--thumb: var(--accent-color);
		flex: 1;
		-webkit-appearance: none;
		appearance: none;
		width: 100%;
		height: 18px;
		background: transparent;
		cursor: pointer;
	}
	/* Track (WebKit) */
	input[type='range']::-webkit-slider-runnable-track {
		height: 2px;
		background: var(--track);
		border-radius: 1px;
	}
	/* Thumb (WebKit) */
	input[type='range']::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		margin-top: -5px;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--thumb);
		border: 1px solid var(--border-color);
		transition: box-shadow var(--transition-fast, 0.15s ease);
	}
	input[type='range']::-webkit-slider-thumb:hover {
		box-shadow: 0 0 0 3px var(--accent-bg, rgba(89, 181, 255, 0.25));
	}
	input[type='range']:focus-visible::-webkit-slider-thumb {
		box-shadow: 0 0 0 3px var(--accent-bg, rgba(89, 181, 255, 0.35));
	}
	/* Firefox */
	input[type='range']::-moz-range-track {
		height: 2px;
		background: var(--track);
		border-radius: 1px;
	}
	input[type='range']::-moz-range-thumb {
		width: 12px;
		height: 12px;
		border: 1px solid var(--border-color);
		border-radius: 50%;
		background: var(--thumb);
	}

	.mood-band {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--accent-color, var(--text-secondary));
		min-width: 62px;
		text-align: right;
	}

	.mood-echo {
		font-family: var(--font-mono);
		font-size: 9px;
		color: var(--text-muted);
		letter-spacing: 0.01em;
	}

	/* Keyboard focus ring across the control. */
	input[type='range']:focus-visible {
		outline: none;
	}

	/* Respect the user's motion preference: drop the thumb tween, keep the
	   value change instant. */
	@media (prefers-reduced-motion: reduce) {
		input[type='range']::-webkit-slider-thumb {
			transition-duration: 0.001ms !important;
		}
	}
</style>
