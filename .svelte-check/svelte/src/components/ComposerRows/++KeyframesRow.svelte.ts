///<reference types="svelte" />
;
import type { PipeRow, PipeKeyframe, KeyframeType } from '$types';
import { getVisibleKeyframeSlots } from '$lib/keyframeSlots';
import { toMediaUrl, isLocalPath } from '$lib/mediaUrl';
import { refDotState, type RefDotState } from '$lib/refReadiness';
import '../composer-row.css';

;type $$ComponentProps = {
		pipe: PipeRow;
		maxKeyframes: number;
		onEditSlot: (slotIndex: number) => void;
		onRemoveKeyframe: (kfId: string) => void;
		/** Scene aspect ratio ("W / H") — chips size to it so thumbnails
		 *  preview at the same shape as the generated frame. */
		aspect?: string;
		/** Red-out state for refs whose URL failed the accessibility check (D5). */
		containsBroken?: (id: string) => boolean;
		/** Queue a keyframe for regeneration on the next run (non-destructive:
		 *  the settled preview data stays). Fired by the status dot. */
		onRegenerate?: (kfId: string) => void;
	};function $$render() {

	
	
	
	
	

	// Keyframes row — display slots come from the shared keyframeSlots lib
	// (single source of truth, also used by the panel's next-slot default).
	// The panel owns the keyframe store actions; this component fires callbacks.
	let {
		pipe,
		maxKeyframes,
		onEditSlot,
		onRemoveKeyframe,
		aspect,
		containsBroken,
		onRegenerate,
	} = $props</*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/>();

	const visibleSlots = () => getVisibleKeyframeSlots(pipe, maxKeyframes);

	// Resolve a keyframe image source to a renderable URL. Priority:
	//  1. previewLocalPath — the generated artifact (local media-tree file),
	//     the most current representation after a successful run.
	//  2. imageSrc — user-supplied remote URL (url-mode keyframes) or a
	//     locally-saved path. Remote URLs load directly; local paths go
	//     through the Tauri read_media_file command so the WebView can fetch them.
	let kfImageUrls = $state<Map<string, string>>(new Map());
	// The source string each cached URL was resolved FROM. Without this the
	// effect skips any ref already in `kfImageUrls` — so a newly-attached
	// local path (first run / a recovery backfill) and a re-linked artifact
	// would never resolve, leaving the chip on the "image not loaded" glyph.
	let kfImageUrlsFor = $state<Map<string, string>>(new Map());
	// Sources we've already attempted to resolve, so a `toMediaUrl` that
	// settled to null (file missing / not under a media root) doesn't
	// re-trigger an IPC call on every effect re-run. Cleared when the source
	// itself changes (below) so a freshly-attached path re-attempts.
	let kfAttempted = $state<Map<string, string>>(new Map());
	// Sources whose <img> failed to load (stale local paths, expired remote
	// URLs). Excluded from kfSrc so the chip falls back to the dashed
	// placeholder instead of the browser's broken-image glyph.
	let failedKfSources = $state<Set<string>>(new Set());
	$effect(() => {
		for (const kf of pipe.keyframes ?? []) {
			// Resolve the best source for each keyframe.
			const src = kf.previewLocalPath || kf.imageSrc || '';
			if (!src || !isLocalPath(src)) continue;
			// Re-fetch when the source CHANGED since the last cached URL
			// (new artifact, backfill) — not just when the ref is new. A
			// changed source also voids the "already attempted" marker so the
			// new path gets a fresh resolve.
			if (kfImageUrlsFor.get(kf.id) === src) continue;
			if (kfAttempted.get(kf.id) === src) continue;
			// `toMediaUrl` resolves to null on failure (missing/stale path, path
			// not under a media root) — it never rejects in the null-settling
			// path, but guard anyway so a rejection can't crash the effect
			// loop. A null result simply leaves the chip on its placeholder.
			kfAttempted = new Map([...kfAttempted, [kf.id, src]]);
			toMediaUrl(src)
				.then((url) => {
					if (url) {
						// A fresh URL supersedes any failed mark for this ref.
						failedKfSources = new Set([...failedKfSources].filter((k) => k !== kf.id));
						kfImageUrls = new Map([...kfImageUrls, [kf.id, url]]);
						kfImageUrlsFor = new Map([...kfImageUrlsFor, [kf.id, src]]);
					}
				})
				.catch(() => {});
		}
	});

	function kfSrc(kf: PipeKeyframe): string | null {
		// Generated local preview takes precedence over the raw source.
		const src = kf.previewLocalPath || kf.imageSrc || null;
		if (!src || failedKfSources.has(kf.id)) return null;
		// A local path with a STALE cached URL (source changed) must not
		// render the old blob: fall back to the placeholder until the effect
		// re-resolves it.
		if (isLocalPath(src)) {
			const cached = kfImageUrls.get(kf.id);
			return cached !== undefined && kfImageUrlsFor.get(kf.id) === src ? cached : null;
		}
		return src;
	}

	/** Drop the cached entry so kfSrc() falls back to the placeholder instead
	 *  of the browser's broken-image glyph. Covers both local (toMediaUrl /
	 *  missing media file) and remote (expired provider URL) sources. */
	function markKfImageFailed(kf: PipeKeyframe) {
		const src = kf.previewLocalPath || kf.imageSrc || null;
		if (!src) return;
		if (isLocalPath(src)) {
			const next = new Map(kfImageUrls);
			next.delete(kf.id);
			kfImageUrls = next;
		}
		failedKfSources = new Set([...failedKfSources, kf.id]);
	}


	// Human-readable keyframe type (url / txt2img / img2img).
	const KF_TYPE_LABEL: Record<PipeKeyframe['type'], string> = {
		url: 'URL',
		txt2img: 'txt2img',
		img2img: 'img2img',
	};

	function kfTypeLabel(kf: PipeKeyframe): string {
		return KF_TYPE_LABEL[kf.type] ?? kf.type;
	}

	function kfDotTitleFor(kf: PipeKeyframe, state: RefDotState): string {
		if (kf.forceRegen === true) {
			return 'Queued — will regenerate on next run · click to cancel';
		}
		return state === 'ready'
			? 'Asset ready — click to regenerate'
			: state === 'broken'
				? 'Asset missing or failed — click to regenerate'
				: 'Not generated yet — click to force generate';
	}

	/**
	 * Readiness dot for a keyframe chip: green = settled asset (generated
	 * preview present, or a valid url-mode source), red = broken (url check
	 * failed / generated piece errored / empty URL), neutral = not yet
	 * generated. Clicking the dot force-regenerates the piece when a
	 * regenerate callback is wired.
	 */
	function kfDot(kf: PipeKeyframe): RefDotState {
		return refDotState(
			pipe.id,
			kf.id,
			{
				type: kf.type,
				// Only 'url' pieces carry a direct image source whose presence
				// defines readiness; img2img's referenceUrl is a *reference*
				// (the dot reflects the generated preview, not the reference).
				url: kf.type === 'url' ? kf.imageSrc : undefined,
				status: kf.status,
				previewRemoteUrl: kf.previewRemoteUrl,
				previewLocalPath: kf.previewLocalPath,
				forceRegen: kf.forceRegen,
			},
			brokenSet,
		);
	}

	// Derive the D5 broken set for this pipe's keyframes from containsBroken.
	const brokenSet = $derived.by((): Set<string> | undefined => {
		if (!containsBroken) return undefined;
		return new Set(
			(pipe.keyframes ?? [])
				.filter((k: PipeKeyframe) => containsBroken(k.id))
				.map((k: PipeKeyframe) => `${pipe.id}:${k.id}`),
		);
	});
;
async () => {

	 { svelteHTML.createElement("div", { "class":`row-group`,});
	 { svelteHTML.createElement("div", { "class":`row-header`,});
		 { svelteHTML.createElement("span", { "class":`row-label`,});  }
		 { svelteHTML.createElement("span", { "class":`row-count`,});pipe.keyframes.length; maxKeyframes; }
	 }
	 { svelteHTML.createElement("div", { "class":`kf-row`,});
		  for(let kfNum of __sveltets_2_ensureArray(visibleSlots())){
			  for(let kf of __sveltets_2_ensureArray([pipe.keyframes.find((kf: PipeKeyframe) => kf.slotIndex === kfNum)])){
				if(kf){
					const broken = containsBroken?.(kf.id) ?? false;
					const dot = kfDot(kf);
					const kfSrcResolved = kfSrc(kf);
					 { svelteHTML.createElement("div", {                "class":`kf-chip kf-filled`,"onclick":() => onEditSlot(kfNum),"onkeydown":(e) => e.key === 'Enter' && onEditSlot(kfNum),"role":`button`,"tabindex":0,"title":broken
							? `Frame ${kf.frame} · ${kfTypeLabel(kf)} · URL not accessible · Click to fix`
							: `Frame ${kf.frame} · ${kfTypeLabel(kf)} · Click to edit`,"aria-invalid":broken || undefined,});broken;
					if(broken){
						 { svelteHTML.createElement("span", {   "class":`kf-broken-mark`,"aria-hidden":`true`,});  }
					}
					
					 { svelteHTML.createElement("div", { "class":`kf-media`,});
						if(kfSrcResolved){
							 { svelteHTML.createElement("img", {           "src":kfSrcResolved,"class":`kf-img`,"style":aspect ? `aspect-ratio: ${aspect};` : '',"alt":`keyframe`,"onerror":() => markKfImageFailed(kf),});}
						}else{
							 { svelteHTML.createElement("span", {   "class":`kf-placeholder`,"style":aspect ? `aspect-ratio: ${aspect};` : '',}); }
						}
						 { svelteHTML.createElement("button", {            "class":`kf-status`,"onclick":(e) => { e.stopPropagation(); onRegenerate?.(kf.id); },"title":kfDotTitleFor(kf, dot),"aria-label":kfDotTitleFor(kf, dot),});dot === 'ready';dot === 'broken';kf.forceRegen === true; }
					 }
						 { svelteHTML.createElement("span", { "class":`kf-meta`,});
							 { svelteHTML.createElement("span", { "class":`kf-label`,}); kfNum; }
							 { svelteHTML.createElement("span", { "class":`kf-type`,});kfTypeLabel(kf); }
						 }
						 { svelteHTML.createElement("button", {      "class":`kf-del`,"onclick":(e) => { e.stopPropagation(); onRemoveKeyframe(kf.id); },"title":`Remove keyframe`,});  }
					 }
				}else{
					 { svelteHTML.createElement("div", {            "class":`kf-chip kf-empty`,"onclick":() => onEditSlot(kfNum),"onkeydown":(e) => e.key === 'Enter' && onEditSlot(kfNum),"role":`button`,"tabindex":0,"title":`Click to configure keyframe ${kfNum}`,});
						 { svelteHTML.createElement("span", {   "class":`kf-placeholder kf-placeholder-empty`,"style":aspect ? `aspect-ratio: ${aspect};` : '',}); }
						 { svelteHTML.createElement("span", { "class":`kf-meta`,});
							 { svelteHTML.createElement("span", { "class":`kf-empty-label`,}); kfNum; }
						 }
					 }
				}
			}
		}
	 }
 }


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const KeyframesRow__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type KeyframesRow__SvelteComponent_ = ReturnType<typeof KeyframesRow__SvelteComponent_>;
/*Ωignore_endΩ*/export default KeyframesRow__SvelteComponent_;