<script lang="ts">
	// Provider status chip (docs/settings-provider-tasks.md, Phase 4) — the
	// one global-UI duplicate of the provider settings. Shows the video
	// provider (the primary generation gate); the tooltip names every
	// unconfigured kind. Click opens the settings modal at the Providers tab.
	import type { Settings } from '$types';
	import { isConfigured, PROVIDER_KINDS } from '$lib/settings/guards';
	import { getPreset } from '$lib/settings/catalog';

	let {
		providers,
		onopen,
	} = $props<{
		providers: Settings['providers'];
		onopen: () => void;
	}>();

	const video = providers.video;
	const videoOk = isConfigured(video);
	const allOk = PROVIDER_KINDS.every((k) => isConfigured(providers[k]));
	const missing = PROVIDER_KINDS.filter((k) => !isConfigured(providers[k]));

	const label = videoOk
		? `${getPreset(video.preset)?.label ?? video.preset} · ${video.model}`
		: 'Provider not set';
	const title = allOk
		? 'All providers configured'
		: `Not configured: ${missing.join(', ')} — click to configure`;
</script>

<button
	class="provider-chip"
	class:ok={allOk}
	class:warn={!videoOk}
	{title}
	aria-label="Provider status — {title}"
	onclick={onopen}>
	<span class="chip-dot" aria-hidden="true"></span>
	<span class="chip-label">{label}</span>
</button>

<style>
	.provider-chip {
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 5px 12px;
		background: var(--bg-tertiary);
		border: 1px solid var(--border);
		border-radius: 999px;
		color: var(--text-secondary);
		font-size: 0.72rem;
		font-family: inherit;
		cursor: pointer;
		transition: all var(--transition-fast);
		max-width: 240px;
	}

	.provider-chip:hover {
		color: var(--text-primary);
		border-color: var(--border-light);
	}

	.chip-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		flex-shrink: 0;
		background: #f59e0b;
	}

	.provider-chip.ok .chip-dot {
		background: #22c55e;
		box-shadow: 0 0 6px rgba(34, 197, 94, 0.6);
	}

	.provider-chip.warn .chip-dot {
		background: #f59e0b;
		box-shadow: 0 0 6px rgba(245, 158, 11, 0.6);
	}

	.chip-label {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
