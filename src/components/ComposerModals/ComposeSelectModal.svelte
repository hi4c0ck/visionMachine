<script lang="ts">
	// Compose-select modal (bug batch nov19, item 10): pick WHICH pipes to
	// splice (a 10-pipe session with only 3 generated composes just those 3)
	// and set a SIGNED cut per boundary: negative trims the PREVIOUS pipe's
	// tail, positive trims the NEW pipe's head, 0 = classic lossless splice.
	// A top-tier master slider moves every boundary at once. The backend
	// already supports explicit pipe_ids + the signed overlap_frames map.
	import type { PipeRow, SessionData } from '$types';
	import { APP_CONSTANTS } from '$constants';
	import {
		OVERLAP_STOPS,
		snapOverlap,
		buildOverlapPayload,
		setAllBoundaries,
		overlapWillReencode,
	} from '$lib/composeTrim';
	import '../composer-modal.css';

	let {
		open = $bindable(false),
		session,
		pipes,
		onConfirm,
	} = $props<{
		open: boolean;
		session: SessionData;
		pipes: PipeRow[];
		onConfirm: (pipeIds: string[], overlap: Record<string, number> | null) => void;
	}>();

	let selected = $state<Set<string>>(new Set());
	let boundaries = $state<Record<string, number>>({});
	let master = $state(0);

	const ordered = $derived([...pipes].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)));
	const selectedOrdered = $derived(ordered.filter((p) => selected.has(p.id)));
	// One boundary row between each pair of consecutive SELECTED pipes,
	// keyed by the NEW pipe's id (the wire shape Rust apply_overlap reads).
	const boundaryRows = $derived(
		selectedOrdered.slice(1).map((p, i) => ({ pipe: p, prev: selectedOrdered[i] })),
	);
	const activeMap = $derived.by(() => {
		const map: Record<string, number> = {};
		for (const row of boundaryRows) map[row.pipe.id] = boundaries[row.pipe.id] ?? 0;
		return map;
	});
	const willReencode = $derived(overlapWillReencode(activeMap));
	const masterMixed = $derived(
		boundaryRows.some((r) => (boundaries[r.pipe.id] ?? 0) !== master),
	);

	// Seed ONCE per open (the pipes prop is a fresh array per store mutation
	// since the item-1 pipe-ref bridge — re-seeding would wipe the user's
	// selection mid-edit). Default: pipes with a DONE local last-gen video.
	let seededForOpen = false;
	$effect(() => {
		if (!open) {
			seededForOpen = false;
			return;
		}
		if (seededForOpen) return;
		seededForOpen = true;
		selected = new Set(
			ordered
				.filter((p) => p.lastGeneration?.status === 'done' && p.lastGeneration?.videoPath)
				.map((p) => p.id),
		);
		boundaries = {};
		master = 0;
	});

	function toggle(id: string) {
		const next = new Set(selected);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selected = next;
	}
	function selectAll() {
		selected = new Set(ordered.filter((p) => p.lastGeneration?.videoPath).map((p) => p.id));
	}
	function selectNone() {
		selected = new Set();
	}
	function setBoundary(id: string, v: number) {
		boundaries = { ...boundaries, [id]: snapOverlap(v) };
	}
	function setMaster(v: number) {
		master = snapOverlap(v);
		boundaries = setAllBoundaries(selectedOrdered, master);
	}
	function boundaryLabel(v: number, prevName: string, newName: string): string {
		if (v < 0) return `−${-v}f · ${prevName} tail`;
		if (v > 0) return `+${v}f · ${newName} head`;
		return APP_CONSTANTS.strings.composeBoundaryZero;
	}
	function genChip(p: PipeRow): { text: string; cls: string } {
		const lg = p.lastGeneration;
		if (!lg || !lg.videoPath) return { text: APP_CONSTANTS.strings.composeNoGen, cls: 'cs-gen-none' };
		if (lg.status === 'done') return { text: APP_CONSTANTS.strings.composeGenDone, cls: 'cs-gen-done' };
		return { text: lg.status, cls: 'cs-gen-other' };
	}
	function confirm() {
		const ids = selectedOrdered.map((p) => p.id);
		if (ids.length < 2) return;
		onConfirm(ids, buildOverlapPayload(activeMap));
		open = false;
	}
</script>

{#if open}
	<div class="modal-overlay" onclick={() => (open = false)} role="presentation">
		<div class="modal cs-modal" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
			<div class="modal-header">
				<h3>{APP_CONSTANTS.strings.composeSelectTitle}</h3>
				<span class="modal-sub">{APP_CONSTANTS.strings.composeSelectHint} · {session.name}</span>
			</div>
			<div class="modal-body cs-body">
				<div class="cs-toolbar">
					<button class="cs-mini" onclick={selectAll}>{APP_CONSTANTS.strings.composeSelectAll}</button>
					<button class="cs-mini" onclick={selectNone}>{APP_CONSTANTS.strings.composeSelectNone}</button>
					<span class="cs-count">{selectedOrdered.length}/{ordered.length}</span>
					{#if willReencode}
						<span class="cs-reencode">{APP_CONSTANTS.strings.composeReencode}</span>
					{/if}
				</div>

				<!-- Top-tier master: moves EVERY boundary of the selected set. -->
				{#if boundaryRows.length > 0}
					<div class="cs-master" title={APP_CONSTANTS.strings.composeBoundaryHint}>
						<span class="cs-master-label">{APP_CONSTANTS.strings.composeBoundaryMaster}</span>
						<input type="range" min={OVERLAP_STOPS[0]} max={OVERLAP_STOPS[OVERLAP_STOPS.length - 1]} step="8"
							value={master} oninput={(e) => setMaster(Number(e.currentTarget.value))} />
						<b class="cs-master-val">{masterMixed ? APP_CONSTANTS.strings.composeBoundaryMixed : `${master}f`}</b>
					</div>
				{/if}

				<div class="cs-list">
					{#each ordered as p, i (p.id)}
						{@const chip = genChip(p)}
						<div class="cs-row" class:cs-off={!selected.has(p.id)}>
							<label class="cs-check">
								<input type="checkbox" checked={selected.has(p.id)} onchange={() => toggle(p.id)}
									disabled={!p.lastGeneration?.videoPath} />
							</label>
							<span class="cs-index" aria-hidden="true">{i + 1}</span>
							<span class="cs-name">{p.name}</span>
							<span class="cs-meta">{p.lengthFrames}f</span>
							<span class="cs-gen {chip.cls}">{chip.text}</span>
						</div>
						<!-- Boundary slider AFTER each selected pipe that has a selected predecessor. -->
						{#if selected.has(p.id) && boundaryRows.some((r) => r.pipe.id === p.id)}
							{@const v = boundaries[p.id] ?? 0}
							{@const row = boundaryRows.find((r) => r.pipe.id === p.id)!}
							<div class="cs-boundary">
								<span class="cs-boundary-glyph" aria-hidden="true">↕</span>
								<input type="range" min={OVERLAP_STOPS[0]} max={OVERLAP_STOPS[OVERLAP_STOPS.length - 1]} step="8"
									value={v} oninput={(e) => setBoundary(p.id, Number(e.currentTarget.value))}
									title={APP_CONSTANTS.strings.composeBoundaryHint} />
								<b class="cs-boundary-val">{boundaryLabel(v, row.prev.name, row.pipe.name)}</b>
							</div>
						{/if}
					{/each}
				</div>
			</div>
			<div class="modal-footer">
				<button class="btn-secondary" onclick={() => (open = false)}>{APP_CONSTANTS.strings.cancel}</button>
				<button class="btn-primary" disabled={selectedOrdered.length < 2} onclick={confirm}>
					{APP_CONSTANTS.strings.composeConfirm}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.cs-modal { max-width: 640px; width: 94%; }
	.cs-body { display: flex; flex-direction: column; gap: 10px; }
	.cs-toolbar { display: flex; align-items: center; gap: 8px; }
	.cs-mini {
		font-size: 11px; padding: 3px 10px; border-radius: 6px;
		border: 1px solid var(--border-color); background: var(--bg-tertiary);
		color: var(--text-secondary); cursor: pointer;
	}
	.cs-mini:hover { border-color: var(--accent); color: var(--text-primary); }
	.cs-count { font-size: 11px; color: var(--text-muted); margin-left: auto; }
	.cs-reencode {
		font-size: 10px; padding: 2px 8px; border-radius: 999px;
		border: 1px solid var(--accent); color: var(--accent);
	}
	.cs-master {
		display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: center;
		padding: 8px 10px; border: 1px solid var(--border-color); border-radius: 8px;
		background: var(--bg-tertiary);
	}
	.cs-master-label { font-size: 11px; color: var(--text-secondary); white-space: nowrap; }
	.cs-master-val { font-size: 11px; color: var(--text-primary); min-width: 44px; text-align: right; }
	.cs-list { display: flex; flex-direction: column; gap: 4px; }
	.cs-row {
		display: grid; grid-template-columns: 24px 22px minmax(0, 1fr) auto auto;
		gap: 8px; align-items: center;
		padding: 7px 10px; border: 1px solid var(--border-color); border-radius: 8px;
		background: var(--bg-secondary);
	}
	.cs-row.cs-off { opacity: 0.55; }
	.cs-check { display: flex; align-items: center; }
	.cs-check input { width: auto; margin: 0; }
	.cs-index { font-size: 10px; color: var(--text-muted); }
	.cs-name { font-size: 12px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.cs-meta { font-size: 10px; color: var(--text-muted); }
	.cs-gen { font-size: 10px; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--border-color); }
	.cs-gen-done { color: var(--accent); border-color: var(--accent); }
	.cs-gen-none { color: var(--text-muted); }
	.cs-gen-other { color: var(--text-secondary); }
	.cs-boundary {
		display: grid; grid-template-columns: 24px 1fr auto; gap: 8px; align-items: center;
		padding: 2px 10px 2px 34px;
	}
	.cs-boundary-glyph { font-size: 11px; color: var(--text-muted); text-align: center; }
	.cs-boundary-val { font-size: 10px; color: var(--text-secondary); min-width: 130px; text-align: right; }
	input[type='range'] { width: 100%; accent-color: var(--accent); }
</style>