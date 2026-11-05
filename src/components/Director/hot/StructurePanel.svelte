<script lang="ts">
	// Phase 3: the S0.5 STRUCTURAL TREE panel — a collapsible "Film Structure"
	// card that sits between ① DIRECTION and ② NOVEL. Presentational: it
	// renders the `StructuralTree` the engine attached to the run and exposes
	// the manual-override pins (the "always give the user a manual
	// opportunity" rule) as bound inputs. All shared state is parent-owned;
	// this component writes back through `bind:overrides` + an `onOverrides`
	// callback (or the parent reads the local pin state it owns).
	//
	// The tree is a BRIEF, not a cage: the card shows the fixed *shape*
	// (driver, energy curve, chained color-temperature arc, per-branch
	// transition intent, continuity thread, auto scale) and the "auto N×M"
	// hint; every value is overridable via the pins below it.
	import { branchNarrativeHint, treeSummary, type Driver, type StructuralTree, type TreeOverrides, VOCAB } from '$lib/directorStore/engine';

	let {
		tree,
		overrides = $bindable({}),
		disabled = false,
	} = $props<{
		/** The run's S0.5 structural tree (null before a run / old docs). */
		tree: StructuralTree | null | undefined;
		/** The entry's manual-override pins (parent-owned; the panel writes
		 back via this $bindable so a pin survives into the next run).
		 Optional + defaulting to `{}` so an entry without the key (old docs)
		 still gets a stable binding target — mirrors MoodSlider's
		 `mood = $bindable()` pattern. */
		overrides?: TreeOverrides;
		/** Disabled while a run is in flight (the tree is read-only then). */
		disabled?: boolean;
	}>();

	// Collapsed by default — the hot path stays clean; the user opens it to
	// see / tune the shape.
	let open = $state(false);

	const DRIVERS = ['neutral', 'action', 'atmosphere', 'character', 'exploration'] as const;

	// The auto scale hint (pre-override), read as "auto N×M".
	const autoHint = $derived(
		tree?.auto_scale ? `auto ${tree.auto_scale.scenes}×${tree.auto_scale.shots_per_scene}` : 'auto',
	);

	// The driver pin: an empty select = "auto" (the tree's scan wins).
	const driverPin = $derived(overrides.driver ?? '');
	const setDriverPin = (v: string) => {
		overrides.driver = v === '' ? null : v;
	};

	// Phase 2.5: the branch's advisory NARRATIVE HINT. It reads through the
	// ACTIVE driver — the user's pin when set, else the tree's derived
	// driver — so pinning the driver steers the story hint without ever
	// touching the user's idea text (the "hint, not a cage" rule). The hint
	// is advisory: the LLM may freely adapt or ignore it.
	const activeDriver = $derived<Driver>(
		(overrides.driver ?? tree?.root.driver ?? 'neutral') as Driver,
	);
	const hintFor = (i: number): string => {
		const role = tree?.branches[i]?.role ?? '';
		return branchNarrativeHint(role, activeDriver);
	};

	// Per-branch transition pins (index-aligned; null = auto).
	const transPin = (i: number): string => overrides.transitions?.[i] ?? '';
	const setTransPin = (i: number, v: string) => {
		const arr = (overrides.transitions ??= []);
		while (arr.length <= i) arr.push(null);
		arr[i] = v === '' ? null : v;
	};
</script>

{#if tree}
	<section class="struct" aria-label="Film structure">
		<header class="struct-head" onclick={() => (open = !open)}>
			<span class="struct-title">
				②·S FILM STRUCTURE
				<code class="struct-summary" title="driver · target runtime · branch roles">
					{treeSummary(tree)}
				</code>
			</span>
			<span class="struct-caret" aria-hidden>{open ? '–' : '+'}</span>
		</header>

		{#if open}
			<div class="struct-body">
				<!-- The fixed shape (the "brief"): thesis + continuity. -->
				<div class="struct-lines">
					<p><span class="k">thesis</span> {tree.root.thesis}</p>
					<p><span class="k">continuity</span> {tree.root.continuity_thread}</p>
					<p>
						<span class="k">driver</span> {tree.root.driver}
						<span class="k"> · target</span> ~{tree.root.target_duration_s}s
						<span class="k"> · {autoHint}</span>
					</p>
				</div>

				<!-- The energy curve + chained temp arc, per branch. -->
				<ol class="struct-branches">
					{#each tree.branches as b, i}
						<li class="branch">
							<div class="branch-top">
								<code class="branch-role">{b.role}</code>
								<span class="branch-meta">
									{b.shots} shots · in <code>{b.transition_in}</code> · out <code>{b.transition_out}</code>
								</span>
							</div>
							<div class="branch-arc">
								<!-- The energy bar (0..=1 → width %). -->
								<span class="bar" title="energy {b.energy.toFixed(2)}">
									<span class="bar-fill" style="width: {(b.energy * 100).toFixed(0)}%"></span>
								</span>
								<!-- The chained temp arc: open→close K. -->
								<span class="arc" title="color temperature {b.temp_open_k}→{b.temp_close_k}K">
									{b.temp_open_k}→{b.temp_close_k}K
								</span>
							</div>
							<!-- Phase 2.5: the advisory story-direction hint
							     (role through the active driver's lens).
							     Deliberately quiet + labeled "hint" — it
							     steers, never overrides; the LLM may
							     adapt it freely. -->
							<p class="branch-hint" title="Advisory only — steers the story direction, never overrides your idea">
								<code class="hint-tag">hint</code> {hintFor(i)}
							</p>
						</li>
					{/each}
				</ol>

				<!-- The manual-override pins (the "always give the user a
				     manual opportunity" rule). Empty = the tree's auto value
				     wins. -->
				<details class="struct-pins {disabled ? 'is-disabled' : ''}">
					<summary>Pins <span class="k">· override the auto shape</span></summary>
					<div class="pin-grid">
						<label>
							<span class="k">driver</span>
							<select
								disabled={disabled}
								value={driverPin}
								onchange={(e) => setDriverPin((e.target as HTMLSelectElement).value)}>
								<option value="">auto</option>
								{#each DRIVERS as d}
									<option value={d}>{d}</option>
								{/each}
							</select>
						</label>
						<label>
							<span class="k">scenes</span>
							<input
								type="number"
								min="1"
								max="24"
								disabled={disabled}
								value={overrides.scenes ?? ''}
								placeholder="auto"
								oninput={(e) => {
									const n = (e.target as HTMLInputElement).value;
									overrides.scenes = n === '' ? null : Number(n);
								}}
							/>
						</label>
						<label>
							<span class="k">shots/scene</span>
							<input
								type="number"
								min="1"
								max="5"
								disabled={disabled}
								value={overrides.shots_per_scene ?? ''}
								placeholder="auto"
								oninput={(e) => {
									const n = (e.target as HTMLInputElement).value;
									overrides.shots_per_scene = n === '' ? null : Number(n);
								}}
							/>
						</label>
						<label>
							<span class="k">target s</span>
							<input
								type="number"
								min="4"
								max="240"
								disabled={disabled}
								value={overrides.target_duration_s ?? ''}
								placeholder="auto"
								oninput={(e) => {
									const n = (e.target as HTMLInputElement).value;
									overrides.target_duration_s = n === '' ? null : Number(n);
								}}
							/>
						</label>
					</div>

					{#if tree.branches.length > 1}
						<!-- Per-branch transition pins (only the interior
						     boundaries matter; branch 0's in is the opener). -->
						<div class="pin-trans">
							<span class="k">scene-entry transition</span>
							{#each tree.branches as b, i}
								<label class="pin-trans-cell">
									<code>{i + 1}</code>
									<select
										disabled={disabled}
										value={transPin(i)}
										onchange={(e) => setTransPin(i, (e.target as HTMLSelectElement).value)}>
										<option value="">auto</option>
										{#each VOCAB.transition as t}
											<option value={t}>{t}</option>
										{/each}
									</select>
								</label>
							{/each}
						</div>
					{/if}
					<p class="pin-hint">
						Left empty, the tree's auto value wins — the pins are for when you want to hold a shape.
					</p>
				</details>
			</div>
		{/if}
	</section>
{:else}
	<section class="struct struct-empty">
		<span class="k">Structure</span>
		<span class="hint">runs before the first engine run; re-run to see the structural tree.</span>
	</section>
{/if}

<style>
	/* Design tokens only (Template A): hairline, quiet, no new color families.
	   Motion is instant here (a structure card, not an animation surface). */
	.struct {
		border: 1px solid var(--border-color);
		border-radius: 10px;
		background: var(--bg-secondary);
		box-shadow: var(--shadow-sm, none);
		overflow: hidden;
	}
	.struct-empty {
		display: flex;
		gap: 8px;
		align-items: baseline;
		padding: 10px 14px;
	}

	.struct-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 10px 14px;
		cursor: pointer;
		transition: background var(--transition-fast, 0.15s ease);
	}
	.struct-head:hover {
		background: var(--bg-hover, transparent);
	}
	.struct-title {
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.04em;
		color: var(--text-secondary);
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}
	.struct-summary {
		font-family: var(--font-mono, monospace);
		font-size: 11px;
		font-weight: 400;
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}
	.struct-caret {
		font-family: var(--font-mono, monospace);
		color: var(--text-muted);
		font-size: 14px;
	}

	.struct-body {
		padding: 0 14px 14px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.k {
		color: var(--text-muted);
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}
	.hint {
		color: var(--text-muted);
		font-size: 11px;
	}

	.struct-lines p {
		margin: 0 0 4px;
		font-size: 12px;
		line-height: 1.5;
		color: var(--text-primary);
	}
	.struct-lines p:last-child {
		margin: 0;
	}

	.struct-branches {
		margin: 0;
		padding: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.branch {
		border: 1px solid var(--border-color);
		border-radius: 6px;
		padding: 8px 10px;
		background: var(--bg-elevated);
	}
	.branch-top {
		display: flex;
		align-items: baseline;
		gap: 8px;
	}
	.branch-role {
		font-family: var(--font-mono, monospace);
		font-size: 11px;
		font-weight: 600;
		color: var(--text-primary);
	}
	.branch-meta {
		font-family: var(--font-mono, monospace);
		font-size: 11px;
		color: var(--text-secondary);
	}
	.branch-arc {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: 6px;
	}
	/* The energy bar: a quiet 4px track + a % fill. */
	.bar {
		position: relative;
		flex: 1;
		height: 4px;
		border-radius: 2px;
		background: var(--bg-tertiary, rgba(128, 128, 128, 0.15));
		overflow: hidden;
	}
	.bar-fill {
		position: absolute;
		inset: 0 auto 0 0;
		background: var(--accent-color, #59b5ff);
		opacity: 0.75;
	}
	.arc {
		font-family: var(--font-mono, monospace);
		font-size: 11px;
		color: var(--text-muted);
		white-space: nowrap;
	}
	/* Phase 2.5: the advisory story-direction hint — deliberately the quietest
	   text in the card (so it reads as "a cue", not "the story"). */
	.branch-hint {
		margin: 6px 0 0;
		font-size: 11px;
		line-height: 1.4;
		color: var(--text-muted);
	}
	.hint-tag {
		font-family: var(--font-mono, monospace);
		font-size: 9px;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--accent-color, var(--text-secondary));
		opacity: 0.7;
		margin-right: 4px;
	}

	/* The manual-override pins (the "always give the user a manual
	   opportunity" rule). A <details> keeps them out of the way until wanted. */
	.struct-pins {
		border: 1px dashed var(--border-color);
		border-radius: 6px;
		padding: 8px 10px;
	}
	.struct-pins.is-disabled {
		opacity: 0.5;
	}
	.struct-pins summary {
		cursor: pointer;
		font-size: 11px;
		font-weight: 600;
		color: var(--text-secondary);
		letter-spacing: 0.04em;
		user-select: none;
	}
	.struct-pins.is-disabled summary {
		cursor: not-allowed;
	}
	.pin-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: 8px;
		margin-top: 8px;
	}
	.pin-grid label {
		display: flex;
		flex-direction: column;
		gap: 3px;
		font-size: 11px;
	}
	.pin-grid input,
	.pin-grid select,
	.pin-trans select {
		font: inherit;
		font-size: 12px;
		color: var(--text-primary);
		background: var(--bg-tertiary, transparent);
		border: 1px solid var(--border-color);
		border-radius: 4px;
		padding: 4px 6px;
	}
	.pin-trans {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 10px;
		align-items: baseline;
	}
	.pin-trans-cell {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 11px;
	}
	.pin-trans-cell code {
		font-family: var(--font-mono, monospace);
		color: var(--text-muted);
	}
	.pin-trans-cell select {
		min-width: 96px;
	}
	.pin-hint {
		margin: 10px 0 0;
		font-size: 11px;
		color: var(--text-muted);
	}

	@media (prefers-reduced-motion: reduce) {
		* {
			transition-duration: 0.001ms !important;
		}
	}
</style>
