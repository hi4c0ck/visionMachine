<script lang="ts">
	// Director's-harness tab bodies. Design: docs/director-harness-ui-system.md
	// (tabbed composer). The Director tab now saturates the full S0→S5 engine
	// flow (FilmSeed → VisualNovel → SceneSpec → ShotSpec → derive → VERIFY)
	// with the G0–G4 gate strip; Extract + Scoreboard read from the same doc.
	// Destructive regenerate-pipes stays a sharp edge (I9): rendered disabled.
	//
	// Foundation split (milestone P): this component is now the slim PARENT —
	// it owns ALL shared state + business logic and renders four
	// presentational children:
	//   • hot/DirectorHotPath.svelte — ① DIRECTION · ② NOVEL · ③ STEP CHAIN
	//     (+ the destructive apply row; M1 slot inside for RunLog/TimelinePreview)
	//   • adv/DirectorAdvanced.svelte — the <details class="advanced"> block
	//   • ext/ExtractTab.svelte — the concrete editable sections
	//   • ext/ScoreboardTab.svelte — tag bars, runs ledger, cards, sparkline
	// The children hold no business logic; cross-tab deriveds (stepChain,
	// gatesShown, engine, localExtract seeding) stay here.

	import { invoke } from '@tauri-apps/api/core';
	import { flashToast } from '$lib/flashToast';
	import { ask, save, open } from '@tauri-apps/plugin-dialog';
	import {
		toSeedCard,
		fromSeedCard,
		parseSeedCard,
		seedCardToJson,
	} from '$lib/directorStore/seedCard';
	import {
		runFlow,
		listFlows,
		loadFlow,
		applyFlow,
		applyFlowEdited,
		saveScratch,
		loadScratch,
		type DirectorTab,
		type EditedSection,
	} from '$lib/directorStore';
	import { loadSession } from '$lib/composerStore';
	import { tripEffect } from '$lib/pipelineDiag';
	import {
		type FlowDocument,
		type FlowSummary,
	} from '$lib/directorStore/types';
	// Settled-flow cache (2026-11-10 "generated data doesn't sustain session
	// switch" fix): session id → the last settled listFlows + loadFlow
	// result. Module-level so it survives component remounts (DirectorPanel
	// unmounts when selectedSession is null during loading) — without the
	// module scope, the seed effect re-issued listFlows on every remount.
	//
	// The OLD design was a bare "settled" Set with no data: on a revisit
	// (A→B→A) the guard `module.has(id)` short-circuited while the
	// component-local `doc` had been wiped by the reset effect, so the
	// persisted flow was NEVER re-listed / re-loaded — the panel re-seeded
	// from the localStorage draft only ("I see only the initial prompt
	// again"). The cache carries the settled result, so a revisit hydrates
	// SYNCHRONOUSLY (no second listFlows, no re-render loop), and the
	// generated data outlives the switch.
	//
	// One settled copy per session (single producer: the seed loader writes
	// it once per session; a new run overwrites the entry in place — it
	// never appends a second copy). Bounded: evict oldest past the cap
	// (insertion order) so a session swing can't grow it without limit —
	// the same bound the old Set had.
	const settledFlowCache = new Map<
		string,
		{ flows: FlowSummary[]; doc: FlowDocument | null; activeRun: number | null }
	>();
	const LOADED_LATCH_CAP = 64;
	function rememberSettled(
		sid: string,
		record: { flows: FlowSummary[]; doc: FlowDocument | null; activeRun: number | null },
	) {
		settledFlowCache.set(sid, record);
		if (settledFlowCache.size > LOADED_LATCH_CAP) {
			for (const key of settledFlowCache.keys()) {
				if (settledFlowCache.size <= LOADED_LATCH_CAP) break;
				settledFlowCache.delete(key);
			}
		}
	}
	import {
		concernSummary,
		specsByScene,
		timelineRows,
		type EngineEntryInput,
		type EngineRun,
	} from '$lib/directorStore/engine';
	import { loadEntryDraft, saveEntryDraft } from '$lib/directorStore/entryDraft';
	import DirectorHotPath from './hot/DirectorHotPath.svelte';
	import DirectorAdvanced from './adv/DirectorAdvanced.svelte';
	import ExtractTab from './ext/ExtractTab.svelte';
	import ScoreboardTab from './ext/ScoreboardTab.svelte';

	let {
		activeTab,
		sessionId,
		sessionName,
		pipeCount,
		onLogSignal,
		onRunningChange,
		onMetaChange,
		onApplied,
	} = $props<{
		activeTab: DirectorTab;
		sessionId: string;
		sessionName: string;
		pipeCount: number;
		/** Signal capture sink (Workspace forwards to directorStore.logSignal). */
		onLogSignal: (
			kind: 'edit_diff' | 'accept' | 'reject' | 'rate',
			targetSpan: string,
			note?: string
		) => Promise<string>;
		/** Run-liveness sink so the strip's Director badge (design §1 guard)
		 stays honest while the user sits on another tab. */
		onRunningChange?: (running: boolean) => void;
		/** Strip-badge sink (design §1 "badge ownership"): the non-Pipes tab's
		 own badge shows in place of pipe-count. `extractSections` = fresh
		 structural-text sections; `stale` = a newer flow doc exists than the
		 one being scored. */
		onMetaChange?: (meta: { extractSections: number; stale: boolean }) => void;
		/** Composer reconcile hook (I9 apply): fires AFTER a destructive
		 apply has reloaded the session from the backend, so the host can
		 re-sync the freshly-applied pipes into its project tree (which the
		 Pipes tab renders from). Without it, applied pipes stay hidden until
		 the session is re-opened. */
		onApplied?: (sessionId: string) => void;
	}>();

	// ── G0 entry state (the S0 input the UI authors) ──────────────────────
	// The idea is the single source of truth; the rest are G0 look/params.
	// On load/run, backfilled from the engine seed so controls reflect the run.
	// Persisted per session (entryDraft) so leaving the Director tab (panel
	// unmounts on 'pipes') never loses typed text — a re-mount restores it.
	const defaultEntry: EngineEntryInput = {
		title: '',
		idea: '',
		input_text: '',
		genre: { name: 'Cinematic', style: 'cinematic natural light' },
		ratio: '16:9',
		scale: { scenes: 1, shots_per_scene: 2, clip_s: [8, 10] },
		time_of_day: 'midday',
		weather: 'clear',
		// Phase 3: the S0.5 tree's manual-override pins. Always a stable
		// (possibly empty) object so the StructurePanel's `bind:overrides`
		// has a valid target; empty = every pin absent = the tree's auto
		// values win.
		overrides: {},
	};
	// ARCHITECTURAL IMMUTABILITY (one-copy-at-a-time structural-asset model):
	// the G0 template is a single shared, READ-ONLY constant. It is deep-
	// frozen so no code path can corrupt it in place — the "is the template
	// still intact?" invariant is now ENFORCED, not assumed. Every session
	// then owns its own deep VALUE copy (the one-and-only writable
	// instance), so typing in session A can only touch A's copy, never the
	// template or session B's copy.
	// Deep-frozen template. `as EngineEntryInput` drops the nested Readonly
	// wrappers at the TYPE level only — at runtime every nested object is
	// still frozen, so the "one-copy-at-a-time" invariant is ENFORCED.
	// freshEntry below produces a plain unfrozen VALUE copy, typed as
	// EngineEntryInput (fully writable by the session's $state).
	const frozenDefaultEntry = Object.freeze({
		...defaultEntry,
		genre: Object.freeze({ ...defaultEntry.genre }),
		scale: Object.freeze({ ...defaultEntry.scale, clip_s: Object.freeze([...defaultEntry.scale.clip_s]) }),
		overrides: Object.freeze({ ...defaultEntry.overrides }),
	}) as EngineEntryInput;
	// Fresh per-session entry: a deep VALUE copy of the frozen template.
	// A copy (not the frozen object) so $state can proxy and the session
	// can write its own idea/look without touching the read-only template.
	const freshEntry = (): EngineEntryInput => ({
		...frozenDefaultEntry,
		genre: { ...frozenDefaultEntry.genre },
		scale: { ...frozenDefaultEntry.scale, clip_s: [...frozenDefaultEntry.scale.clip_s] },
		overrides: { ...frozenDefaultEntry.overrides },
	});
	// Phase 3: guarantee a stable `overrides` object (the StructurePanel binds
	// into it). Old / pre-Phase-3 drafts + fresh entries lack the key, so
	// normalize to `{}` (all pins absent = the tree's auto values win).
	const normalizeEntry = (e: EngineEntryInput): EngineEntryInput => ({
		...e,
		overrides: e.overrides ?? {},
	});
	// svelte-ignore state_referenced_locally — intentional: seed draft from sessionId, sync via effect
	let entry = $state<EngineEntryInput>(normalizeEntry(loadEntryDraft(sessionId) ?? freshEntry()));

	// Save the G0 draft whenever it changes so a re-mount after 'Pipes'
	// restores the typed text. Empty idea clears it.
	// CROSS-SESSION GUARD: this save effect is declared BEFORE the
	// session-reset effect, so on a session switch it runs FIRST with the
	// PREVIOUS session's `entry` still in place: writing the old draft
	// under the NEW session id, then the reset effect re-seeds `entry`
	// from that same just-written draft → every session opened in Director
	// shows the previous session's prompt ("director content shared across
	// all sessions"). Only save once the current session's reset has run
	// (`lastSession === sessionId`); reading `lastSession` (a $state) tracks
	// it, so after the reset flips it the effect re-runs and persists the
	// CORRECT draft for the new session.
	$effect(() => {
		if (lastSession !== sessionId) return;
		saveEntryDraft(sessionId, entry);
	});

	let doc = $state<FlowDocument | null>(null);
	let flows = $state<FlowSummary[]>([]);
	let running = $state(false);
	let runError = $state<string | null>(null);
	let activeRun = $state<number | null>(null);
	let openTag = $state<string | null>(null);
	let openShot = $state<string | null>(null);

	// Gate confirmations the user made in-tab (persisted to the signal log;
	// the strip reflects them live). `g<gate>` = a gate the user confirmed.
	let confirmedGates = $state<Set<string>>(new Set());
	// Transient action feedback (confirm / accept / reject / apply) so a click
	// is never silent. Clears on its own.
	let feedback = $state<{ text: string; tone: string } | null>(null);
	let applyWorking = $state(false);
	// Wall-clock ms for the last run (the step-chain expand/structure/lower
	// rows show it so the user sees the run actually happened, not just a chip).
	let runDurationMs = $state<number | null>(null);

	// Step-chain values for the Phase-1 hot path (4 rows: expand / structure /
	// critic / lower). Real values, not placeholders. Rendered by the
	// hot-path child (M1: RunLog + TimelinePreview will replace the list).
	const stepChain = $derived.by(() => {
		const e = engine;
		const d = doc;
		if (!d) return null;
		const ms = runDurationMs != null ? `${runDurationMs}ms` : '—';
		const criticModel = d.criticModel;
		return [
			{
				name: 'expand',
				ver: 'v1',
				src: e ? (e.expansion === 'llm' ? `LLM · ${e.expansion_note ?? ''}`.trim() : 'template') : '—',
				state: '✓',
				stateClass: 'step-ok',
			},
			{
				name: 'structure',
				ver: 'v1',
				src: e ? `local · ${e.scenes.length} scene(s)` : '—',
				state: '✓',
				stateClass: 'step-ok',
			},
			{
				name: 'critic',
				ver: `v${d.regen.version.criticModelVersion}`,
				src: criticModel?.untrained ? 'untrained stub' : `model v${d.regen.version.criticModelVersion}`,
				state: '—',
				stateClass: 'step-mut',
			},
			{
				name: 'lower',
				ver: 'v1',
				src: e ? `local · ${e.molecules.length} molecule(s)` : '—',
				state: '✓',
				stateClass: 'step-ok',
			},
		];
	});

	// ── Phase 2: Extract tab — editable concrete sections ────────────────
	// Mirrors the concrete structure produced by Rust's EngineRun::plan_from_engine:
	// one pipe per shot. DELTA-DRIVEN: a concern section is emitted ONLY at the
	// sub-slice where it actually CHANGES (the harness diffStates contract); a
	// flat concern is not repeated — it lives once in the pipe's global_style
	// (the sustained base). The TS `localExtract` list must match the Rust
	// section ordering + pipeIndex/occurrence so `applyFlowEdited` targets the
	// right slots.
	type LocalSection = {
		pipeIndex: number; // shot ordinal (0-based across all shots)
		tag: string; // the closed concern vocabulary — the addressing key
		occurrence: number; // Nth section of this tag in the pipe
		range: string;
		prompt: string;
		source: string;
	};
	let localExtract = $state<LocalSection[]>([]);
	// Dirty count: how many sections have been edited away from their source.
	const dirtyCount = $derived(localExtract.filter((s) => s.prompt.trim() !== s.source.trim()).length);
	// Distinct shot pipes across the extracted structure (not a fixed divisor —
	// each pipe carries its own arc + meta section count).
	const extractPipeCount = $derived(new Set(localExtract.map((s) => s.pipeIndex)).size);

	// Mirror of derive.rs helpers — must produce the SAME strings Rust does.
	// Params are the mirror concern shapes (optional fields), matching
	// engine.ts exactly so the Extract list stays 1:1 with the concrete plan.
	function compositionText(cam: { size?: string; angle?: string; framing?: string; dof?: string }): string {
		const bits: string[] = [];
		if (cam.size) bits.push(`${cam.size} shot`);
		if (cam.angle && cam.angle !== 'eye') bits.push(`${cam.angle} angle`);
		if (cam.framing && cam.framing !== 'centered') bits.push(`${cam.framing} framing`);
		if (cam.dof) bits.push(`${cam.dof} depth of field`);
		return bits.join(', ');
	}
	function motionText(mot: { move?: string; zoom?: string; speed?: string }): string {
		const bits: string[] = [];
		if (mot.move && mot.move !== 'static') bits.push(mot.move);
		if (mot.zoom && mot.zoom !== 'static') bits.push(`zoom ${mot.zoom}`);
		if (mot.speed && mot.speed !== 'normal') bits.push(`${mot.speed} speed`);
		return bits.join(', ');
	}
	function lightText(lit: { key?: string; contrast?: string; color_temp_K?: number; pattern?: string | null }): string {
		const bits: string[] = [];
		if (lit.key) bits.push(`${lit.key} key light`);
		if (lit.contrast) bits.push(`${lit.contrast} contrast`);
		if (lit.color_temp_K && lit.color_temp_K > 0) bits.push(`${lit.color_temp_K}K`);
		if (lit.pattern) bits.push(lit.pattern);
		return bits.join(', ');
	}
	function gradeText(grade: { palette?: string; saturation?: string; film_stock?: string }): string {
		const bits: string[] = [];
		if (grade.palette) bits.push(`${grade.palette} palette`);
		if (grade.saturation && grade.saturation !== 'neutral') bits.push(grade.saturation);
		if (grade.film_stock) bits.push(`${grade.film_stock} film stock`);
		return bits.join(', ');
	}

	// Seed localExtract from the engine's shot specs + concerns (1:1 mirror
	// of Rust's plan_from_engine). `source` holds the original prompt so a
	// section is "dirty" when its `prompt` no longer equals `source`.
	$effect(() => {
		const e = engine;
		if (!e?.specs || !e?.scenes) {
			localExtract = [];
			return;
		}
		// specsByScene gives us the real per-scene grouping with scene data.
		const out: LocalSection[] = [];
		let shotOrd = 0; // global shot ordinal = pipeIndex
		for (const grp of specsByScene(e)) {
			for (const sp of grp.specs) {
				// (transition windows are now computed per boundary, see below)

				// Per-slice concern helpers (mirror of the Rust delta-driven
				// emission): a concern section is emitted ONLY where the slice
				// states that concern — never re-stated as a whole-shot slab.
				const camFor = (cam: { size?: string; angle?: string; framing?: string; dof?: string }, lens?: { focal_mm?: number }): string => {
					const base = compositionText(cam);
					const suf = lens?.focal_mm && lens.focal_mm > 0 ? ` · ${lens.focal_mm}mm lens` : '';
					return base + suf;
				};
				const lightingFor = (lc: { key?: string; contrast?: string; color_temp_K?: number; pattern?: string | null }, grade?: { palette?: string; saturation?: string; film_stock?: string }): string => {
					const parts = [lightText(lc), grade ? gradeText(grade) : ''].filter(Boolean);
					return parts.join('; ');
				};
				const effectFor = (efx: string[] | undefined): string => {
					const kept = (efx ?? []).filter((x) => x && x !== 'none');
					return kept.length ? `effects: ${kept.join(', ')}` : '';
				};

				const clipF = sp.clip_s * 24;
				const rng = (a: number, b: number) => `${String(a).padStart(2, '0')}–${b}`;

				// Per-tag occurrence counter within this pipe (Rust's plan
				// order: delta-driven slice events first, then the cut-in).
				const occ = new Map<string, number>();
				const push = (tag: string, prompt: string, start: number, end: number) => {
					if (prompt.trim() && end > start) {
						const n = occ.get(tag) ?? 0;
						occ.set(tag, n + 1);
						out.push({
							pipeIndex: shotOrd,
							tag,
							occurrence: n,
							range: rng(start, end),
							prompt,
							source: prompt,
						});
					}
				};

				// DELTA-DRIVEN ARCS (mirror of Rust plan_from_engine): the
				// shot's STORY (Scene) plus every concern that CHANGES at a
				// slice (Camera / Lighting / Motion / Effect). No sub-slices →
				// one sustained base pair (Scene + base Camera), both full-clip.
				const prose = sp.content.prose;
				const slices = sp.sub_timeline.length ? sp.sub_timeline : null;
				// Cap a beat to ~10 words (mirrors Rust cap_words(_, 10)) so a
				// verbose LLM beat can't over-detail and squash the model.
				const capWords = (s: string, n: number) =>
					s.trim().split(/\s+/).slice(0, n).join(' ');
				if (!slices) {
					push('scene', prose, 0, clipF);
					push('camera', camFor(sp.concerns.camera, sp.concerns.lens), 0, clipF);
				} else {
					slices.forEach((sl, i) => {
						const s0 = sl.from_s * 24;
						const s1 = Math.max(sl.to_s * 24, s0 + 1);
						// SCENE arc (lean): slice 0 = the shot's own sentence
						// (prose) + one capped beat; later slices = just their
						// capped beat. Content-driven slices carry their beat
						// texts in absorbed_beats; the cycling template path
						// falls back to the positional beats[i].
						const beatHere = sl.absorbed_beats?.length
							? sl.absorbed_beats.join(' · ')
							: sp.content.beats[i] ?? '';
						const beat = capWords(beatHere, 10);
						const p = i === 0 ? (beat ? `${prose} · ${beat}` : prose) : beat;
						if (p) push('scene', p, s0, s1);
						const st = sl.state;
						// CAMERA event: only where this slice states a camera.
						if (st?.camera) push('camera', camFor(st.camera, st.lens ?? undefined), s0, s1);
						// LIGHTING event: only where this slice changes the light.
						if (st?.lighting) push('lighting', lightingFor(st.lighting, st.grade ?? undefined), s0, s1);
						// MOTION event: a FINITE move (speed-bounded), not a
						// whole-slice slab — the move occupies a bounded part of
						// the slice, then the camera holds.
						if (st?.motion) {
							const mt = motionText({ move: st.motion.move, zoom: st.motion.zoom, speed: st.motion.speed });
							if (mt) {
								const sliceLen = s1 - s0;
								const moveF =
									st.motion.speed === 'slow' ? 48
									: st.motion.speed === 'fast' ? 24
									: 36;
								const mEnd = Math.max(s0 + 1, s0 + Math.min(moveF, sliceLen));
								push('motion', mt, s0, mEnd);
							}
						}
						// EFFECT event: only where this slice adds an effect.
						if (st?.effects && st.effects.length) {
							const ef = effectFor(st.effects);
							if (ef) push('effect', ef, s0, s1);
						}
					});
				}

				// TRANSITION: windowed cut EVENTS at the shot's BOUNDARIES,
				// sized by the transition TYPE (mirrors Rust trans_window).
				// hard_cut/jump_cut = the clip join itself → no section.
				// Two windows: IN at [0, dur] and OUT at [clipF - dur, clipF].
				const transDur = (t: string): number => {
					if (t === 'l_cut' || t === 'j_cut') return 12;
					if (t === 'match_cut') return 24;
					if (t === 'crossfade' || t === 'dissolve' || t === 'wipe')
						return Math.min(Math.floor((clipF * 4) / 10), 24);
					return 0;
				};
				const inDur = transDur(sp.transition_in);
				if (inDur > 0) push('transition', sp.transition_in, 0, inDur);
				const outDur = transDur(sp.transition_out);
				if (outDur > 0 && clipF > outDur + 1)
					push('transition', `${sp.transition_out} (out)`, clipF - outDur, clipF);

				shotOrd++;
			}
		}
		localExtract = out;
		// Durable scratch: load the session's on-disk G0 entry + unapplied
		// extract edits once (cache short-circuits re-runs), then re-apply
		// the stored edits onto this fresh seed. Idempotent — setting a prompt
		// to its stored value is a no-op, and the persist effect below folds
		// it back to disk without a change.
		void hydrateScratch(sessionId);
		applyScratchEdits(sessionId);
	});

	const isEdited = (s: LocalSection) => s.prompt.trim() !== s.source.trim();

	function editedList() {
		return localExtract
			.filter((s) => isEdited(s))
			.map((s) => ({ pipeIndex: s.pipeIndex, tag: s.tag, occurrence: s.occurrence, prompt: s.prompt }));
	}

	// ── Durable scratch (the whole Director dataset on disk) ──────────────
	// The committed flow runs / signals / golden set are already persisted
	// (flow.v{N}.json + flow_signals.jsonl + golden.json). The two pieces
	// that were in-memory-only — the in-progress G0 entry draft and the
	// unapplied Extract-tab section edits — now ride one small
	// `director_scratch.json` in the session flow dir (lazy: debounced
	// write on change, read on session open). Frontend owns the JSON shape;
	// the backend stores an opaque string. Module-level cache (bounded) so a
	// fast session swing never re-invokes the backend load.
	const scratchCache = new Map<string, { entry?: EngineEntryInput | null; edits: EditedSection[] }>();
	const SCRATCH_CAP = 64;

	function cacheScratch(sessionId: string, v: { entry?: EngineEntryInput | null; edits: EditedSection[] }) {
		scratchCache.set(sessionId, v);
		if (scratchCache.size > SCRATCH_CAP) {
			for (const k of scratchCache.keys()) {
				if (scratchCache.size <= SCRATCH_CAP) break;
				scratchCache.delete(k);
			}
		}
	}

	// Re-apply a session's stored unapplied extract edits onto the just-seeded
	// localExtract (matched by pipeIndex+tag+occurrence). Safe: writes only the
	// prompts, which the persist effect will fold back to disk idempotently.
	function applyScratchEdits(sessionId: string) {
		const c = scratchCache.get(sessionId);
		if (!c || !c.edits.length) return;
		for (const e of c.edits) {
			for (const s of localExtract) {
				if (s.pipeIndex === e.pipeIndex && s.tag === e.tag && s.occurrence === e.occurrence) {
					s.prompt = e.prompt;
				}
			}
		}
	}

	// Restore the session's durable scratch from disk (async, non-blocking).
	// Disk entry wins only when nothing is in memory yet (empty idea), so it
	// never fights the committed-doc backfill precedence.
	async function hydrateScratch(sessionId: string) {
		if (scratchCache.has(sessionId)) {
			applyScratchEdits(sessionId);
			return;
		}
		const sid = sessionId;
		let raw = '';
		try {
			raw = await loadScratch(sid);
		} catch {
			return; // non-Tauri / backend unavailable → in-memory-only fallback
		}
		if (sid !== sessionId) return; // abandoned mid-flight
		let parsed: { entry?: EngineEntryInput | null; edits: EditedSection[] } | null = null;
		if (raw && raw.trim()) {
			try {
				parsed = JSON.parse(raw);
			} catch {
				parsed = null; // corrupt → treat as empty, never crash
			}
		}
		cacheScratch(sid, parsed ?? { entry: null, edits: [] });
		// Disk entry is authoritative only when the memory draft is empty.
		if (parsed?.entry?.idea?.trim() && entry.idea.trim() === '') {
			entry = { ...freshEntry(), ...parsed.entry };
		}
		applyScratchEdits(sid);
	}

	// Debounced durable persist: watch entry + the dirty-edit signature and
	// write scratch to disk. The effect only READS entry/localExtract and
	// issues an async invoke — it never writes any $state, so it cannot form
	// a write-what-you-read loop. 800ms debounce keeps a typing burst to one
	// lazy write.
	let scratchSaveTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		const sid = sessionId;
		const idea = entry.idea; // track entry (any G0 field) as the object identity changes on write
		const edits = editedList();
		const sig =
			idea + '|' +
			edits.map((e) => `${e.pipeIndex}:${e.tag}:${e.occurrence}:${e.prompt}`).join('§');
		if (scratchSaveTimer) clearTimeout(scratchSaveTimer);
		scratchSaveTimer = setTimeout(() => {
			if (sid !== sessionId) return; // session moved on → drop the write
			const hasEdits = edits.length > 0;
			const hasEntry = idea.trim().length > 0;
			if (!hasEdits && !hasEntry) {
				// Nothing worth keeping → clear the file so a stale draft
				// never resurfaces on the next open.
				void saveScratch(sid, '').catch(() => {});
				return;
			}
			const payload = JSON.stringify({
				entry: hasEntry ? entry : null,
				edits: hasEdits ? edits : [],
			});
			void saveScratch(sid, payload).catch(() => {});
		}, 800);
	});

	// Destructive regenerate from the EDITED sections (Phase 3).
	async function regeneratePipes() {
		if (!doc) return;
		const target = activeRun ?? doc.flowVersion;
		const edits = editedList();
		const ok = await ask(
			`Regenerate pipes from flow v${target}${edits.length ? ` with ${edits.length} edited section(s)` : ''}?\n\n` +
				`Replaces the session's composer pipes. No fallback — replay via the triple if needed.`,
			{ title: 'Regenerate pipes', kind: 'warning', okLabel: 'Regenerate', cancelLabel: 'Cancel' },
		);
		if (!ok) return;
		applyWorking = true;
		showFeedback(edits.length ? `Applying ${edits.length} edit(s)…` : 'Applying flow → composer…', 'tone-neutral');
		try {
			const count = await applyFlowEdited(sessionId, target, true, edits);
			await onLogSignal('edit_diff', `apply-edited-${target}`, `materialized ${count} pipes (${edits.length} edited)`).catch(() => {});
			await loadSession(sessionId);
			onApplied?.(sessionId);
			showFeedback(`Materialized ${count} pipe(s) into the composer`, 'tone-ok');
		} catch (e) {
			showFeedback(`Regenerate failed: ${String(e)}`, 'tone-danger');
			flashToast(String(e));
		} finally {
			applyWorking = false;
		}
	}

	function showFeedback(text: string, tone = 'tone-ok') {
		feedback = { text, tone };
		// Auto-clear; replace any pending timer.
		clearTimeout((showFeedback as any)._t);
		(showFeedback as any)._t = setTimeout(() => {
			feedback = null;
		}, 4000);
	}

	// Accept / reject the whole run (annotation queue, design §5): log the
	// signal + give visible confirmation.
	async function annotateRun(kind: 'accept' | 'reject') {
		if (!doc) return;
		const target = `run-${activeRun ?? doc.flowVersion}`;
		await onLogSignal(kind, target, kind === 'accept' ? 'run accepted' : 'run rejected').catch(
			() => {},
		);
		showFeedback(
			kind === 'accept' ? `Run v${activeRun ?? doc.flowVersion} accepted` : `Run v${activeRun ?? doc.flowVersion} rejected`,
			kind === 'accept' ? 'tone-ok' : 'tone-warn',
		);
	}

	// ── M2 seed card: export the G0 entry (+ novel preview) to a shareable
	//    one-file `.vmseed.json`; import one back into the G0 controls. The
	//    file IO is the Rust side (director_save/load_seed_card, 16KB guard);
	//    the UI owns the shape via seedCard.ts. Export needs a real idea; the
	//    first novel scene prose (when a run exists) rides along as the preview.
	let seedWorking = $state(false);

	function safeSeedName(): string {
		const base = (entry.title.trim() || entry.idea.trim() || 'seed').replace(/[^\w\-]+/g, '_').slice(0, 40) || 'seed';
		return `${base}.vmseed.json`;
	}

	async function exportSeedCard() {
		if (!entry.idea.trim() || seedWorking) return;
		// The shareable preview: the first novel scene prose (≤280 chars, the
		// seedCard cap). No run yet → omit the preview (the card is still valid).
		const preview = doc?.engine?.novel.scenes[0]?.prose;
		const card = toSeedCard(buildEntry(), preview ?? undefined);
		const cardJson = seedCardToJson(card);
		const path = await save({
			defaultPath: safeSeedName(),
			filters: [{ name: 'VisionMachine seed', extensions: ['vmseed', 'json'] }],
		}).catch(() => null);
		if (!path) return; // user cancelled the picker — silent no-op
		seedWorking = true;
		try {
			const out = await invoke<string>('director_save_seed_card', { path, cardJson });
			showFeedback(`Seed exported to ${out}`, 'tone-ok');
		} catch (e) {
			showFeedback(`Export failed: ${String(e)}`, 'tone-danger');
			flashToast(String(e));
		} finally {
			seedWorking = false;
		}
	}

	async function importSeedCard() {
		if (seedWorking) return;
		const picked = await open({
			multiple: false,
			directory: false,
			filters: [{ name: 'VisionMachine seed', extensions: ['vmseed', 'json'] }],
		}).catch(() => null);
		// `open` resolves to string | string[] | null; single-select → string|null.
		const path = typeof picked === 'string' ? picked : Array.isArray(picked) ? picked[0] : null;
		if (!path) return;
		seedWorking = true;
		try {
			const raw = await invoke<string>('director_load_seed_card', { path });
			const card = parseSeedCard(raw);
			const next = fromSeedCard(card);
			// Preserve the user's unsaved draft where the card is silent; the
			// card wins on every field it carries (mood/preview passthrough).
			entry = { ...entry, ...next } as EngineEntryInput;
			runError = null;
			showFeedback('Seed loaded — hit Run S0→S5 to build the flow', 'tone-ok');
		} catch (e) {
			showFeedback(`Import failed: ${String(e)}`, 'tone-danger');
			flashToast(String(e));
		} finally {
			seedWorking = false;
		}
	}

	// Destructive apply (I9, design §4): materialize the current flow's
	// structured plan into composer pipes. Replaces or appends the session's
	// pipes, then reloads the composer so the Pipes tab shows the result.
	async function applyPipes(replace: boolean) {
		if (!doc) return;
		const target = activeRun ?? doc.flowVersion;
		const verb = replace ? 'replacing all composer pipes' : 'appending to the composer';
		// Native dialog: window.confirm() is a silent no-op in the Tauri
		// webview (always resolves false → the apply never ran), so use the
		// @tauri-apps/plugin-dialog ask() wrapper instead.
		const ok = await ask(
			`Regenerate pipes (${verb}) from flow v${target}?\n\n` +
				`This writes real composer pipes via the materialize step. No fallback — ` +
				`replay via the RegenerationContract triple if needed.`,
			{ title: 'Regenerate pipes', kind: 'warning', okLabel: 'Regenerate', cancelLabel: 'Cancel' },
		);
		if (!ok) return;
		applyWorking = true;
		showFeedback('Applying flow → composer…', 'tone-neutral');
		try {
			const count = await applyFlow(sessionId, target, replace);
			await onLogSignal('edit_diff', `apply-${target}`, `materialized ${count} pipes (${replace ? 'replace' : 'append'})`).catch(
				() => {},
			);
			// Refresh the session's pipes in the composer store so the Pipes
			// tab renders the materialized pipes; onApplied re-syncs the host's
			// project tree (which the Pipes tab derives from).
			await loadSession(sessionId);
			onApplied?.(sessionId);
			showFeedback(`Materialized ${count} pipe(s) into the composer`, 'tone-ok');
		} catch (e) {
			showFeedback(`Apply failed: ${String(e)}`, 'tone-danger');
			flashToast(String(e));
		} finally {
			applyWorking = false;
		}
	}

	// The saturated S0→S5 flow state (null for docs produced pre-engine).
	const engine = $derived<EngineRun | null>(doc?.engine ?? null);

	// Gate strip reflects the run's gates, overlaid with the in-tab
	// confirmations the user just made (so "confirm" visibly flips G1/G2).
	const gatesShown = $derived((engine?.gates ?? []).map((g) =>
		confirmedGates.has(g.gate)
			? { ...g, status: 'confirmed' as const }
			: g,
	));

	const sections = $derived(doc?.structured.pipes[0]?.sections ?? []);

	// Design §1 "badge ownership": push this tab's own strip badge state up
	// so the .preview-meta row shows it in place of pipe-count. Extract is
	// "n sections" once fresh structural text exists; Scoreboard is "stale"
	// when a newer persisted run outdates the doc currently being scored.
	//
	// BUGFIX (infinite-loop): the callback prop is an inline arrow in the
	// parent (a new identity on every parent re-render) and this effect used
	// to push a FRESH object into the parent's `tabMeta` $state on every run.
	// That state write re-rendered the parent, which re-created the arrow,
	// which re-triggered this effect → a re-render feedback loop that keeps
	// Svelte flushing forever ("runes don't work / infinite loop" after a
	// generation run). Break it two ways: (a) stop tracking the callback
	// identity (no `void onMetaChange`), so a churned arrow alone can't
	// re-run the effect; (b) an idempotence guard keyed on the pushed
	// payload, so an effect re-run with unchanged values is a no-op and
	// never writes the parent state.
	let lastMetaSig = '';
	$effect(() => {
		// Key the tripwire by SESSION, not effect-name: a fast swing through 5
		// DISTINCT sessions must NOT read as "5 effect runs" (the name-keyed
		// ledger used to aggregate the swing into a false "runaway loop"
		// alarm). A genuine loop is the SAME session's effect re-firing, so a
		// per-session key only trips when one session's meta effect re-runs.
		tripEffect(`director:meta:${sessionId}`);
		if (!onMetaChange) return;
		const newest = flows.length ? Math.max(...flows.map((f) => f.flowVersion)) : 0;
		const stale = !!doc && newest > doc.flowVersion;
		const n = sections.length;
		const sig = n + '|' + (stale ? 1 : 0);
		if (sig === lastMetaSig) return; // unchanged → no parent write → no re-render
		lastMetaSig = sig;
		onMetaChange({
			extractSections: n,
			stale,
		});
	});

	$effect(() => {
		if (activeTab !== 'scoreboard') return;
		let cancelled = false;
		const sid = sessionId;
		void (async () => {
			await refreshFlows();
			if (cancelled || sid !== sessionId) return;
		})();
		return () => {
			cancelled = true;
		};
	});

	// svelte-ignore state_referenced_locally — intentional: track session for once-per-session latch
	let lastSession = $state(sessionId);
	// Once-per-session loader latch: the seed-from-persisted-run effect below
	// must run AT MOST once per session. A session with 0 persisted flows
	// never sets `doc`, so a plain `if (doc) return;` guard cannot latch —
	// any re-trigger (session reset, re-render) re-issued listFlows forever
	// ("[DIRECTOR] list_flows start/done × N for a 0-flow session" in the
	// log, then the UI pinned). Cleared on session switch, set after one
	// settled list (including the 0-flows and error paths).
	let flowsLoadedFor = $state<string | null>(null); // synced with module-level Set
	// Per-session isolation: when the session prop changes, reset in-tab state
	// so a switched session never carries the previous session's run; restore
	// the new session's G0 draft instead of a stale entry.
	$effect(() => {
		// Per-session key (see meta tripwire): one session's reset effect
		// firing 5× is a loop; 5 different sessions resetting once each is
		// normal navigation and must not alarm.
		tripEffect(`director:reset:${sessionId}`);
		if (sessionId !== lastSession) {
			lastSession = sessionId;
			doc = null;
			flowsLoadedFor = null;
			flows = [];
			activeRun = null;
			runError = null;
			openTag = null;
			openShot = null;
			entry = loadEntryDraft(sessionId) ?? freshEntry();
			// LAYER-2: permanently mounted — also clear transient run UI state
			// so a switched session never shows the previous session's
			// progress spinner, feedback banner, or stale localExtract.
			confirmedGates = new Set();
			feedback = null;
			applyWorking = false;
			runDurationMs = null;
			localExtract = [];
			seedWorking = false;
		}
	});

	// Seed the active document from the newest persisted run so Extract /
	// Scoreboard reflect saved data, not just the in-tab run. When the loaded
	// doc carries an engine, backfill the G0 entry controls from its seed;
	// for a pre-engine doc, pre-fill the idea from the run's entry text so
	// one click on "Run S0→S5" re-builds the flow.
	$effect(() => {
		// `doc` is NOT a sufficient latch on its own: a session with 0
		// persisted flows never sets it, so a plain `if (doc) return;`
		// guard left this effect live after the first pass and any
		// re-trigger re-issued listFlows in a loop (the "[DIRECTOR]
		// list_flows start/done × N" log storm). The once-per-session
		// `flowsLoadedFor` latch makes the effect terminal after ONE
		// settled list, whatever the result.
		if (doc || flowsLoadedFor === sessionId) {
			return;
		}
		// SETTLED-FLOW CACHE (2026-11-10 "generated data doesn't sustain
		// session switch" fix): a settled result from an earlier visit
		// survives the component-local wipe (reset effect / unmount). A
		// revisit (A→B→A) or remount hydrates it SYNCHRONOUSLY — no IPC,
		// no re-seed from the localStorage draft, no listFlows storm.
		const cached = settledFlowCache.get(sessionId);
		if (cached) {
			flowsLoadedFor = sessionId;
			flows = cached.flows;
			doc = cached.doc;
			activeRun = cached.activeRun;
			if (cached.doc) {
				// Precedence: an unsaved G0 draft that differs from the
				// committed doc's seed (post-run edits) wins; otherwise
				// backfill the controls from the doc.
				const draft = loadEntryDraft(sessionId);
				const docIdea = (cached.doc.engine?.seed?.idea ?? cached.doc.intent?.entryText ?? '').trim();
				if (draft && draft.idea.trim() && draft.idea.trim() !== docIdea) {
					entry = draft;
				} else {
					backfillEntryFromEngine(cached.doc, cached.flows[0] ?? undefined);
				}
			} else {
				entry = loadEntryDraft(sessionId) ?? freshEntry();
			}
			return;
		}
		// First visit for this session: settle it exactly once. Per-session
		// key: 5 distinct sessions each seeding once is a swing, not a loop.
		tripEffect(`director:seed:${sessionId}`);
		let cancelled = false;
		const sid = sessionId;
		flowsLoadedFor = sid; // latch BEFORE await: prevents re-entry if effect re-runs
		void (async () => {
			try {
				const listed = await listFlows(sid);
				if (cancelled || sid !== sessionId) return;
				if (listed.length > 0) {
					flows = listed;
					const newest = listed[0];
					const d = await loadFlow(sid, newest.flowVersion);
					if (cancelled || sid !== sessionId) return;
					doc = d;
					activeRun = newest.flowVersion;
					// Precedence: an unsaved G0 draft that differs from the
					// committed doc's seed (post-run edits) wins; otherwise
					// backfill the controls from the doc.
					const draft = loadEntryDraft(sid);
					const docIdea = (d.engine?.seed?.idea ?? d.intent?.entryText ?? '').trim();
					if (draft && draft.idea.trim() && draft.idea.trim() !== docIdea) {
						entry = draft;
					} else {
						backfillEntryFromEngine(d, newest);
					}
					// Remember the settled result (one copy per session,
					// overwritten in place by the next settlement) so a
					// revisit / remount re-hydrates without a second list.
					rememberSettled(sid, { flows: listed, doc: d, activeRun: newest.flowVersion });
				} else {
					// No persisted run: restore this session's in-progress G0
					// draft (the idea may already have been typed, then the
					// user left the tab / re-ran nothing).
					flows = [];
					entry = loadEntryDraft(sid) ?? freshEntry();
					// Cache the settled EMPTY result too: a later revisit of
					// a still-0-flow session must not re-storm listFlows.
					rememberSettled(sid, { flows: [], doc: null, activeRun: null });
				}
			} catch (e) {
				if (cancelled || sid !== sessionId) return;
				console.warn('director load_latest', e);
			}
		})();
		return () => {
			cancelled = true;
		};
	});

	function backfillEntryFromEngine(d: FlowDocument, summary?: FlowSummary) {
		const e = d.engine;
		if (!e) {
			// Pre-engine doc: carry its entry text into the idea field so the
			// user can immediately re-run it through the S0→S5 engine.
			const legacy = summary?.entryText?.trim();
			entry = { ...entry, idea: entry.idea || legacy || '' };
			return;
		}
		const s = e.seed;
		const film = e.novel.film;
		entry = {
			title: s.title,
			idea: s.idea,
			input_text: s.input_text ?? '',
			genre: { ...s.genre },
			ratio: s.ratio,
			scale: {
				scenes: s.scale.scenes,
				shots_per_scene: s.scale.shots_per_scene,
				clip_s: [...s.scale.clip_s] as [number, number],
			},
			time_of_day: film.time_of_day,
			weather: film.weather,
			// M4: the run's EngineRun does not store its mood band (it lives
			// on the EngineEntry input, and FilmSeed stays byte-stable), so
			// preserve the user's current slider value (entry.mood) rather
			// than clobber it — a re-load never silently resets mood.
			mood: entry.mood ?? 50,
			// Phase 3: the S0.5 tree's manual-override pins are USER state,
			// not engine state — a re-run / re-load never clobbers them.
			// (The tree itself re-derives on the next run; the pins survive.)
			overrides: entry.overrides ?? {},
		};
	}

	async function refreshFlows() {
		const sid = sessionId;
		try {
			const listed = await listFlows(sid);
			if (sid !== sessionId) return;
			flows = listed;
			// Write-through: this re-list settled the session's run list, so
			// refresh the settled cache (a revisit re-hydrates from this
			// instead of re-listing). One copy per session, overwritten in
			// place — `doc`/`activeRun` are the current component state.
			rememberSettled(sid, { flows, doc, activeRun });
		} catch (e) {
			if (sid !== sessionId) return;
			console.warn('director list_flows', e);
			flows = [];
			rememberSettled(sid, { flows, doc, activeRun });
		}
	}

	// The S0 entry submitted to a run: the idea + G0 look/params.
	function buildEntry(): EngineEntryInput {
		return {
			...entry,
			input_text: entry.input_text?.trim() || entry.idea,
		};
	}

	async function handleRun() {
		const sid = sessionId;
		running = true;
		onRunningChange?.(true);
		runError = null;
		const t0 = Date.now();
		try {
			const result = await runFlow(sid, entry.idea || entry.input_text?.trim() || '', buildEntry());
			if (sid !== sessionId) return;
			runDurationMs = Date.now() - t0;
			doc = result;
			activeRun = result.flowVersion;
			backfillEntryFromEngine(result);
			await refreshFlows();
		} catch (e) {
			if (sid !== sessionId) return;
			runError = String(e);
			flashToast(runError);
		} finally {
			running = false;
			onRunningChange?.(false);
		}
	}

	function copyExtract() {
		if (!doc) return;
		let lines: string[];
		if (localExtract.length) {
			// Copy the user's LIVE sections (post-edit), with dirty flags.
			// Pre-engine docs have no localExtract — fall back to the
			// structured plan below.
			lines = localExtract.map((s) => {
				const dirty = isEdited(s) ? ' [edited]' : '';
				const src = s.source.trim() !== s.prompt.trim() ? s.source : '—';
				return `--- pipe ${String(s.pipeIndex).padStart(2, '0')} ${s.tag}${dirty} ${s.range} ---\n${s.prompt}${src !== '—' ? `\nsource: ${src}` : ''}`;
			});
		} else {
			// Pre-engine doc: copy the original structured sections.
			lines = (doc.structured.pipes[0]?.sections ?? []).map((s) => {
				const src = s.from.length ? s.from.join(' · ') : '—';
				return `--- ${s.tag} ${s.frameStart}–${s.frameEnd} ---\n${s.prompt}\nsource: ${src}`;
			});
		}
		void navigator.clipboard
			.writeText(lines.join('\n\n'))
			.then(() => flashToast('Structural text copied', 'success'))
			.catch(() => flashToast('Copy failed'));
	}

	// The S4-derived engine sheet: shot sheets + derived image/video prompts +
	// verified timeline — the "final structural text" of the engine flow.
	function copyEngineSheet() {
		const e = engine;
		if (!e) return;
		const out: string[] = [];
		for (const grp of specsByScene(e)) {
			out.push(`## ${grp.scene.scene_id} (${grp.scene.time_of_day} · ${grp.scene.weather})`);
			grp.specs.forEach((sp, i) => {
				const mol = grp.molecules[i];
				out.push(`${sp.shot_id} ${sp.clip_s}s · ${sp.transition_in}→${sp.transition_out}`);
				out.push(`  concerns: ${concernSummary(sp.concerns)}`);
				for (const sl of sp.sub_timeline) {
					out.push(`    ${sl.from_s}–${sl.to_s}s  ${sl.note}`);
				}
				if (mol) {
					out.push(`  image: ${mol.prompts.image}`);
					out.push(`  video: ${mol.prompts.video}`);
				}
			});
		}
		const rows = timelineRows(e);
		out.push(`timeline: ${rows.map((r) => `[${r.from_s}s–${r.to_s}s] ${r.shot_id} ${r.frames}f`).join(' · ')}`);
		out.push(
			`verify: ${e.verify.verified ? 'ALL PASS' : e.verify.issues.length + ' issue(s)'}`,
		);
		void navigator.clipboard
			.writeText(out.join('\n'))
			.then(() => flashToast('Engine sheet copied', 'success'))
			.catch(() => flashToast('Copy failed'));
	}
</script>

<div class="director-root" data-tab={activeTab}>
	{#if activeTab === 'director'}
		<!-- Phase-1 hot path child; the Advanced disclosure is injected via
		     its slot so the DOM order matches the former monolith
		     (① → ② → ③ → <details class="advanced"> → actions). -->
		<DirectorHotPath
			{engine}
			{doc}
			{running}
			bind:entry
			{stepChain}
			{runDurationMs}
			{runError}
			{pipeCount}
			{applyWorking}
			{feedback}
			seedWorking={seedWorking}
			canExportSeed={entry.idea.trim().length > 0}
			onRun={handleRun}
			onAnnotate={annotateRun}
			onApply={applyPipes}
			onExportSeed={exportSeedCard}
			onImportSeed={importSeedCard}
		>
			<DirectorAdvanced
				{engine}
				{gatesShown}
				bind:entry
				{openShot}
				onToggleShot={(id: string | null) => (openShot = id)}
			/>
		</DirectorHotPath>
	{:else if activeTab === 'extract'}
		<ExtractTab
			{doc}
			{engine}
			{sessionId}
			{sessionName}
			{pipeCount}
			{localExtract}
			{dirtyCount}
			{extractPipeCount}
			{applyWorking}
			{feedback}
			onCopyExtract={copyExtract}
			onCopyEngineSheet={copyEngineSheet}
			onRegenerate={regeneratePipes}
			onApplied={onApplied}
		/>
	{:else if activeTab === 'scoreboard'}
		<ScoreboardTab
			{doc}
			{flows}
			{sessionName}
			{openTag}
			onToggleTag={(tag: string | null) => (openTag = tag)}
			{onLogSignal}
		/>
	{/if}
</div>

<style>
	/* Design tokens only (Template A): no new colors, hairlines, quiet.
	   Motion uses --transition-sin (additive token, design doc §6). */

	.director-root {
		display: flex;
		flex-direction: column;
		gap: 18px;
		padding: 12px 14px 40px;
		min-height: 100%;
		/* Native form controls follow the app theme: `color-scheme` is set per
	   [data-theme] in design-system.css (dark themes -> dark, light -> light),
	   so we must NOT hardcode it here (that would pin light-theme selects to
	   the dark OS control). */
		font-synthesis: none;
	}
</style>
