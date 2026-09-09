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
	} = $props<{
		pipe: PipeRow;
		idx: number;
		pipeCount: number;
		onMove: (dir: -1 | 1) => void;
		onDuplicate: () => void;
		onRemove: () => void;
		onLengthChange: (raw: number) => void;
	}>();
</script>

<div class="pipe-header">
	<span class="pipe-label">Pipe {idx + 1}</span>
	<span class="pipe-meta">{pipe.lengthFrames}f</span>
	<span class="pipe-ops">
		<button class="btn-icon" onclick={() => onMove(-1)} disabled={idx === 0} title="Move pipe up">↑</button>
		<button class="btn-icon" onclick={() => onMove(1)} disabled={idx === pipeCount - 1} title="Move pipe down">↓</button>
		<button class="btn-icon" onclick={onDuplicate} title="Duplicate pipe">⧉</button>
		<label class="pipe-len" title="Pipe length in frames (min 41)">
			<span>len</span>
			<input type="number" min="41" step="8" value={pipe.lengthFrames}
				onchange={(e) => onLengthChange(Number(e.currentTarget.value))} />
		</label>
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
