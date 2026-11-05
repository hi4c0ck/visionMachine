<script lang="ts">
	// Extract tab: the concrete, editable structure (mirror of Rust
	// plan_from_engine) — one group per shot pipe. Presentational child of
	// DirectorPanel: localExtract lives in the parent (the $effect that
	// seeds it from engine.specs/scenes stays there, and the copyExtract /
	// regeneratePipes / copyEngineSheet business logic is parent-owned).
	// The textareas write straight into the parent's (proxied) localExtract
	// elements — no local copy is made.
	import type { EngineRun } from '$lib/directorStore/engine';
	import type { FlowDocument, PlanSection } from '$lib/directorStore/types';
	import { applyFlowScoped, type EditedSection } from '$lib/directorStore';
	import { flashToast } from '$lib/flashToast';

	// Parent-owned shape (src/components/Director/DirectorPanel.svelte):
	// one pipe per shot, delta-driven concern sections. Structural mirror
	// here so the prop type-checks without a shared .ts module.
	type LocalSection = {
		pipeIndex: number; // shot ordinal (0-based across all shots)
		tag: string; // the closed concern vocabulary — the addressing key
		occurrence: number; // Nth section of this tag in the pipe
		range: string;
		prompt: string;
		source: string;
	};

	// Extract/scene tag word → theme lane color (design-system --tag-*
	// tokens, which repaint on every theme). This is the panel's strongest
	// per-theme hook: the same "scene/camera/..." labels read red/yellow/
	// cyan/pink/orange in steel-dark vs. the muted sets in light.
	const TAG_LANE_CLASS: Record<string, string> = {
		scene: 'lane-red',
		camera: 'lane-yellow',
		lighting: 'lane-cyan',
		motion: 'lane-pink',
		transition: 'lane-orange',
		effect: 'lane-blue',
	};

	// Mirrors the parent's isEdited (also used there by copyExtract /
	// dirtyCount): a section is "dirty" when its prompt ≠ source.
	const isEdited = (s: LocalSection) => s.prompt.trim() !== s.source.trim();

	let {
		doc,
		engine,
		sessionId,
		sessionName,
		pipeCount,
		localExtract,
		dirtyCount,
		extractPipeCount,
		applyWorking,
		feedback,
		onCopyExtract,
		onCopyEngineSheet,
		onRegenerate,
		onApplied,
	} = $props<{
		doc: FlowDocument | null;
		/** The saturated S0→S5 flow state (null for pre-engine docs). */
		engine: EngineRun | null;
		/** Session id for the M3 scoped-apply command (director_apply_flow_scoped). */
		sessionId: string;
		sessionName: string;
		pipeCount: number;
		/** Parent's $state concrete-section list (mirrors Rust's
		 plan_from_engine). Textareas + the M3 revert button edit its
		 elements in place (Svelte 5 proxies the $state array, so
		 `s.prompt = s.source` here writes back to the parent). */
		localExtract: LocalSection[];
		/** Parent-derived counts (over localExtract). */
		dirtyCount: number;
		extractPipeCount: number;
		applyWorking: boolean;
		feedback: { text: string; tone: string } | null;
		/** Copy the live sections (or pre-engine structured sections). */
		onCopyExtract: () => void;
		/** Copy the S4-derived engine sheet (the "final structural text"). */
		onCopyEngineSheet: () => void;
		/** Destructive regenerate from the edited sections (parent). */
		onRegenerate: () => Promise<void>;
		/** Parent's composer re-sync hook (I9 onApplied) — fired after a
		 M3 scoped apply so the host's project tree picks up the swapped
		 pipes. May be omitted (host-less panels). */
		onApplied?: (sessionId: string) => void;
	}>();

	// Pre-engine docs have no localExtract — fall back to the original
	// structured sections for rendering.
	const sections = $derived<PlanSection[]>(doc?.structured.pipes[0]?.sections ?? []);

	// M3: group the concrete sections by shot-pipe (pipeIndex) so each
	// pipe renders one header (carrying the scoped-apply control) above its
	// per-section articles. Sections arrive pipe-major from the parent's
	// seed, but the Map keeps the grouping correct regardless of order.
	const pipeGroups = $derived.by(() => {
		const m = new Map<number, LocalSection[]>();
		for (const s of localExtract) {
			let arr = m.get(s.pipeIndex);
			if (!arr) m.set(s.pipeIndex, (arr = []));
			arr.push(s);
		}
		return [...m.entries()]
			.sort((a, b) => a[0] - b[0])
			.map(([pipeIndex, secs]) => ({ pipeIndex, sections: secs }));
	});

	// M3: per-pipe scoped-apply state (busy flag + inline feedback) keyed by
	// pipeIndex — applying one shot never disables the others.
	//
	// The Svelte 5 `state_unsafe_mutation` guard forbids *writing* $state
	// from inside a template expression. The template only ever READS this
	// data ({#if …} / disabled={…}), so the read path is a pure accessor
	// over plain objects; $state is written exclusively from event-handler
	// context (the applyPipe / revert callbacks below).
	type ScopedApplyMeta = {
		busy: boolean;
		feedback: string | null;
		tone: string; // 'tone-ok' | 'tone-danger'
		_timer?: ReturnType<typeof setTimeout>;
	};
	const scopedApply: Record<number, ScopedApplyMeta> = {}; // plain bookkeeping (timers)
	const scopedBusy = $state<Record<number, boolean>>({});
	const scopedFeedbacks = $state<Record<number, string | null>>({});
	const scopedTones = $state<Record<number, string>>({});

	/** Pure template-side read (never writes; undefined entries read as idle). */
	function scopedView(pipeIndex: number): ScopedApplyMeta {
		return {
			busy: scopedBusy[pipeIndex] ?? false,
			feedback: scopedFeedbacks[pipeIndex] ?? null,
			tone: scopedTones[pipeIndex] ?? 'tone-ok',
		};
	}

	/** Ensure bookkeeping + reactive maps have entries for this pipe (event
	     context only — the lazy-create write must not run during render). */
	function ensureScoped(pipeIndex: number): ScopedApplyMeta {
		let m = scopedApply[pipeIndex];
		if (!m) {
			m = { busy: false, feedback: null, tone: 'tone-ok' };
			scopedApply[pipeIndex] = m;
			scopedBusy[pipeIndex] = false;
			scopedFeedbacks[pipeIndex] = null;
			scopedTones[pipeIndex] = 'tone-ok';
		}
		return m;
	}

	// M3: the per-pipe "↺ apply this pipe" — re-materialize ONLY this
	// shot's composer pipe(s) from the concrete sections. `edited` carries
	// this pipe's dirty sections (empty = pristine engine plan). No
	// confirm dialog: a single-pipe swap is reversible via the
	// RegenerationContract.
	async function applyPipe(pipeIndex: number) {
		if (!doc) return;
		const st = ensureScoped(pipeIndex); // event context: safe to create
		if (scopedBusy[pipeIndex] || pipeCount === 0) return; // guard: no composer pipes yet
		const target = doc.flowVersion;
		const edits = localExtract
			.filter((s: LocalSection) => s.pipeIndex === pipeIndex && isEdited(s))
			.map((s: LocalSection): EditedSection => ({
				pipeIndex: s.pipeIndex,
				tag: s.tag,
				occurrence: s.occurrence,
				prompt: s.prompt,
			}));
		const label = `Pipe ${String(pipeIndex).padStart(2, '0')}`;
		scopedBusy[pipeIndex] = true; // reactive write (event context)
		scopedFeedbacks[pipeIndex] = null;
		try {
			const count = await applyFlowScoped(sessionId, target, [pipeIndex], edits);
			scopedFeedbacks[pipeIndex] = `${label} replaced (${count} section(s))`;
			scopedTones[pipeIndex] = 'tone-ok';
			onApplied?.(sessionId);
		} catch (e) {
			scopedFeedbacks[pipeIndex] = `${label} apply failed: ${String(e)}`;
			scopedTones[pipeIndex] = 'tone-danger';
			flashToast(String(e));
		} finally {
			scopedBusy[pipeIndex] = false;
			clearTimeout(st._timer);
			st._timer = setTimeout(() => {
				scopedFeedbacks[pipeIndex] = null;
				scopedTones[pipeIndex] = 'tone-ok';
			}, 4000);
		}
	}

	// M3: per-section revert — reset the section's prompt to its pristine
	// source in place. `localExtract` is the parent's $state array, so its
	// elements are proxies: this write lands on the parent's data and the
	// parent's dirtyCount / extractPipeCount deriveds recompute.
	function revertSection(s: LocalSection) {
		s.prompt = s.source;
	}
</script>

{#if doc}
	<div class="extract-head">
		<span class="muted">
			{sessionName} · v{doc.flowVersion}
			{#if localExtract.length}
				· {localExtract.length} concrete section(s) across {extractPipeCount} shot pipe(s)
			{:else}
				· no engine structure yet
			{/if}
			· {dirtyCount} edited · {pipeCount} pipes in composer
		</span>
		<div class="extract-head-btns">
			<button class="btn" onclick={onCopyExtract}>Copy sections</button>
			{#if engine}
				<button class="btn" onclick={onCopyEngineSheet}>Copy engine sheet</button>
			{/if}
			<!-- Phase 2: the single destructive control — regenerate from
			     the edited concrete sections (replace only; no append). -->
			<button class="btn danger" disabled={applyWorking || !doc} onclick={() => void onRegenerate()}>
				{applyWorking ? 'Applying…' : 'Regenerate pipes'}
				<span class="btn-note">
					{applyWorking
						? 'materializing the concrete plan into composer pipes'
						: `replace ${pipeCount} pipes · ${dirtyCount} edited · replay v${doc.regen.version.flowVersion}`}
				</span>
			</button>
			{#if feedback}
				<p class="action-feedback {feedback.tone}" role="status">{feedback.text}</p>
			{/if}
		</div>
	</div>

	<!-- The concrete, editable structure (mirror of Rust plan_from_engine):
	     one group per shot pipe. Story arcs tile the shot; the whole-shot
	     meta conditions (camera/motion/lighting/transition/effect) span
	     and overlap it. -->
	{#if localExtract.length}
		{#if engine}
			<p class="hint extract-film-ctx">
				Film context (all pipes): <b>{engine.novel.film.logline}</b>
				· {engine.novel.film.world} · {engine.novel.film.palette}
			</p>
		{/if}
		{#each pipeGroups as group}
			{@const groupDirty = group.sections.filter(isEdited).length}
			<!-- M3: one header per shot-pipe carries the scoped-apply control.
			     Enabled when the pipe has >=1 dirty section OR the user wants
			     to re-materialize it; disabled when no composer pipes exist yet
			     (a scoped replace can't target pipes that don't exist). -->
			<div class="pipe-group">
				<header class="pipe-group-head">
					<code class="extract-pipe">pipe {String(group.pipeIndex).padStart(2, '0')}</code>
					<span class="pipe-group-note">{groupDirty} edited</span>
					{#if scopedView(group.pipeIndex).feedback}
						{@const sf = scopedView(group.pipeIndex)}
						<p class="action-feedback {sf.tone}" role="status">{sf.feedback}</p>
					{/if}
					<button
						class="btn btn-scoped"
						disabled={scopedView(group.pipeIndex).busy || pipeCount === 0}
						onclick={() => void applyPipe(group.pipeIndex)}
					>
						{scopedView(group.pipeIndex).busy
							? 'Applying…'
							: groupDirty
								? `↺ apply this pipe (${groupDirty})`
								: '↺ apply this pipe'}
					</button>
					{#if pipeCount === 0}
						<span class="btn-note">run a full apply first</span>
					{/if}
				</header>
				{#each group.sections as s}
					{@const edited = isEdited(s)}
					<article class="extract-block" class:dirty={edited} data-pipe={s.pipeIndex}>
						<header class="extract-meta">
							<span class="tag-word {TAG_LANE_CLASS[s.tag] ?? 'lane-muted'}">{s.tag}{s.tag === 'scene' ? ` · arc ${s.occurrence + 1}` : ''}</span>
							<code class="range">{s.range}</code>
							{#if edited}
								<span class="dirty-mark" title="edited">●</span>
								<button
									class="revert-section"
									title="revert this section to its source"
									onclick={() => revertSection(s)}
								>↩</button>
							{:else}
								<span class="btn-note">unchanged</span>
							{/if}
						</header>
						<!-- Editable concrete prompt. -->
						<textarea
							class="extract-prompt-edit"
							rows="2"
							bind:value={s.prompt}
						></textarea>
					</article>
				{/each}
			</div>
		{/each}
		<!-- M3 landed: per-pipe scoped apply ("↺ apply this pipe", disabled
		     when no composer pipes exist) + per-section revert ("↩" back to
		     source) now live above each shot-pipe group. The destructive
		     full "Regenerate pipes" control in the extract-head stays. -->
	{:else}
		{#each sections as s, i}
			<article class="extract-block">
				<header class="extract-meta">
					<span class="tag-word {TAG_LANE_CLASS[s.tag] ?? 'lane-muted'}">{s.tag}</span>
					<code class="range">{String(s.frameStart).padStart(2, '0')}–{s.frameEnd}</code>
					<span class="provenance" class:active={s.from.length > 0}>
						{#if s.from.length > 0}
							source: {s.from.join(' · ')}
						{:else}
							source: —
						{/if}
					</span>
				</header>
				<p class="extract-prompt">{s.prompt || '—'}</p>
			</article>
		{/each}
	{/if}
	<p class="hint">
		Concrete sections carry only their concern's text — edit any, mark ●, then
		Regenerate pipes materializes the edits into the composer (no fallback).
	</p>
{:else}
	<p class="hint">Run the Director tab first — the final structural text appears here.</p>
{/if}

<style>
	/* Design tokens only (Template A): no new colors, hairlines, quiet.
	   Motion uses --transition-sin (additive token, design doc §6). */

	.muted {
		color: var(--text-muted);
		font-weight: 400;
	}

	/* ── Extract: concrete editable sections ──
	   (the block / prompt-edit / dirty styles now live in the later
	    "Extract: plain structural text" section; only the film-context line
	    and pipe-label utilities are unique here.) */
	.extract-film-ctx {
		margin: 0 0 6px;
		font-size: 11px;
		color: var(--text-secondary);
		line-height: 1.5;
	}
	.extract-pipe {
		font-family: var(--font-mono, monospace);
		font-size: 10px;
		color: var(--text-muted, var(--text-secondary));
	}

	/* ── Buttons + transient feedback (shared affordances, moved from the
	   monolith: Extract's copy / Regenerate controls). */
	.btn {
		font: inherit;
		font-size: 12px;
		font-weight: 500;
		color: var(--text-primary);
		background: var(--bg-elevated);
		border: 1px solid var(--border-color);
		border-radius: 6px;
		padding: 6px 12px;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		transition: border-color var(--transition-fast, 0.15s ease),
			background var(--transition-fast, 0.15s ease),
			box-shadow var(--transition-fast, 0.15s ease);
	}
	.btn:hover:not(:disabled) {
		border-color: var(--accent-color);
	}
	.btn:focus-visible {
		outline: none;
		box-shadow: 0 0 0 3px var(--accent-bg, rgba(89, 181, 255, 0.25));
	}
	.btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.btn.danger {
		color: var(--danger-color);
		border-color: color-mix(in srgb, var(--danger-color) 50%, var(--border-color));
		background: var(--danger-bg, transparent);
	}
	.btn.danger:hover:not(:disabled) {
		border-color: var(--danger-color);
		background: var(--danger-bg, var(--bg-hover));
	}
	.btn-note {
		font-size: 10px;
		font-weight: 400;
		color: var(--text-muted);
		font-family: var(--font-mono);
		letter-spacing: 0.01em;
	}

	/* Transient action feedback (confirm / accept / reject / apply) so a
		click is never silent. Quiet template-a: hairline left border, tone. */
	.action-feedback {
		font-size: 12px;
		padding: 6px 10px;
		border-left: 2px solid var(--border-color);
		color: var(--text-secondary);
	}
	.action-feedback.tone-ok {
		color: var(--text-primary);
		border-left-color: var(--success-color, var(--accent-color));
	}
	.action-feedback.tone-warn {
		color: var(--text-primary);
		border-left-color: var(--warning-color, #e0a34e);
	}
	.action-feedback.tone-danger {
		color: var(--danger-color);
		border-left-color: var(--danger-color);
	}
	.action-feedback.tone-neutral {
		color: var(--text-muted);
	}

	/* ── Extract: plain structural text (design §4) ── */
	.extract-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
	}
	.extract-head-btns {
		display: flex;
		gap: 6px;
	}
	.extract-block {
		border: 1px solid var(--border-color);
		border-radius: 8px;
		padding: 10px 12px;
		margin-top: 8px;
		background: var(--bg-secondary);
		transition: border-color var(--transition-fast, 0.15s ease);
	}
	.extract-block.dirty {
		border-color: color-mix(in srgb, var(--warning-color, #fbbf24) 55%, var(--border-color));
		background: color-mix(in srgb, var(--warning-color, #fbbf24) 6%, var(--bg-secondary));
	}
	.extract-meta {
		display: flex;
		align-items: baseline;
		gap: 10px;
		margin-bottom: 6px;
		flex-wrap: wrap;
	}
	.tag-word {
		color: var(--text-secondary);
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.02em;
	}
	/* Theme lane colors: the design system ships per-theme --tag-* tokens
	   (steel-dark's orange/red/cyan vs light's muted sets). Mapping each
	   Extract tag word to its lane makes the panel visibly adopt the active
	   theme instead of reading as flat gray. A colored 6px tick + tinted
	   label = the "theme shows up here" hook. */
	.tag-word::before {
		content: '';
		display: inline-block;
		width: 6px;
		height: 6px;
		margin-right: 6px;
		border-radius: 2px;
		vertical-align: baseline;
		background: var(--lane-color, var(--text-muted));
	}
	.tag-word.lane-red { --lane-color: var(--tag-red); color: color-mix(in srgb, var(--tag-red) 72%, var(--text-secondary)); }
	.tag-word.lane-yellow { --lane-color: var(--tag-yellow); color: color-mix(in srgb, var(--tag-yellow) 78%, var(--text-secondary)); }
	.tag-word.lane-cyan { --lane-color: var(--tag-cyan); color: color-mix(in srgb, var(--tag-cyan) 72%, var(--text-secondary)); }
	.tag-word.lane-blue { --lane-color: var(--tag-blue); color: color-mix(in srgb, var(--tag-blue) 72%, var(--text-secondary)); }
	.tag-word.lane-pink { --lane-color: var(--tag-pink); color: color-mix(in srgb, var(--tag-pink) 72%, var(--text-secondary)); }
	.tag-word.lane-orange { --lane-color: var(--tag-orange); color: color-mix(in srgb, var(--tag-orange) 72%, var(--text-secondary)); }
	.tag-word.lane-muted { --lane-color: var(--text-muted); }
	/* On the dirty (warning-tinted) block, keep the tag readable but dim the
	   lane tick so the edited-state border stays the primary signal. */
	.extract-block.dirty .tag-word::before {
		opacity: 0.6;
	}
	.range {
		font-family: var(--font-mono, monospace);
		font-size: 11px;
		color: var(--text-primary);
	}
	.provenance {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--text-muted);
	}
	.provenance.active {
		color: var(--text-secondary);
	}
	.dirty-mark {
		margin-left: auto;
		color: var(--warning-color, var(--text-muted));
		font-size: 11px;
	}
	.extract-prompt-edit {
		width: 100%;
		box-sizing: border-box;
		margin-top: 4px;
		padding: 6px 8px;
		font-family: var(--font-mono, monospace);
		font-size: 11px;
		line-height: 1.5;
		border: 1px solid var(--border-color);
		border-radius: 5px;
		background: var(--bg-tertiary);
		color: var(--text-primary);
		resize: vertical;
		min-height: 40px;
		transition: border-color var(--transition-fast, 0.15s ease),
			box-shadow var(--transition-fast, 0.15s ease);
	}
	.extract-prompt-edit:focus {
		outline: none;
		border-color: var(--accent-color);
		box-shadow: 0 0 0 3px var(--accent-bg, rgba(89, 181, 255, 0.2));
	}
	.extract-block.dirty .extract-prompt-edit {
		border-color: color-mix(in srgb, var(--warning-color, #fbbf24) 60%, var(--border-color));
	}
	.extract-prompt {
		font-size: 13px;
		color: var(--text-primary);
		white-space: pre-wrap;
	}
	.hint {
		color: var(--text-muted);
		font-size: 11px;
	}

	/* Respect the user's motion preference: drop the sine tweens, keep the
	   state changes instant (design doc §6 motion is additive, not load-bearing). */
	@media (prefers-reduced-motion: reduce) {
		* {
			transition-duration: 0.001ms !important;
			transition-timing-function: linear !important;
		}
	}
</style>
