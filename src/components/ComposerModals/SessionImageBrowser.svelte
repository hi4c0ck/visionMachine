<script lang="ts">
	/**
	 * Browse every image artifact in the session (generated piece history,
	 * user-picked bases, task outputs) and drop one into the current piece.
	 *
	 * Backs the "any image in the session is reachable from any pipe" ask:
	 * instead of re-picking a file from disk, the user picks a previously
	 * generated / extracted image from anywhere in the session and reuses it
	 * as this piece's URL / img2img reference. The chosen artifact is handed
	 * back to the caller (onPick); the caller then runs the SAME local read
	 * path it already uses for disk files (readUserImage) so the provider
	 * gets a provider-ready data URI + a durable copy under this pipe's
	 * user-images dir.
	 */
	import { listSessionImages, type SessionImageEntry } from '$lib/pieceGeneration';
	import { toMediaUrl, isLocalPath } from '$lib/mediaUrl';
	import '../composer-modal.css';

	let {
		sessionId,
		open = $bindable(false),
		onPick,
	} = $props<{
		sessionId: string | undefined;
		open: boolean;
		/** Receives the chosen entry; the caller wires its image field + copy. */
		onPick: (entry: SessionImageEntry) => void;
	}>();

	let entries = $state<SessionImageEntry[]>([]);
	let loading = $state(false);
	let kindFilter = $state<'all' | 'piece' | 'user' | 'task'>('all');
	let pipeFilter = $state<string>('');
	let picked = $state<SessionImageEntry | null>(null);
	let failed = $state<Set<string>>(new Set());
	let thumbs = $state<Map<string, string>>(new Map());

	// Distinct pipe labels for the filter dropdown (session-level = "session").
	const pipeOptions = $derived.by(() => {
		const set = new Set<string>();
		for (const e of entries) set.add(e.pipeName || 'session');
		return [...set].sort();
	});

	const visible = $derived(
		entries.filter(
			(e) =>
				(kindFilter === 'all' || e.sourceKind === kindFilter) &&
				(pipeFilter === '' || (e.pipeName || 'session') === pipeFilter),
		),
	);

	async function refreshThumbs() {
		thumbs = new Map();
		failed = new Set();
		for (const e of entries) {
			if (!e.localPath || !isLocalPath(e.localPath)) continue;
			const u = await toMediaUrl(e.localPath);
			if (u) {
				thumbs = new Map([...thumbs, [e.localPath, u]]);
			} else {
				failed = new Set([...failed, e.localPath]);
			}
		}
	}

	async function openBrowser() {
		if (!open || !sessionId) return;
		loading = true;
		picked = null;
		try {
			entries = await listSessionImages(sessionId);
		} catch (e) {
			console.error('[SessionImageBrowser] list:', e);
			entries = [];
		}
		await refreshThumbs();
		loading = false;
	}
	$effect(() => {
		if (open) void openBrowser();
	});

	function thumbFor(e: SessionImageEntry): string | null {
		if (failed.has(e.localPath)) return null;
		return thumbs.get(e.localPath) ?? null;
	}

	function pick(e: SessionImageEntry) {
		picked = e;
	}

	function kindBadge(kind: string): string {
		switch (kind) {
			case 'piece':
				return 'generated';
			case 'user':
				return 'user';
			case 'task':
				return 'task';
			default:
				return kind;
		}
	}
</script>

{#if open}
	<div class="modal-overlay" onclick={() => (open = false)} role="presentation">
		<div
			class="modal sib-modal"
			onclick={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			tabindex="-1"
		>
			<div class="modal-header">
				<h3>Session images</h3>
				<span class="sib-count">{entries.length} in this session</span>
			</div>

			<div class="sib-filters">
				<select class="sib-select" bind:value={kindFilter} aria-label="Filter by source type">
					<option value="all">All sources</option>
					<option value="piece">Generated</option>
					<option value="user">User-picked</option>
					<option value="task">Task output</option>
				</select>
				<select class="sib-select" bind:value={pipeFilter} aria-label="Filter by pipe">
					<option value="">All pipes</option>
					{#each pipeOptions as p (p)}
						<option value={p}>{p === 'session' ? 'Session' : p}</option>
					{/each}
				</select>
			</div>

			<div class="modal-body sib-body">
				{#if loading}
					<p class="sib-empty">Loading…</p>
				{:else if visible.length === 0}
					<p class="sib-empty">
						{entries.length === 0
							? 'No images in this session yet — generate or add a piece first.'
							: 'No images match the current filters.'}
					</p>
				{:else}
					<div class="sib-grid">
						{#each visible as e (e.localPath + ':' + e.generationNo)}
							<button
								class="sib-card"
								class:sib-picked={picked?.localPath === e.localPath}
								onclick={() => pick(e)}
								title={e.label}
							>
								<span class="sib-thumb">
									{#if thumbFor(e)}
										<img src={thumbFor(e)} alt={e.label} />
									{:else}
										<span class="sib-thumb-empty">no preview</span>
									{/if}
								</span>
								<span class="sib-cap">
									<span class="sib-cap-top">
										<span class="sib-badge">{kindBadge(e.sourceKind)}</span>
										{#if e.generationNo > 0}
											<span class="sib-gen">#{e.generationNo}</span>
										{/if}
									</span>
									<span class="sib-cap-name">{e.label}</span>
								</span>
							</button>
						{/each}
					</div>
				{/if}
			</div>

			<div class="modal-footer">
				<button class="btn-cancel" onclick={() => (open = false)}>Cancel</button>
				<button class="btn-confirm" onclick={() => picked && onPick(picked)} disabled={!picked}>
					Use this image
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.sib-modal {
		max-width: 640px;
	}
	.sib-count {
		font-size: 12px;
		color: var(--text-secondary, #a1a1aa);
	}
	.sib-filters {
		display: flex;
		gap: 8px;
		padding: 10px 20px;
		border-bottom: 1px solid var(--border-color);
		flex-shrink: 0;
	}
	.sib-select {
		flex: 1 1 0;
		min-width: 0;
		background: var(--bg-tertiary, #1c1c22);
		border: 1px solid var(--border-color);
		color: var(--text-primary, #fff);
		border-radius: 6px;
		padding: 6px 8px;
		font-size: 12px;
	}
	.sib-body {
		overflow-y: auto;
	}
	.sib-empty {
		margin: 0;
		padding: 28px 8px;
		text-align: center;
		color: var(--text-secondary, #a1a1aa);
		font-size: 13px;
	}
	.sib-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
		gap: 10px;
	}
	.sib-card {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 8px;
		background: var(--bg-tertiary, #1c1c22);
		border: 1px solid var(--border-color);
		border-radius: 8px;
		cursor: pointer;
		text-align: left;
		color: var(--text-primary, #fff);
		transition: border-color 0.12s ease;
	}
	.sib-card:hover {
		border-color: var(--accent-color, #ff3e00);
	}
	.sib-picked {
		border-color: var(--accent-color, #ff3e00);
		box-shadow: 0 0 0 1px var(--accent-color, #ff3e00);
	}
	.sib-thumb {
		display: block;
		width: 100%;
		aspect-ratio: 1;
		border-radius: 5px;
		overflow: hidden;
		background: rgba(255, 255, 255, 0.04);
	}
	.sib-thumb img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.sib-thumb-empty {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		font-size: 11px;
		color: var(--text-muted, #71717a);
	}
	.sib-cap {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-height: 30px;
	}
	.sib-cap-top {
		display: flex;
		align-items: center;
		gap: 5px;
	}
	.sib-badge {
		font-size: 9px;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--text-secondary, #a1a1aa);
		background: rgba(255, 255, 255, 0.06);
		border-radius: 4px;
		padding: 1px 5px;
	}
	.sib-gen {
		font-size: 10px;
		font-family: var(--font-mono, monospace);
		color: var(--text-muted, #71717a);
	}
	.sib-cap-name {
		font-size: 11px;
		color: var(--text-primary, #fff);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
