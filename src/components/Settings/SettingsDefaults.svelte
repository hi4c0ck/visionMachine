<script lang="ts">
	// Defaults tab (docs/settings-provider-tasks.md, Phase 3): the user's
	// generation defaults + display name. These seed NEW sessions; existing
	// sessions keep their own values. Stateless: parent owns the draft.
	import type { Settings } from '$types';

	let {
		draft,
		ondraftchange,
	} = $props<{
		draft: Settings;
		/** Apply a mutator to the parent's draft (deep $state).
		 * NOTE: not named `onchange` — Svelte 5 reserves on<dom-event> prop
		 * names for event listeners, which breaks $props typing. */
		ondraftchange: (mutator: (d: Settings) => void) => void;
	}>();

	const g = $derived(draft.generationDefaults);

	// Flexible fps list: base options + the current value if it isn't one
	// (same rule as the tools-panel FPS select).
	const fpsOptions = $derived.by(() => {
		const base = [18, 24, 30, 48, 60];
		const cur = g.fps;
		const list = Number.isFinite(cur) && cur > 0 && !base.includes(cur) ? [...base, cur] : base;
		return [...list].sort((a, b) => a - b);
	});

	function setG(patch: Partial<Settings['generationDefaults']>) {
		ondraftchange((d: Settings) => Object.assign(d.generationDefaults, patch));
	}
</script>

<section class="settings-defaults">
	<div class="field">
		<label for="sd-displayname">Display name</label>
		<input
			id="sd-displayname"
			type="text"
			placeholder="Shown in logs and exports"
			value={draft.profile.displayName}
			oninput={(e) => ondraftchange((d: Settings) => (d.profile.displayName = e.currentTarget.value))}
		/>
	</div>

	<div class="field-row">
		<div class="field">
			<label for="sd-fps">FPS</label>
			<select id="sd-fps" value={String(g.fps)} onchange={(e) => setG({ fps: Number(e.currentTarget.value) })}>
				{#each fpsOptions as opt (opt)}
					<option value={String(opt)}>{opt} fps</option>
				{/each}
			</select>
		</div>
		<div class="field">
			<label for="sd-res">Resolution</label>
			<select id="sd-res" value={g.resolution} onchange={(e) => setG({ resolution: e.currentTarget.value })}>
				<option value="480p">480p</option>
				<option value="720p">720p</option>
				<option value="1080p">1080p</option>
			</select>
		</div>
		<div class="field">
			<label for="sd-orient">Orientation</label>
			<select id="sd-orient" value={g.orientation} onchange={(e) => setG({ orientation: e.currentTarget.value })}>
				<option value="horizontal">Horizontal</option>
				<option value="vertical">Vertical</option>
			</select>
		</div>
	</div>

	<div class="field">
		<label for="sd-q">Quality (inference steps) — {g.qValue}</label>
		<input
			id="sd-q"
			type="range"
			min="5"
			max="30"
			step="1"
			value={g.qValue}
			oninput={(e) => setG({ qValue: Number(e.currentTarget.value) })}
		/>
	</div>

	<div class="field">
		<label for="sd-c">Creativity (CFG scale) — {g.cValue}</label>
		<input
			id="sd-c"
			type="range"
			min="0.5"
			max="15"
			step="0.5"
			value={g.cValue}
			oninput={(e) => setG({ cValue: Number(e.currentTarget.value) })}
		/>
	</div>

	<div class="field">
		<span class="field-label">Generation order</span>
		<div class="radio-row" role="radiogroup" aria-label="Generation order">
			<label>
				<input type="radio" name="sd-concurrency" checked={g.concurrency === 'sequential'} onchange={() => setG({ concurrency: 'sequential' })} />
				Sequential — one generation at a time
			</label>
			<label>
				<input type="radio" name="sd-concurrency" checked={g.concurrency === 'parallel'} onchange={() => setG({ concurrency: 'parallel' })} />
				Parallel — run generations together
			</label>
		</div>
	</div>

	<p class="note">These defaults seed every new session. Existing sessions keep their own values.</p>
</section>

<style>
	.settings-defaults {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 5px;
		flex: 1;
	}

	.field label,
	.field-label {
		font-size: 0.72rem;
		font-weight: 500;
		color: var(--text-secondary, #a1a1aa);
	}

	.field-row {
		display: flex;
		gap: 10px;
	}

	.field select,
	.field input[type='text'] {
		width: 100%;
		padding: 9px 11px;
		font-size: 0.85rem;
		color: var(--text-primary, #fff);
		background: var(--bg-secondary, #27272a);
		border: 1px solid var(--border-color, #3f3f46);
		border-radius: 6px;
	}

	.field select:focus,
	.field input[type='text']:focus {
		outline: none;
		border-color: var(--accent-color, #ff3e00);
	}

	.field input[type='range'] {
		width: 100%;
		accent-color: var(--accent-color, #ff3e00);
	}

	.radio-row {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.radio-row label {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.8rem;
		color: var(--text-secondary, #a1a1aa);
		cursor: pointer;
	}

	.radio-row input {
		accent-color: var(--accent-color, #ff3e00);
	}

	.note {
		margin: 0;
		font-size: 0.7rem;
		color: var(--text-muted, #71717a);
	}
</style>
