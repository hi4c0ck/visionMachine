<script lang="ts">
	import type { PipeRow } from '$types';

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
	<span class="pipe-label">Pipe {idx + 1}</span>
	<span class="pipe-meta">{pipe.lengthFrames}f{durationSec !== null ? ` · ${durationSec.toFixed(2)}s` : ''}</span>
	<span class="pipe-ops">
		<button class="btn-icon" onclick={() => onMove(-1)} disabled={idx === 0} title="Move pipe up">↑</button>
		<button class="btn-icon" onclick={() => onMove(1)} disabled={idx === pipeCount - 1} title="Move pipe down">↓</button>
		<button class="btn-icon" onclick={onDuplicate} title="Duplicate pipe">⧉</button>
		<label class="pipe-len" title="Pipe length in frames (min 41) — click to edit">
			<span>len</span>
			<input type="number" min="41" step="8" value={pipe.lengthFrames}
				onchange={handleLenInput} onfocus={() => onLengthEdit()} />
		</label>
		<button class="btn-icon" onclick={onLengthEdit} title="Edit length (frames / seconds)">✎</button>
		<button class="btn-icon pipe-del" onclick={onRemove} title="Remove pipe">×</button>
	</span>
</div>

<style>
	.pipe-header {
		display: flex;
		align-items: center;
		gap: 8px;
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
		font-size: 14px;
		transition: all 0.2s;
	}

	.btn-icon:hover {
		background: var(--bg-tertiary);
		color: var(--text-primary);
	}

	.pipe-ops .btn-icon {
		min-width: 24px;
		height: 24px;
		font-size: 14px;
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
