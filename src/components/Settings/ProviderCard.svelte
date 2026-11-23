<script lang="ts">
	// One provider-kind card (docs/settings-provider-tasks.md, Phase 3).
	// Preset + base URL + masked key + preset-constrained model + real
	// connection test. The card is stateless: the modal owns the draft slot
	// and gets it back via onchange.
	import type { ProviderKind, ProviderSlot } from '$types';
	import { PRESETS, getPreset, modelsFor, capabilityNote } from '$lib/settings/catalog';
	import { validateHttpUrl, isConfigured, unlockVerified, verificationGlyph } from '$lib/settings/guards';
	import { testProvider, type TestProviderOutcome } from '$lib/settings/store';

	let {
		kind,
		slot,
		onslotchange,
	} = $props<{
		kind: ProviderKind;
		/** The modal's draft slot for this kind. */
		slot: ProviderSlot;
		/** Hand the edited slot back to the modal.
		 * NOTE: not named `onchange` — Svelte 5 reserves on<dom-event> prop
		 * names for event listeners, which breaks $props typing. */
		onslotchange: (slot: ProviderSlot) => void;
	}>();

	const KIND_LABELS: Record<ProviderKind, string> = {
		text: 'Text — prompts & summarizer',
		image: 'Image — keyframes & subjects',
		video: 'Video — final output',
	};

	let showKey = $state(false);
	let testing = $state(false);
	let testResult = $state<TestProviderOutcome | null>(null);

	const preset = $derived(getPreset(slot.preset) ?? PRESETS[0]);
	const presetOptions = $derived(PRESETS.filter((p) => p.kinds.includes(kind)));
	// Owner live-verification (slot.verified) lifts the catalog `pending`
	// gate for selected models — they become the settings default too.
	const modelOptions = $derived(
		modelsFor(preset, kind).filter((m) => !m.obsolete).map((m) => unlockVerified(m, slot.verified)),
	);
	// Reserved models not yet verified on this machine — the owner gate.
	const pendingModels = $derived(modelOptions.filter((m) => m.pending));
	// Self-heal the value: a stored slot may still name an obsolete (<2.5)
	// model that's no longer offered. Show the first usable option instead so
	// the select never renders a dangling value; the stored id is untouched
	// until the user interacts.
	const effectiveModel = $derived(
		modelOptions.some((m) => m.id === slot.model)
			? slot.model
			: (modelOptions.find((m) => !m.pending) ?? modelOptions[0])?.id ?? slot.model,
	);
	const selectedModel = $derived(modelOptions.find((m) => m.id === effectiveModel) ?? null);
	// Read-only (paid) models: the user inspects these parameters here
	// (docs/agnes-model-catalog.md, Q3) — show the concrete limits.
	const modelLimitsText = $derived.by(() => {
		const lim = selectedModel?.limits;
		if (!lim) return '';
		const parts: string[] = [];
		if (lim.resolutions?.length) parts.push(lim.resolutions.join(' / '));
		if (lim.seconds) parts.push(`${lim.seconds[0]}–${lim.seconds[1]}s`);
		if (lim.maxFrames) parts.push(`≤${lim.maxFrames} frames`);
		if (lim.fps?.length) parts.push(`fps ${lim.fps.join(' / ')}`);
		return parts.join(' · ');
	});

	// Preset switch reflows URL to the preset default and picks the first
	// usable model for this kind — predictable, no dangling model.
	// It also clears the key: a key belongs to the vendor its URL points at,
	// so carrying the old preset's key into the new one made the card read
	// "Configured" while the chip correctly reported the key as not set.
	function setPreset(id: string) {
		const next = getPreset(id);
		if (!next || next.id === slot.preset) return;
		const models = modelsFor(next, kind).filter((m) => !m.obsolete);
		const model = models.find((m) => !m.pending) ?? models[0];
		onslotchange({
			...slot,
			preset: next.id,
			baseUrl: next.defaultBaseUrl,
			apiKey: '',
			// Verified ids belong to the previous preset's models — a
			// vendor-scoped list, dropped with the key.
			verified: undefined,
			model: model?.id ?? slot.model,
		});
		testResult = null;
	}

	function toggleVerified(id: string) {
		const cur: string[] = slot.verified ?? [];
		const on = !cur.includes(id);
		const next = on ? [...cur, id] : cur.filter((x) => x !== id);
		// CHECK = verify + SELECT the model — the effect is visible in the
		// picker above (dropdown selection / typed input value), and the row
		// leaves this section because the section only lists STILL-pending
		// models. UNCHECK = back to reserved (selection is kept).
		onslotchange({ ...slot, verified: next.length ? next : undefined, ...(on ? { model: id } : {}) });
	}

	async function runTest() {
		if (!validateHttpUrl(slot.baseUrl) || testing) return;
		testing = true;
		testResult = null;
		try {
			testResult = await testProvider(slot.baseUrl, slot.apiKey);
		} finally {
			testing = false;
		}
	}
</script>

	<section class="provider-card">
	<header class="card-head">
		<span class="kind-label">{KIND_LABELS[kind as ProviderKind]}</span>
		<span class="status-badge" class:ok={isConfigured(slot)}>
			{isConfigured(slot) ? 'Configured' : 'Not set'}
		</span>
	</header>

	<div class="field">
		<label for="prov-preset-{kind}">Preset</label>
		<select id="prov-preset-{kind}" value={slot.preset} onchange={(e) => setPreset(e.currentTarget.value)}>
			{#each presetOptions as p (p.id)}
				<option value={p.id}>{p.label}</option>
			{/each}
		</select>
	</div>

	<div class="field">
		<label for="prov-url-{kind}">Base URL</label>
		<input
			id="prov-url-{kind}"
			type="text"
			spellcheck="false"
			placeholder="https://api.example.com/v1"
			value={slot.baseUrl}
			oninput={(e) => {
				onslotchange({ ...slot, baseUrl: e.currentTarget.value });
				testResult = null;
			}}
		/>
		{#if slot.baseUrl && !validateHttpUrl(slot.baseUrl)}
			<span class="hint hint-error">Must start with http:// or https://</span>
		{/if}
	</div>

	<div class="field">
		<div class="key-row">
			<label for="prov-key-{kind}">API key</label>
			<button class="mini-btn" type="button" disabled={!slot.apiKey} onclick={() => (showKey = !showKey)}>
				{showKey ? 'Hide' : 'Show'}
			</button>
		</div>
		<input
			id="prov-key-{kind}"
			type={showKey ? 'text' : 'password'}
			spellcheck="false"
			placeholder="Paste your API key"
			value={slot.apiKey}
			oninput={(e) => {
				onslotchange({ ...slot, apiKey: e.currentTarget.value });
				testResult = null;
			}}
		/>
		<span class="hint">Stored locally on this machine — never shared, never logged.</span>
	</div>

	<div class="field">
		<label for="prov-model-{kind}">Model</label>
		{#if preset.freeFormModel}
			<!-- Free-form preset (local engine, custom server): type the engine's own
			     model/checkpoint id. Reserved catalog ids are datalist hints; the typed
			     id rides the base spec in resolveSpecs — owner-typed = live-verified,
			     the reserved pending gate lifts by construction. -->
			<input
				id="prov-model-{kind}"
				class="prov-model-input"
				type="text"
				list="prov-model-dl-{kind}"
				value={slot.model}
				oninput={(e) => onslotchange({ ...slot, model: (e.target as HTMLInputElement).value })}
				placeholder={`Type the ${kind} model id for ${preset.label}`}
			/>
			<datalist id="prov-model-dl-{kind}">
				{#each modelOptions as m (m.id)}
					{@const glyph = verificationGlyph(m, slot.verified)}
					<option value={m.id}>{glyph ? `${glyph} ` : ''}{m.label ?? m.id}{m.pending ? ' (reserved)' : ''}{capabilityNote(m) ? ` (${capabilityNote(m)})` : ''}</option>
				{/each}
			</datalist>
		{:else}
			<select id="prov-model-{kind}" value={effectiveModel} onchange={(e) => onslotchange({ ...slot, model: e.currentTarget.value })}>
				{#each modelOptions as m (m.id)}
					{@const glyph = verificationGlyph(m, slot.verified)}
					<option value={m.id} disabled={m.pending}>{glyph ? `${glyph} ` : ''}{m.label ?? m.id}{m.pending ? (m.id === effectiveModel ? ' (details pending - selected, unverified)' : ' (details pending)') : ''}{capabilityNote(m) ? ` (${capabilityNote(m)})` : ''}</option>
				{/each}
			</select>
		{/if}
		{#if selectedModel?.readOnly}
			<span class="hint hint-readonly">Read-only — paid model. Parameters are visible here, but it can't be confirmed for generation.</span>
		{/if}
		{#if modelLimitsText}
			<span class="hint">Limits: {modelLimitsText}</span>
		{/if}
	</div>

	{#if pendingModels.length}
		<div class="field verified">
			<span class="verified-title">Live-verified models</span>
			{#each pendingModels as m (m.id)}
				<label class="verified-row">
					<input
						type="checkbox"
						checked={(slot.verified ?? []).includes(m.id)}
						onchange={() => toggleVerified(m.id)}
					/>
					<span>{m.label ?? m.id}</span>
				</label>
			{/each}
			<span class="hint">
				This section lists the preset's reserved models — the ones still
				LOCKED in the model picker above (greyed out, "(details pending)").
				Tick one = "I confirmed it against my engine": it unlocks AND gets
				selected in the picker, and it leaves this list (nothing left to
				verify there). Untick = back to reserved.
			</span>
			<span class="hint verified-legend">? reserved, not run · ✓ verified by a test session · no mark = catalog-generable</span>
		</div>
	{/if}

	<div class="test-row">
		<button
			class="btn-test"
			type="button"
			disabled={!validateHttpUrl(slot.baseUrl) || testing}
			onclick={runTest}>
			{testing ? 'Testing…' : 'Test connection'}
		</button>
		{#if testResult}
			<span class="test-result" class:ok={testResult.reachable}>{testResult.message}</span>
		{/if}
	</div>
</section>

<style>
	.provider-card {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 14px;
		border: 1px solid var(--border-color, #3f3f46);
		border-radius: 8px;
		background: var(--bg-tertiary, rgba(255, 255, 255, 0.04));
	}

	.card-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.kind-label {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text-primary, #fff);
	}

	.status-badge {
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		padding: 3px 8px;
		border-radius: 999px;
		border: 1px solid var(--border-color, #3f3f46);
		color: var(--text-muted, #71717a);
	}

	.status-badge.ok {
		color: var(--success-color, #4ade80);
		border-color: color-mix(in srgb, var(--success-color, #4ade80) 40%, transparent);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}

	.field label {
		font-size: 0.72rem;
		font-weight: 500;
		color: var(--text-secondary, #a1a1aa);
	}

	.field select,
	.field input {
		width: 100%;
		padding: 9px 11px;
		font-size: 0.85rem;
		color: var(--text-primary, #fff);
		background: var(--bg-secondary, #27272a);
		border: 1px solid var(--border-color, #3f3f46);
		border-radius: 6px;
	}

	.field select:focus,
	.field input:focus {
		outline: none;
		border-color: var(--accent-color, #ff3e00);
	}

	.key-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.key-row label {
		font-size: 0.72rem;
		font-weight: 500;
		color: var(--text-secondary, #a1a1aa);
	}

	.mini-btn {
		font-size: 0.7rem;
		padding: 3px 10px;
		border-radius: 5px;
		border: 1px solid var(--border-color, #3f3f46);
		background: transparent;
		color: var(--text-secondary, #a1a1aa);
		cursor: pointer;
	}

	.mini-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.hint {
		font-size: 0.68rem;
		color: var(--text-muted, #71717a);
	}

	.hint-readonly {
		color: var(--warning-color, #fbbf24);
	}

	.hint-error {
		color: var(--error-color, #f87171);
	}

	/* Compact glyph legend under the live-verified checkbox section. */
	.verified-legend {
		color: var(--text-secondary, #a1a1aa);
	}

	/* Owner live-verification gate: one checkbox row per reserved model. */
	.verified-title {
		font-size: 0.72rem;
		font-weight: 500;
		color: var(--text-secondary, #a1a1aa);
	}

	.verified-row {
		display: flex;
		align-items: center;
		gap: 7px;
		font-size: 0.8rem;
		color: var(--text-primary, #fff);
		cursor: pointer;
	}

	.verified-row input {
		width: auto;
		padding: 0;
		margin: 0;
		background: transparent;
		border: none;
		accent-color: var(--accent-color, #ff3e00);
	}

	.test-row {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}

	.btn-test {
		font-size: 0.78rem;
		padding: 7px 14px;
		border-radius: 6px;
		border: 1px solid var(--border-color, #3f3f46);
		background: var(--bg-secondary, #27272a);
		color: var(--text-primary, #fff);
		cursor: pointer;
	}

	.btn-test:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.test-result {
		font-size: 0.72rem;
		color: var(--text-muted, #71717a);
	}

	.test-result.ok {
		color: var(--success-color, #4ade80);
	}
</style>
