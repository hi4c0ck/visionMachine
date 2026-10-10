///<reference types="svelte" />
;
import type { PipeRow, SubjectReference, KeyframeType } from '$types';
import { toMediaUrl, isLocalPath } from '$lib/mediaUrl';
import { refDotState, type RefDotState } from '$lib/refReadiness';
import '../composer-row.css';

;type $$ComponentProps = {
		pipe: PipeRow;
		maxSubjectRefs: number;
		onRemove: (refId: string) => void;
		onAdd: () => void;
		/** Open the subject-ref modal in EDIT mode for an existing ref. */
		onEdit?: (refId: string) => void;
		/** Scene aspect ratio ("W / H") — chips size to it so thumbnails
		 *  preview at the same shape as the generated frame. */
		aspect?: string;
		/** Red-out state for refs whose URL failed the accessibility check (D5). */
		containsBroken?: (id: string) => boolean;
		/**
		 * Queue a piece for regeneration on the next run (non-destructive:
		 * the settled preview data stays). Fired by the status dot badge.
		 */
		onRegenerate?: (refId: string) => void;
	};function $$render() {

	
	
	
	

	// Subject references row — pure chrome. The panel owns the subject-ref
	// store actions; this component fires callbacks. Collapses the empty and
	// non-empty branches into one row (chips render conditionally).
	let {
		pipe,
		maxSubjectRefs,
		onRemove,
		onAdd,
		onEdit,
		aspect,
		containsBroken,
		onRegenerate,
	} = $props</*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/>();

	// Store mutations replace pipe arrays, so the counts must stay derived.
	const refs = $derived(pipe.subjectReferences ?? []);
	// The `visible` eye-mechanic is obsolete: every ref in the pipe renders and
	// counts. Numbering + the add-button gate key off the total count.
	const refNumber = $derived(refs.length);

	// Human-readable subject type (url / txt2img / img2img); legacy refs
	// without a preset read as 'url'.
	const SR_TYPE_LABEL: Record<KeyframeType, string> = {
		url: 'URL',
		txt2img: 'txt2img',
		img2img: 'img2img',
	};

	function srTypeLabel(sr: SubjectReference): string {
		const t = (sr.type ?? 'url') as KeyframeType;
		return SR_TYPE_LABEL[t] ?? t;
	}

	// Resolve a subject image source to a renderable URL. Priority:
	//  1. previewLocalPath — the generated artifact (local media-tree file),
	//     the most current representation after a successful run.
	//  2. imageUrl — user-supplied remote URL (url-mode subjects). Remote
	//     URLs load directly; local paths go through read_media_file.
	let srImageUrls = $state<Map<string, string>>(new Map());
	// The source string each cached URL was resolved FROM — a source change
	// (new artifact, recovery backfill) must re-fetch, not reuse the stale
	// blob (the old `has(sr.id)` skip broke newly-attached local paths).
	let srImageUrlsFor = $state<Map<string, string>>(new Map());
	// Sources we've already attempted to resolve, so a `toMediaUrl` that
	// settled to null doesn't re-trigger an IPC call on every effect re-run.
	// Voided when the source changes (checked above) so a new path re-attempts.
	let srAttempted = $state<Map<string, string>>(new Map());
	// Sources whose <img> failed to load (stale local paths, expired remote
	// URLs). Excluded from srSrc so the chip falls back to the dot placeholder
	// instead of the browser's broken-image glyph.
	let failedSrSources = $state<Set<string>>(new Set());
	$effect(() => {
		for (const sr of refs) {
			const src = sr.previewLocalPath || sr.imageUrl || '';
			if (!src || !isLocalPath(src)) continue;
			if (srImageUrlsFor.get(sr.id) === src) continue;
			if (srAttempted.get(sr.id) === src) continue;
			srAttempted = new Map([...srAttempted, [sr.id, src]]);
			toMediaUrl(src).then((url) => {
				if (url) {
					failedSrSources = new Set([...failedSrSources].filter((k) => k !== sr.id));
					srImageUrls = new Map([...srImageUrls, [sr.id, url]]);
					srImageUrlsFor = new Map([...srImageUrlsFor, [sr.id, src]]);
				}
			});
		}
	});

	function srSrc(sr: SubjectReference): string | null {
		const src = sr.previewLocalPath || sr.imageUrl || null;
		if (!src || failedSrSources.has(sr.id)) return null;
		if (isLocalPath(src)) {
			const cached = srImageUrls.get(sr.id);
			return cached !== undefined && srImageUrlsFor.get(sr.id) === src ? cached : null;
		}
		return src;
	}

	/** Drop the cached entry so srSrc() falls back to the placeholder instead
	 *  of the browser's broken-image glyph. */
	function markSrImageFailed(sr: SubjectReference) {
		const src = sr.previewLocalPath || sr.imageUrl || null;
		if (!src) return;
		if (isLocalPath(src)) {
			const next = new Map(srImageUrls);
			next.delete(sr.id);
			srImageUrls = next;
		}
		failedSrSources = new Set([...failedSrSources, sr.id]);
	}

	function srDot(sr: SubjectReference): RefDotState {
		const ty = (sr.type ?? 'url') as KeyframeType;
		return refDotState(
			pipe.id,
			sr.id,
			{
				type: ty,
				// Only 'url' pieces carry a direct image source whose presence
				// defines readiness; img2img's imageUrl is a *reference* (the
				// dot reflects the generated preview, not the reference).
				url: ty === 'url' ? sr.imageUrl : undefined,
				status: sr.status,
				previewRemoteUrl: sr.previewRemoteUrl,
				previewLocalPath: sr.previewLocalPath,
				forceRegen: sr.forceRegen,
			},
			brokenSet,
		);
	}

	// Queued-for-regeneration cue: the dot keeps its readiness color; a
	// pulsing ring + the tooltip say a fresh asset will be made on the
	// next run. Non-destructive — the settled data is untouched. Re-click
	// cancels the queue (the dot returns to its readiness color at once).
	function dotTitleFor(sr: SubjectReference, state: RefDotState): string {
		if (sr.forceRegen === true) {
			return 'Queued — will regenerate on next run · click to cancel';
		}
		return state === 'ready'
			? 'Asset ready — click to regenerate'
			: state === 'broken'
				? 'Asset missing or failed — click to regenerate'
				: 'Not generated yet — click to force generate';
	}

	// Derive the D5 broken set for this pipe's refs from containsBroken.
	const brokenSet = $derived.by((): Set<string> | undefined => {
		if (!containsBroken) return undefined;
		return new Set(
			(refs as SubjectReference[])
				.filter((r: SubjectReference) => containsBroken(r.id))
				.map((r: SubjectReference) => `${pipe.id}:${r.id}`),
		);
	});
;
async () => {

	 { svelteHTML.createElement("div", { "class":`row-group`,});
	 { svelteHTML.createElement("div", { "class":`row-header`,});
		 { svelteHTML.createElement("span", { "class":`row-label`,});  }
		 { svelteHTML.createElement("span", { "class":`row-count`,});refNumber; maxSubjectRefs; }
	 }
	 { svelteHTML.createElement("div", { "class":`sr-row`,});
		   for(let sr of __sveltets_2_ensureArray(refs)){sr.id;
			const broken = containsBroken?.(sr.id) ?? false;
			const dot = srDot(sr);
			const srSrcResolved = srSrc(sr);
			 { svelteHTML.createElement("div", {              "class":`sr-chip`,"onclick":() => onEdit?.(sr.id),"onkeydown":(e) => e.key === 'Enter' && onEdit?.(sr.id),"role":`button`,"tabindex":onEdit ? 0 : undefined,"title":broken
					? `Frame ${sr.frameStart ?? '—'}–${sr.frameEnd ?? '—'} · ${srTypeLabel(sr)} · URL not accessible · Click to fix`
					: `Frame ${sr.frameStart ?? '—'}–${sr.frameEnd ?? '—'} · ${srTypeLabel(sr)} · Click to edit`,});broken; 
					if(broken){
						 { svelteHTML.createElement("span", {   "class":`sr-broken-mark`,"aria-hidden":`true`,});  }
					}
					
					 { svelteHTML.createElement("div", { "class":`sr-media`,});
						if(srSrcResolved){
							 { svelteHTML.createElement("img", {           "src":srSrcResolved,"class":`sr-img`,"style":aspect ? `aspect-ratio: ${aspect};` : '',"alt":`subject ref`,"onerror":() => markSrImageFailed(sr),});}
						}else{
							 { svelteHTML.createElement("span", {   "class":`sr-placeholder`,"style":aspect ? `aspect-ratio: ${aspect};` : '',}); }
						}
						 { svelteHTML.createElement("button", {            "class":`sr-status`,"onclick":(e) => { e.stopPropagation(); onRegenerate?.(sr.id); },"title":dotTitleFor(sr, dot),"aria-label":dotTitleFor(sr, dot),});dot === 'ready';dot === 'broken';sr.forceRegen === true; }
					 }
					 { svelteHTML.createElement("span", { "class":`sr-meta`,});
						if(sr.useFrames){
							 { svelteHTML.createElement("span", { "class":`sr-range`,});sr.frameStart; sr.frameEnd; }
						}else{
							 { svelteHTML.createElement("span", { "class":`sr-label`,});  }
						}
						 { svelteHTML.createElement("span", { "class":`sr-type`,});srTypeLabel(sr); }
					 }
					 { svelteHTML.createElement("button", {      "class":`sr-del`,"onclick":(e) => { e.stopPropagation(); onRemove(sr.id); },"title":`Remove subject reference`,});  }
				 }
		}
		if(refNumber < maxSubjectRefs){
			 { svelteHTML.createElement("button", {      "class":`sr-add`,"onclick":onAdd,"title":`Add subject reference`,});
				 refNumber + 1;
			 }
		}
	 }
 }


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const SubjectRefsRow__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type SubjectRefsRow__SvelteComponent_ = ReturnType<typeof SubjectRefsRow__SvelteComponent_>;
/*Ωignore_endΩ*/export default SubjectRefsRow__SvelteComponent_;