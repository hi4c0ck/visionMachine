<script lang="ts">
	// One provider-kind card (docs/settings-provider-tasks.md, Phase 3).
	// Preset + base URL + masked key + preset-constrained model + real
	// connection test. The card is stateless: the modal owns the draft slot
	// and gets it back via onchange.
	import type { ProviderKind, ProviderSlot } from '$types';
	import { PRESETS, getPreset, modelsFor } from '$lib/settings/catalog';
	import { validateHttpUrl, isConfigured } from '$lib/settings/guards';
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
	const modelOptions = $derived(modelsFor(preset, kind));

	// Preset switch reflows URL to the preset default and picks the first
	// usable model for this kind — predictable, no dangling model.
	function setPreset(id: string) {
		const next = getPreset(id);
		if (!next || next.id === slot.preset) return;
		const models = modelsFor(next, kind);
		const model = models.find((m) => !m.pending) ?? models[0];
		onslotchange({
			...slot,
			preset: next.id,
			baseUrl: next.defaultBaseUrl,
			model: model?.id ?? slot.model,
		});
		testResult = null;
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
		<select id="prov-model-{kind}" value={slot.model} onchange={(e) => onslotchange({ ...slot, model: e.currentTarget.value })}>
			{#each modelOptions as m (m.id)}
				<option value={m.id} disabled={m.pending}>{m.label ?? m.id}{m.pending ? ' (details pending)' : ''}</option>
			{/each}
		</select>
	</div>

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
		color: #4ade80;
		border-color: rgba(74, 222, 128, 0.4);
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

	.hint-error {
		color: #f87171;
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
		color: #4ade80;
	}
</style>
