<script lang="ts">
	// Provider status chip (docs/settings-provider-tasks.md, Phase 4) — the
	// one global-UI duplicate of the provider settings. Shows the video
	// provider (the primary generation gate); the tooltip + label describe the
	// ACTUAL per-kind state (which slot is missing what) instead of a bare
	// "Provider not set". Click opens the settings modal at the Providers tab.
	import type { ProviderKind, Settings } from '$types';
	import { isConfigured, PROVIDER_KINDS, maskKey } from '$lib/settings/guards';
	import { getPreset, getModel } from '$lib/settings/catalog';

	let {
		providers,
		onopen,
	} = $props<{
		providers: Settings['providers'];
		onopen: () => void;
	}>();

	// Per-kind diagnosis: which field is missing (url / key / model).
	// A keyless agnes/custom provider still counts as usable ONLY when the
	// engine would actually reject it — the backend provider engine errors
	// on an empty key (docs), so an empty key IS a real gap here. This is
	// deliberate: the chip flags the exact field so the user knows what to
	// fill; it is NOT "unset" when url+model are settled but the key is
	// empty.
	type Gap = 'url' | 'key' | 'model';
	function gapsFor(kind: ProviderKind): Gap[] {
		const slot = providers[kind];
		if (!slot) return ['url', 'key', 'model'];
		const gaps: Gap[] = [];
		if (!/^https?:\/\/\S+$/.test((slot.baseUrl ?? '').trim())) gaps.push('url');
		if (!slot.apiKey) gaps.push('key');
		if (!slot.model) gaps.push('model');
		return gaps;
	}

	const video = providers.video;
	const videoOk = isConfigured(video);
	const allOk = PROVIDER_KINDS.every((k) => isConfigured(providers[k]));
	const missing = PROVIDER_KINDS.filter((k) => !isConfigured(providers[k]));

	// Video model display name (falls back to the raw id when it is not in the
	// configured preset's catalog, e.g. a pending / custom model).
	const videoModelName =
		(getPreset(video.preset) && getModel(getPreset(video.preset)!, video.model))?.label ??
		video.model ??
		'—';
	const presetLabel = getPreset(video.preset)?.label ?? video.preset;

	// Label: settled state → `Preset · Model`; unset → say which field is
	// missing so the user knows what to fill (e.g. "Video: key missing").
	// Label: fully configured → `Preset · Model`. When not, say exactly which
	// field is missing. A video that only lacks its key (url + model settled)
	// reads as "Key needed" — distinct from a totally unset slot.
	const label = videoOk
		? `${presetLabel} · ${videoModelName}`
		: gapsFor('video').length === 1 && gapsFor('video')[0] === 'key'
			? `${presetLabel} · ${videoModelName} — key needed`
			: `Video: ${gapsFor('video').join(' + ')} missing`;

	// Tooltip: one line per unconfigured kind naming the exact gap. A partially
	// filled key is shown masked so the user sees the key is set-but-broken.
	const title = allOk
		? 'All providers configured'
		: missing
				.map((k) => {
					const slot = providers[k];
					const gaps = gapsFor(k);
					// Show the masked key prefix only when a key IS present, so
					// the user sees "set but something else is off" vs "empty".
					const keyPresent = Boolean(slot?.apiKey);
					const masked = keyPresent ? ` (key ${maskKey(slot!.apiKey)})` : '';
					return `${k}: ${gaps.join(' + ')} missing${masked}`;
				})
				.join('\n') + '\nClick to configure';
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
