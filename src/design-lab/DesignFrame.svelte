<script lang="ts">
	// Design Lab renderer — renders the SHARED fixture identically across all
	// three visual-language templates. The DOM + data are constant; every
	// difference between A / B / C lives in CSS under [data-template], so the
	// comparison isolates visual grammar (geometry, spacing, type, surfaces)
	// from content or feature differences.
	//
	// Timeline placement reuses the app's real coordinate invariant:
	// createFrameGeometry + frameToPx + rangeWidthPx from $lib/frameGeometry,
	// measured against one shared coordinate element (zero-left-padding lanes),
	// exactly like TimelineSection.svelte. No drag/store/IPC wiring here —
	// this is a visual prototype of the same application state.
	import {
		createFrameGeometry, frameToPx, rangeWidthPx,
		type FrameGeometry,
	} from '$lib/frameGeometry';
	import { PIPE, FIXTURE_PROJECT, FRAME_IMAGES, SESSION_FPS, SELECTED_TAG_ID } from './fixture';
	import './design-lab.css';
	import ChromeIcon from '../components/ChromeIcon.svelte';
	import './template-a.css';
	import './template-b.css';
	import './template-c.css';

	let { template = 'a' } = $props<{ template: 'a' | 'b' | 'c' }>();

	const session = FIXTURE_PROJECT.sessions[0];
	const pipe = PIPE;
	const totalFrames = pipe.lengthFrames; // 241
	const selectedFrame = 120; // playhead position, shared across templates
	const fps = SESSION_FPS;

	// ── Shared coordinate canvas (the real invariant) ─────────────────────
	let coordEl = $state<HTMLElement | null>(null);
	let geom = $state<FrameGeometry | null>(null);
	$effect(() => {
		const el = coordEl;
		if (!el) return;
		const update = () => {
			const w = el.getBoundingClientRect().width;
			geom = w > 0 ? createFrameGeometry(totalFrames, w) : null;
		};
		update();
		const ro = new ResizeObserver(update);
		ro.observe(el);
		return () => ro.disconnect();
	});
	// Stable helpers (null-safe) so the template can place pills before the
	// first measure resolves.
	const px = (f: number) => (geom ? frameToPx(f, geom) : 0);
	const wpx = (a: number, b: number) => (geom ? rangeWidthPx(a, b, geom) : 0);

	// Ruler ticks: minor every 8 frames; a labelled second-tick every 48.
	const ticks = Array.from({ length: Math.floor((totalFrames - 1) / 8) + 1 }, (_, i) => i * 8);
	const labelEvery = 48;

	// Resolve the timeline + lanes from the fixture.
	const LANE_ORDER = ['camera', 'lighting', 'effect'] as const;
	const timelineEl = pipe.elements.find((e: any) => e.tag === 'timeline') as { segments: Array<{ id: string; frameStart: number; frameEnd: number; tags: Array<{ id: string; tag: string; frameStart: number; frameEnd: number; prompt?: string; spec: { color: string; name: string } }> }> } | undefined;
	const zones = timelineEl?.segments ?? [];
	const globalEl = pipe.elements.find((e: any) => e.tag === 'global_style') as any;
	const soundEl = pipe.elements.find((e: any) => e.tag === 'sound') as any;
	// One lane per tag type actually present (canonical order), holding the
	// tags of that type from the single zone.
	const tagLanes = LANE_ORDER.map((type) => {
		const entries = (zones[0]?.tags ?? []).filter((t) => t.tag === type);
		const spec = entries[0]?.spec;
		return { type, name: spec?.name ?? type, spec, entries };
	});

	const selectedTag = (timelineEl?.segments[0]?.tags ?? []).find((t) => t.id === SELECTED_TAG_ID);
	const selectedZone = selectedTag ? zones.find((z) => z.tags.includes(selectedTag)) : null;
	const sel = { start: selectedTag?.frameStart ?? 0, end: selectedTag?.frameEnd ?? 0 };
	const selSeconds = `${(sel.start / fps).toFixed(1)}–${(sel.end / fps).toFixed(1)}s`;
	const totalSeconds = ((totalFrames - 1) / fps).toFixed(1);

	function secLabel(f: number) {
		return `${(f / fps).toFixed(0)}s`;
	}
</script>

<div class="dl-canvas" data-template={template}>
	<!-- ═══ TOP PREVIEW STRIP ═══ -->
	<header class="dl-frame">
		<div class="dl-frame-top">
			<div class="dl-brand">
				<span class="dl-brand-mark" aria-hidden="true">VM</span>
				<span class="dl-brand-name">VisionMachine</span>
			</div>
			<div class="dl-crumbs">
				<span class="crumb crumb-project">{FIXTURE_PROJECT.name}</span>
				<span class="crumb-sep">/</span>
				<span class="crumb crumb-session">{session.name}</span>
				<span class="crumb-sep">/</span>
				<span class="crumb crumb-pipe">{pipe.name}</span>
			</div>
			<div class="dl-layout-controls">
				<button class="dl-layout-btn active" title="Landscape"><ChromeIcon id="layout-landscape" size={16} /></button>
				<button class="dl-layout-btn" title="Portrait"><ChromeIcon id="layout-portrait" size={16} /></button>
			</div>
		</div>

		<div class="dl-frame-media">
			<img class="dl-frame-img" src={FRAME_IMAGES.preview} alt="Preview frame" />
			<span class="dl-frame-label">Shot 01</span>
			<span class="dl-frame-position">{selectedFrame} / {totalFrames}</span>
			<div class="dl-frame-controls">
				<span class="ctl-time">{(selectedFrame / fps).toFixed(1)}s / {totalSeconds}s</span>
				<span class="ctl-cluster">
					<button class="ctl-btn" title="Play"><ChromeIcon id="play" size={14} /></button>
					<button class="ctl-btn" title="Loop"><ChromeIcon id="loop" size={14} /></button>
					<button class="ctl-btn" title="Carousel"><ChromeIcon id="menu" size={14} /></button>
				</span>
			</div>
			<div class="dl-scrub" style="--scrub-pct: {((selectedFrame / totalFrames) * 100).toFixed(2)}%" aria-hidden="true"></div>
		</div>
	</header>

	<div class="dl-body">
		<!-- ═══ LEFT: PROJECT / SESSION NAVIGATION + PROFILE ═══ -->
		<aside class="dl-nav">
			<div class="dl-nav-header">
				<span class="dl-nav-title">Project</span>
				<button class="dl-add-chip" title="New project">+</button>
			</div>
			<div class="dl-nav-list">
				<div class="dl-project selected">
					<span class="dl-project-name">{FIXTURE_PROJECT.name}</span>
					<span class="dl-project-count">{session ? 1 : 0}</span>
				</div>
				<div class="dl-sessions">
					<div class="dl-session selected">
						<span class="dl-session-name">{session.name}</span>
						<span class="dl-session-meta">24 fps</span>
					</div>
				</div>
				<button class="dl-add-session">+ Add Session</button>
			</div>
			<div class="dl-profile">
				<div class="dl-profile-head">
					<span class="dl-avatar">M</span>
					<div class="dl-profile-info">
						<span class="dl-profile-name">Marisol</span>
						<span class="dl-profile-storage">482 MB</span>
					</div>
				</div>
				<div class="dl-profile-stats">
					<span>1 project</span>
					<span>1 session</span>
					<span>482 generations</span>
				</div>
				<button class="dl-settings-entry">Settings <span>›</span></button>
			</div>
		</aside>

		<!-- ═══ CENTER: COMPOSER (pipe) ═══ -->
		<main class="dl-composer">
			<section class="dl-pipe active">
				<div class="dl-pipe-header">
					<span class="dl-pipe-name">{pipe.name}</span>
					<span class="dl-pipe-meta">{pipe.lengthFrames}f · {totalSeconds}s</span>
					<span class="dl-pipe-ops">
						<button title="Move up" disabled>↑</button>
						<button title="Move down">↓</button>
						<button title="Duplicate"><ChromeIcon id="copy" size={14} /></button>
						<label class="dl-pipe-len"><span>len</span><span class="dl-pipe-len-val">{pipe.lengthFrames}</span></label>
						<button title="Edit length"><ChromeIcon id="edit" size={14} /></button>
						<button class="dl-pipe-del" title="Remove">×</button>
					</span>
				</div>

				<!-- Keyframes row: thumbnails sit on the canvas -->
				<section class="dl-row dl-row-keyframes">
					<div class="dl-row-head">
						<span class="dl-row-label">Keyframes</span>
						<span class="dl-row-count">{pipe.keyframes.length}/3</span>
					</div>
					<div class="dl-keyframes">
						{#each pipe.keyframes as kf (kf.id)}
							<button class="dl-kf">
								<span class="dl-kf-media">
									<img class="dl-kf-img" src={kf.imageSrc} alt="keyframe {kf.slotIndex}" />
									<span class="dl-kf-status" aria-label="ready"></span>
								</span>
								<span class="dl-kf-meta">
									<span class="dl-kf-slot">k{kf.slotIndex}</span>
									<span class="dl-kf-frame">f{kf.frame}</span>
								</span>
							</button>
						{/each}
						<button class="dl-kf dl-kf-add" title="Add keyframe">
							<span class="dl-kf-media">
								<span class="dl-kf-addbox" aria-hidden="true"></span>
							</span>
							<span class="dl-kf-meta">
								<span class="dl-kf-slot">+k4</span>
								<span class="dl-kf-frame">empty</span>
							</span>
						</button>
					</div>
				</section>

				<!-- Subject refs row -->
				<section class="dl-row dl-row-subjects">
					<div class="dl-row-head">
						<span class="dl-row-label">Subject refs</span>
						<span class="dl-row-count">{pipe.subjectReferences.length}/5</span>
					</div>
					<div class="dl-subjects">
						{#each pipe.subjectReferences as sr (sr.id)}
							<button class="dl-sr">
								<span class="dl-kf-media">
									<img class="dl-sr-img" src={sr.imageUrl} alt="subject ref" />
									<span class="dl-kf-status" aria-label="ready"></span>
								</span>
								<span class="dl-sr-meta">
									<span class="dl-sr-range">full</span>
									<span class="dl-sr-type">txt2img</span>
								</span>
							</button>
						{/each}
						<button class="dl-sr dl-sr-add" title="Add subject ref">
							<span class="dl-kf-media">
								<span class="dl-sr-addbox" aria-hidden="true"></span>
							</span>
							<span class="dl-sr-meta"><span>+ s2</span></span>
						</button>
					</div>
				</section>

				<!-- Timeline: one shared coordinate canvas -->
				<section class="dl-timeline">
					<div class="dl-coord" bind:this={coordEl}>
						<!-- Ruler -->
						<div class="dl-ruler">
							<div class="dl-ruler-line"></div>
							{#each ticks as f (f)}
								<span class="dl-tick {f % 120 === 0 ? 'major' : f % 48 === 0 ? 'mid' : ''}" style="left: {px(f)}px"></span>
								{#if f % labelEvery === 0}<span class="dl-tick-label" style="left: {px(f)}px">{secLabel(f)}</span>{/if}
							{/each}
							<span class="dl-playhead" style="left: {px(selectedFrame)}px"></span>
							<span class="dl-pin-note" style="left: {px(selectedFrame)}px">{selectedFrame} · {(selectedFrame / fps).toFixed(1)}s</span>
						</div>

						<!-- Global instruction lane -->
						<div class="dl-global-lane">
							<div class="dl-pill global" style="left: {px(globalEl.frameStart)}px; width: {wpx(globalEl.frameStart, globalEl.frameEnd)}px;">
								<span class="dl-pill-label">Global</span>
								<span class="dl-pill-text">{globalEl.prompt}</span>
							</div>
						</div>

						<!-- Sound lane -->
						<div class="dl-global-lane sound">
							<div class="dl-pill sound" style="left: {px(soundEl.frameStart)}px; width: {wpx(soundEl.frameStart, soundEl.frameEnd)}px;">
								<span class="dl-pill-label"><ChromeIcon id="music" size={14} /> Sound</span>
								<span class="dl-pill-text">{soundEl.prompt}</span>
							</div>
						</div>

						<!-- Main timeline lane -->
						<div class="dl-lane">
							<div class="dl-lane-head">
								<span class="dl-lane-chevron">▾</span>
								<span class="dl-lane-title">Timeline</span>
								<span class="dl-lane-summary">{zones.length} zone · {zones[0].tags.length} tags</span>
							</div>

							<!-- Zone lane: one main zone -->
							<div class="dl-zone-lane">
								{#each zones as zone, zi (zone.id)}
									<div class="dl-zone" style="left: {px(zone.frameStart)}px; width: {wpx(zone.frameStart, zone.frameEnd)}px;">
										<span class="dl-zone-range">{zone.frameStart}–{zone.frameEnd}</span>
									</div>
									<span class="dl-grip dl-grip-zone" style="left: {px(zone.frameStart)}px"></span>
									<span class="dl-grip dl-grip-zone" style="left: {px(zone.frameEnd)}px"></span>
								{/each}
							</div>

							<!-- Tag lanes: one row per type -->
							{#each tagLanes as lane (lane.type)}
								<div class="dl-tag-lane" style="--lane-color: {lane.spec?.color};">
									<div class="dl-tag-lane-track">
										<span class="dl-tag-lane-label">{lane.name}</span>
										{#each lane.entries as t (t.id)}
											<div class="dl-tag {t.id === SELECTED_TAG_ID ? 'selected' : ''}" style="left: {px(t.frameStart)}px; width: {wpx(t.frameStart, t.frameEnd)}px; --tag-color: {t.spec.color};">
												<span class="dl-tag-prompt">{t.prompt}</span>
											</div>
											<span class="dl-grip dl-grip-tag" style="left: {px(t.frameStart)}px"></span>
											<span class="dl-grip dl-grip-tag" style="left: {px(t.frameEnd)}px"></span>
										{/each}
									</div>
								</div>
							{/each}

							<div class="dl-zone-chrome">
								<button class="dl-add-zone">+ Zone</button>
							</div>
						</div>
					</div>
				</section>
			</section>

			<button class="dl-add-pipe">+ Add Pipe</button>
		</main>

		<!-- ═══ RIGHT: CONTEXTUAL INSPECTOR ═══ -->
		<aside class="dl-inspector">
			<section class="dl-insp dl-insp-preview">
				<div class="dl-insp-head">
					<span class="dl-insp-title">Preview</span>
					<span class="dl-insp-actions">
						<button class="dl-btn-primary">Generate</button>
						<button class="dl-btn-ghost">Compose</button>
					</span>
				</div>
				<div class="dl-insp-preview-body">
					<img class="dl-preview-thumb" src={FRAME_IMAGES.preview} alt="Preview" />
					<div class="dl-insp-preview-meta">
						<span class="dl-preview-name">{session.name}</span>
						<span class="dl-preview-sub">1 pipe · {totalFrames}f</span>
					</div>
				</div>
			</section>

			<section class="dl-insp dl-insp-settings">
				<div class="dl-insp-head"><span class="dl-insp-title">Session settings</span></div>
				<div class="dl-settings-body">
					<div class="dl-set"><span class="dl-set-label">FPS</span><select class="dl-select"><option>24 fps</option><option>30 fps</option><option>48 fps</option></select></div>
					<div class="dl-set"><span class="dl-set-label">Resolution</span><select class="dl-select"><option>720p</option><option>1080p</option></select></div>
					<div class="dl-set"><span class="dl-set-label">Orientation</span><select class="dl-select"><option>Horizontal</option><option>Vertical</option></select></div>
					<div class="dl-set dl-set-range"><span class="dl-set-label">Quality</span><span class="dl-set-val">{pipe.qValue}</span></div>
					<div class="dl-set dl-set-range"><span class="dl-set-label">Creativity</span><span class="dl-set-val">{pipe.cValue}</span></div>
				</div>
			</section>

			<!-- FOCUS: the selected object — "Camera — Pan left" -->
			<section class="dl-insp dl-insp-focus selected">
				<div class="dl-insp-head">
					<span class="dl-insp-title">Inspector</span>
					<span class="dl-focus-level">{selectedTag?.spec.name}</span>
				</div>
				<div class="dl-focus-body">
					<div class="dl-focus-name">
						<span class="dl-focus-type" style="--tag-color: {selectedTag?.spec.color};">{selectedTag?.spec.name}</span>
						<span class="dl-focus-label">{selectedTag?.prompt}</span>
					</div>
					<div class="dl-focus-zone">Zone Z1 · {selectedZone?.frameStart}–{selectedZone?.frameEnd}</div>
					<div class="dl-focus-field">
						<span class="dl-focus-field-label">Prompt</span>
						<input class="dl-input" type="text" value={selectedTag?.prompt ?? ''} spellcheck="false" />
					</div>
					<div class="dl-focus-timing">
						<span class="dl-focus-time-frames">f{sel.start}–f{sel.end}</span>
						<span class="dl-focus-time-sec">{selSeconds}</span>
						<span class="dl-focus-time-share">{Math.round(((sel.end - sel.start) / totalFrames) * 100)}% of pipe</span>
					</div>
					<div class="dl-focus-hierarchy">
						<span class="dl-hier-label">Pipe</span>
						<div class="dl-hier-row"><span>{pipe.name}</span><span>{pipe.lengthFrames}f · Q{pipe.qValue} · C{pipe.cValue}</span></div>
					</div>
					<button class="dl-btn-primary dl-focus-generate">Generate</button>
				</div>
			</section>

			<section class="dl-insp dl-insp-stats">
				<div class="dl-insp-head"><span class="dl-insp-title">Stats</span></div>
				<div class="dl-stats-body">
					<div class="dl-stat"><span class="dl-stat-val">1</span><span class="dl-stat-label">Sessions</span></div>
					<div class="dl-stat"><span class="dl-stat-val">1</span><span class="dl-stat-label">Pipes</span></div>
					<div class="dl-stat"><span class="dl-stat-val">{totalFrames}</span><span class="dl-stat-label">Frames</span></div>
					<div class="dl-stat"><span class="dl-stat-val">482</span><span class="dl-stat-label">Generations</span></div>
				</div>
			</section>
		</aside>
	</div>
</div>
