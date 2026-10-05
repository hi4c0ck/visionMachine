<script lang="ts">
	// Provider status chip (docs/settings-provider-tasks.md, Phase 4) — the
	// one global-UI duplicate of the provider settings. Shows the video
	// provider (the primary generation gate); the tooltip + label describe the
	// ACTUAL per-kind state (which slot is missing what) instead of a bare
	// "Provider not set". Click opens the settings modal at the Providers tab.
	import type { ProviderKind, Settings } from '$types';
	import { isConfigured, PROVIDER_KINDS, maskKey, type ProviderStatusSnapshot } from '$lib/settings/guards';
	import { getPreset, getModel } from '$lib/settings/catalog';

	let {
		providers,
		providerStatus = null,
		loading = false,
		onopen,
	} = $props<{
		providers: Settings['providers'];
		/**
		 * Per-kind key-presence / configured snapshot (P6), recomputed by the
		 * settings store on profile load + on every settings change. The chip
		 * reads key presence from HERE (a boolean), never off the raw
		 * settings object — so a mid-load / default-seeded settings object can
		 * no longer report "key not set" for a persisted key. Optional for
		 * backward compatibility: when absent, key presence is derived from
		 * `providers` directly (the pre-fix behavior).
		 */
		providerStatus?: Record<ProviderKind, ProviderStatusSnapshot> | null;
		/**
		 * True while the active profile's settings are still in flight (the
		 * settings store's initial load has not settled, or a profile switch
		 * kicked off a new load). While true the chip renders a neutral
		 * "loading" state — it MUST NOT report "key not set" from the
		 * default-seeded snapshot, which is indistinguishable from a real
		 * gap until the load settles. (P6b, closes the initial-load window.)
		 */
		loading?: boolean;
		onopen: () => void;
	}>();

	// Key-presence resolver: read the snapshot's `hasKey` when it's wired
	// (the store recomputes it on load + every save, so it is the
	// authoritative presence flag); only fall back to the live slot when
	// the snapshot is absent (legacy direct-usage path).
	const hasKey = (kind: ProviderKind): boolean =>
		providerStatus ? providerStatus[kind].hasKey : Boolean(providers[kind]?.apiKey);

	// Per-kind diagnosis: which field is missing (url / key / model).
	// A keyless agnes/custom provider still counts as usable ONLY when the
	// engine would actually reject it — the backend provider engine errors
	// on an empty key (docs), so an empty key IS a real gap here. This is
	// deliberate: the chip flags the exact field so the user knows what to
	// fill; it is NOT "unset" when url+model are settled but the key is
	// empty.
	type Gap = 'url' | 'key' | 'model';
	function gapsFor(kind: ProviderKind): Gap[] {
		// Single source of truth: read the gaps from the snapshot when it's
		// wired (the store recomputes it on load + every save, so it is
		// never stale relative to the persisted settings). Only fall back
		// to the live slot for the field the snapshot does not carry — and
		// even that is just the legacy direct-usage path.
		if (providerStatus) return providerStatus[kind].gaps;
		const slot = providers[kind];
		if (!slot) return ['url', 'key', 'model'];
		const gaps: Gap[] = [];
		if (!/^https?:\/\/\S+$/.test((slot.baseUrl ?? '').trim())) gaps.push('url');
		if (!slot.apiKey) gaps.push('key');
		if (!slot.model) gaps.push('model');
		return gaps;
	}

	// ── Reactive derivations (Svelte 5) ────────────────────────────────────────
	// Every value below is a $derived, NOT a plain top-level const: a plain
	// const captures the prop reference ONCE at component init and never
	// re-evaluates when the parent re-renders with a fresh providerStatus /
	// providers / loading. That was the P6 staleness bug — the store had
	// already recomputed the snapshot (videoHasKey: true in the log) but the
	// chip still showed "Key needed" because its top-level const had frozen
	// on the first render's default-seeded snapshot.
	const video = $derived(providers.video);
	// Every configured/gap/label decision below comes from the snapshot when
	// it's wired — the dot color and the text can never disagree, because
	// they read the same recomputed object instead of two different graphs.
	const videoConfigured = $derived(
		providerStatus
			? providerStatus.video.configured
			: isConfigured(video),
	);
	const videoOk = $derived(videoConfigured);
	const allOk = $derived(
		PROVIDER_KINDS.every(
			(k) => (providerStatus ? providerStatus[k].configured : isConfigured(providers[k])),
		),
	);
	const missing = $derived(
		PROVIDER_KINDS.filter(
			(k) => !(providerStatus ? providerStatus[k].configured : isConfigured(providers[k])),
		),
	);

	// Video model display name (falls back to the raw id when it is not in the
	// configured preset's catalog, e.g. a pending / custom model).
	const videoModelName = $derived(
		(getPreset(video.preset) && getModel(getPreset(video.preset)!, video.model))?.label ??
		video.model ??
		'—',
	);
	const presetLabel = $derived(getPreset(video.preset)?.label ?? video.preset);

	// Label: settled state → `Preset · Model`. When NOT, lead with the gap so
	// the critical part survives the chip's max-width truncation (a
	// "model-name … key needed" label got cut to just the model name, which a
	// fresh user read as "ready"). The dot color carries the severity below.
	// While the active profile's settings are still loading, the snapshot is
	// the default-seeded one — asserting key presence off it would flash a
	// false "Key needed" on startup for a fully configured profile. Render
	// a neutral state instead (P6b). The load settles via notifyChanges,
	// which re-runs this whole block with the real snapshot.
	const videoGaps = $derived(gapsFor('video'));
	// A missing video key blocks generation no matter what else is unset
	// (the engine rejects an empty key), so a key gap → red; only a keyless-
	// free partial config (url/model missing while a key exists) stays amber.
	const videoKeyGap = $derived(!videoOk && videoGaps.includes('key'));
	const label = $derived(
		loading
			? 'Loading…'
			: videoOk
				? `${presetLabel} · ${videoModelName}`
				: videoKeyGap
					? `Key needed · ${presetLabel} · ${videoModelName}`
					: `Video: ${videoGaps.join(' + ')} missing`,
	);

	// Severity for the dot: a keyless video provider is a HARD block on any
	// generation (the engine rejects an empty key) → error (red), not
	// "nearly ready" (amber). Amber is reserved for a partially-filled but
	// otherwise-usable slot (url or model missing while a key exists).
	// While loading the dot is neutral (no color) — no severity to convey.
	const dotClass = $derived(
		loading ? 'loading' : videoOk ? 'ok' : videoKeyGap ? 'error' : 'warn',
	);

	// Tooltip: one line per unconfigured kind naming the exact gap. A partially
	// filled key is shown masked so the user sees the key is set-but-broken.
	// While loading the tooltip is a single neutral line (the gaps are from
	// the default-seeded snapshot and are not yet meaningful).
	const title = $derived(
		loading
			? 'Loading provider settings…'
			: allOk
				? 'All providers configured'
				: missing
						.map((k) => {
							const slot = providers[k];
							const gaps = gapsFor(k);
							// Show the masked key prefix only when a key IS present, so
							// the user sees "set but something else is off" vs "empty".
							// The mask value comes from the live slot (display only, P6);
							// the presence decision itself came from the snapshot.
							const keyPresent = hasKey(k);
							const masked = keyPresent ? ` (key ${maskKey(slot!.apiKey)})` : '';
							return `${k}: ${gaps.join(' + ')} missing${masked}`;
						})
						.join('\n') + '\nClick to configure',
	);
</script>

	<button
		class="provider-chip {dotClass}"
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

	.provider-chip.error .chip-dot {
		background: #ef4444;
		box-shadow: 0 0 6px rgba(239, 68, 68, 0.6);
	}

	/* Neutral state while the active profile's settings are still loading —
	   no severity color, a quiet pulse signals "in progress" without
	   implying a gap. (P6b.) */
	.provider-chip.loading .chip-dot {
		background: var(--text-muted, #6b7280);
		animation: chip-pulse 1.2s ease-in-out infinite;
	}

	@keyframes chip-pulse {
		0%, 100% { opacity: 0.4; }
		50% { opacity: 1; }
	}

	.chip-label {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
