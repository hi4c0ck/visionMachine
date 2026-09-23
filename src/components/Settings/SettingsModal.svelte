<script lang="ts">
	// Settings modal (docs/settings-provider-tasks.md, Phase 3): shell with
	// three tabs (Defaults | Providers | Tools), a local draft, and an explicit
	// Save bar (dirty indicator — no auto-save for keys/URLs). The provider
	// status chip (Phase 4) opens this at the Providers tab; the Tools tab
	// hosts the ffmpeg path override (two-variant ship: tiny = user path).
	import type { ProviderKind, ProviderSlot, Settings } from '$types';
	import { getSettings, commitSettings } from '$lib/settings/store';
	import { flashToast } from '$lib/flashToast';
	import SettingsDefaults from './SettingsDefaults.svelte';
	import ProviderCard from './ProviderCard.svelte';
	import ToolsSettings from './ToolsSettings.svelte';
	import '../composer-modal.css';

	let {
		open = $bindable(false),
		initialTab = 'defaults',
	} = $props<{
		open?: boolean;
		initialTab?: 'defaults' | 'providers' | 'tools';
	}>();

	const KINDS: ProviderKind[] = ['text', 'image', 'video'];

	let tab = $state<'defaults' | 'providers' | 'tools'>('defaults');
	let draft = $state<Settings>(getSettings());
	let saving = $state(false);

	// Re-seed the draft every time the modal opens — edits are local until
	// Save commits them to the shared store.
	$effect(() => {
		if (open) {
			tab = initialTab;
			draft = JSON.parse(JSON.stringify(getSettings()));
		}
	});

	const dirty = $derived(JSON.stringify(draft) !== JSON.stringify(getSettings()));

	function setSlot(kind: ProviderKind, slot: ProviderSlot) {
		draft.providers[kind] = slot;
	}

	function applyDefaults(mutator: (d: Settings) => void) {
		mutator(draft);
	}

	function cancel() {
		open = false;
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') cancel();
	}

	async function save() {
		if (saving || !dirty) return;
		saving = true;
		try {
			await commitSettings(draft);
			flashToast('Settings saved', 'info');
			open = false;
		} catch (e) {
			console.error('[SettingsModal] save failed:', e);
			flashToast('Failed to save settings', 'error');
		} finally {
			saving = false;
		}
	}
</script>

{#if open}
	<div class="modal-overlay" onclick={cancel} role="presentation">
		<div
			class="modal settings-modal"
			role="dialog"
			aria-modal="true"
			onclick={(e) => e.stopPropagation()}
			onkeydown={onKeydown}
			tabindex="-1">
			<div class="modal-header">
				<h3>Settings <span class="modal-sub">per profile</span></h3>
				<div class="tab-row" role="tablist">
					<button
						class="tab-btn"
						role="tab"
						aria-selected={tab === 'defaults'}
						class:active={tab === 'defaults'}
						onclick={() => (tab = 'defaults')}>Defaults</button>
					<button
						class="tab-btn"
						role="tab"
						aria-selected={tab === 'providers'}
						class:active={tab === 'providers'}
						onclick={() => (tab = 'providers')}>Providers</button>
					<button
						class="tab-btn"
						role="tab"
						aria-selected={tab === 'tools'}
						class:active={tab === 'tools'}
						onclick={() => (tab = 'tools')}>Tools</button>
				</div>
			</div>

			<div class="modal-body settings-body">
				{#if tab === 'defaults'}
					<SettingsDefaults {draft} ondraftchange={applyDefaults} />
				{:else if tab === 'providers'}
					<div class="provider-list">
						{#each KINDS as kind (kind)}
							<ProviderCard {kind} slot={draft.providers[kind]} onslotchange={(s) => setSlot(kind, s)} />
						{/each}
					</div>
				{:else}
					<ToolsSettings {draft} ondraftchange={applyDefaults} />
				{/if}
			</div>

			<div class="modal-footer">
				<span class="save-hint" class:show={dirty} aria-live="polite">
					{dirty ? 'Unsaved changes' : 'Saved'}
				</span>
				<button class="btn-cancel" onclick={cancel} disabled={saving}>Cancel</button>
				<button class="btn-confirm" onclick={save} disabled={!dirty || saving}>
					{saving ? 'Saving…' : 'Save'}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	/* Wider than the 480px composer modals; body scrolls when providers stack. */
	.settings-modal {
		max-width: 560px;
	}

	.settings-body {
		max-height: 64vh;
		overflow-y: auto;
	}

	.tab-row {
		display: flex;
		gap: 6px;
		margin-top: 10px;
	}

	.tab-btn {
		font-size: 0.78rem;
		padding: 6px 14px;
		border-radius: 6px;
		border: 1px solid var(--border-color, #3f3f46);
		background: transparent;
		color: var(--text-secondary, #a1a1aa);
		cursor: pointer;
	}

	.tab-btn.active {
		border-color: var(--accent-color, #ff3e00);
		color: var(--text-primary, #fff);
	}

	.provider-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.save-hint {
		margin-right: auto;
		font-size: 0.72rem;
		color: var(--text-muted, #71717a);
	}

	.save-hint:not(.show) {
		visibility: hidden;
	}
</style>
