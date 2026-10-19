<script lang="ts">
	import type { PipeRow } from '$types';
	import ChromeIcon from '../ChromeIcon.svelte';

	// Pipe header row — pure chrome. The panel owns pipe ordering/length
	// store actions; this component just renders and fires callbacks.
	let {
		pipe,
		idx,
		pipeCount,
		onMove,
		onDuplicate,
		onRemove,
		onLengthChange,
		onLengthEdit,
		fps,
		targetLabel = null,
	} = $props<{
		pipe: PipeRow;
		idx: number;
		pipeCount: number;
		onMove: (dir: -1 | 1) => void;
		onDuplicate: () => void;
		onRemove: () => void;
		/** Quick set: apply a specific frame count directly. */
		onLengthChange: (raw: number) => void;
		/** Open the length editor modal (frames ↔ seconds + trim warnings). */
		onLengthEdit: () => void;
		/** Session fps — lets the header show the equivalent duration. */
		fps?: number;
		/** 0012: the session target size label (e.g. "1920×1080 (16:9)") to
		 *  surface in the pipe header. Null/absent = hidden. */
		targetLabel?: string | null;
	}>();

	// The bare <input type=number> spinners were the old path for the pipe
	// length — nudging was too fiddly and gave no way to reason in seconds.
	// The field now displays the value; clicking it (or the edit affordance)
	// opens the length-editor modal where the user sets a concrete frame or
	// seconds value and is warned about any segments/tags that would be
	// trimmed.
	function handleLenInput(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const raw = Number(input.value);
		if (Number.isFinite(raw) && raw >= 41) {
			onLengthChange(raw);
		}
		// Otherwise keep the stored value (invalid/out-of-range edits don't
		// propagate; the modal is the precise path).
		input.value = String(pipe.lengthFrames);
	}

	const durationSec = fps ? pipe.lengthFrames / fps : null;
</script>

<div class="pipe-header">
	<span class="pipe-label">{pipe.name}</span>
	<span class="pipe-meta">{pipe.lengthFrames}f{durationSec !== null ? ` · ${durationSec.toFixed(2)}s` : ''}</span>
	{#if targetLabel}
		<span class="pipe-size-chip" title="Session target size (all session videos normalize to this)">
			{targetLabel}
		</span>
	{/if}
	<span class="pipe-ops">
		<button class="btn-icon" onclick={() => onMove(-1)} disabled={idx === 0} title="Move pipe up"><ChromeIcon id="step-prev" size={14} /></button>
		<button class="btn-icon" onclick={() => onMove(1)} disabled={idx === pipeCount - 1} title="Move pipe down"><ChromeIcon id="step-next" size={14} /></button>
		<button class="btn-icon" onclick={onDuplicate} title="Duplicate pipe"><ChromeIcon id="copy" size={14} /></button>
		<label class="pipe-len" title="Pipe length in frames (min 41) — click to edit">
			<span>len</span>
			<input type="number" min="41" step="8" value={pipe.lengthFrames}
				onchange={handleLenInput} onfocus={() => onLengthEdit()} />
		</label>
		<button class="btn-icon" onclick={onLengthEdit} title="Edit length (frames / seconds)"><ChromeIcon id="edit" size={14} /></button>
		<button class="btn-icon pipe-del" onclick={onRemove} title="Remove pipe">×</button>
	</span>
</div>

<style>
	.pipe-header {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 28px;
	}

	.pipe-label {
		font-weight: 600;
		font-size: 14px;
	}

	.pipe-meta {
		font-size: 12px;
		color: var(--text-secondary);
		margin-left: auto;
	}

	/* 0012: session target-size chip (W×H · ratio), shown at the pipe header
	   so the composer always surfaces the size every video normalizes to. */
	.pipe-size-chip {
		font-size: 10px;
		color: var(--text-muted);
		background: var(--bg-tertiary);
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 1px 8px;
		margin-left: 8px;
		white-space: nowrap;
	}

	.pipe-ops {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-left: 4px;
	}

	.btn-icon {
		background: none;
		border: none;
		color: var(--text-secondary);
		cursor: pointer;
		padding: 4px 8px;
		border-radius: 4px;
		transition: all 0.2s;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.btn-icon:hover {
		background: var(--bg-tertiary);
		color: var(--text-primary);
	}

	.pipe-ops .btn-icon {
		min-width: 24px;
		height: 24px;
	}

	.pipe-ops .btn-icon:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.pipe-len {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 11px;
		color: var(--text-secondary);
	}

	.pipe-len input {
		width: 52px;
		padding: 3px 5px;
		font-size: 12px;
		border: 1px solid var(--border);
		border-radius: 5px;
		background: var(--surface-2);
		color: var(--text-primary);
	}

	.pipe-len input:focus {
		outline: none;
		border-color: var(--accent);
	}

	.pipe-del {
		color: var(--text-secondary);
	}

	.pipe-del:hover {
		color: #ef4444;
	}
</style>
