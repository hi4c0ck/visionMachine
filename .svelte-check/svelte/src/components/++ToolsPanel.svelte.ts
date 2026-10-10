///<reference types="svelte" />
;
import type { SessionData, ProjectData, ComposerFocus, PipeRow, Segment, TagElement, TimelineElement } from '$types';
import { APP_CONSTANTS } from '$constants';
import { compilePrompt } from '$lib/compiler';
import { toMediaUrl } from '$lib/mediaUrl';

;type $$ComponentProps = {
		session: SessionData | null;
		project: ProjectData | null;
		activeTool: string | null;
		/** Context-sensitive focus driving which inspector the panel shows. */
		focus?: ComposerFocus;
		onselect: (toolId: string) => void;
		/** Session-level generate (future "generate all" — D3). */
		ongenerate: () => void;
		/** Pipe-level generate (opens the confirm modal, decision D3). */
		ongeneratepipe?: (pipeId: string) => void;
		/** Hand the pipe's last generated video to the top-panel preview (D9). */
		onopenpreview?: (pipe: PipeRow) => void;
		/** Splice the session's pipe videos into one session video (A5). */
		oncomposesession?: () => void;
		/** ffmpeg present? false → the compose button is disabled w/ hint. */
		ffmpegAvailable?: boolean;
		/** Compose is in flight — button shows live progress. */
		composing?: boolean;
		compositionLabel?: string;
		/** A generation task is active — the pipe generate button is disabled. */
		pipegenerating?: boolean;
		groupActive?: boolean;
		onfpschange?: (fps: number) => void;
		onresolutionchange?: (resolution: string) => void;
		onorientationchange?: (orientation: string) => void;
		/** Quality (inference steps) of the active pipe */
		qValue?: number;
		/** Creativity (cfg scale) of the active pipe */
		cValue?: number;
		onqvaluechange?: (q: number) => void;
		oncvaluechange?: (c: number) => void;
		unsynced?: boolean;
		/** Composed session video (group auto-compose or the compose button) to
		 *  show in the Preview section. null = nothing composed yet. */
		sessionVideo?: { url: string; label: string } | null;
		/** Point the top-panel preview back at the session video after the
		 *  user switched it to a per-pipe clip ("Open in preview" affordance). */
		onopensessionpreview?: () => void;
	};function $$render() {

	
	
	
	

	let {
		session,
		project,
		activeTool,
		focus = { level: 'project' } as ComposerFocus,
		onselect,
		ongenerate,
		ongeneratepipe,
		onopenpreview,
		oncomposesession,
		ffmpegAvailable = false,
		composing = false,
		compositionLabel = '',
		pipegenerating = false,
		groupActive = false,
		onfpschange,
		onresolutionchange,
		onorientationchange,
		qValue,
		cValue,
		onqvaluechange,
		oncvaluechange,
		unsynced = false,
		sessionVideo = null,
		onopensessionpreview
	} = $props</*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/>();

	let showModal = $state(false);
	let newSessionName = $state('');

	// Svelte's select matcher compares the option value (a string) against the
	// passed value STRICTLY — a numeric fps (24) never matches option "24" and
	// the select renders blank (still selectable, but showing nothing).
	// Coerce both sides to strings, and mirror a non-standard session fps into
	// the option list so any flexible fps value the session carries is visible.
	const BASE_FPS_OPTIONS = [18, 24, 30, 48, 60];
	let fpsOptions = $derived.by(() => {
		const cur = Number(session?.fps);
		const list = Number.isFinite(cur) && cur > 0 && !BASE_FPS_OPTIONS.includes(cur)
			? [...BASE_FPS_OPTIONS, cur]
			: [...BASE_FPS_OPTIONS];
		return list.sort((a, b) => a - b);
	});
	let fpsValue = $derived.by(() => {
		const cur = Number(session?.fps);
		return Number.isFinite(cur) && cur > 0 ? String(cur) : '24';
	});

	function openNewSessionModal() {
		if (!project) return;
		newSessionName = '';
		showModal = true;
	}

	function closeNewSessionModal() {
		showModal = false;
	}

	function confirmNewSession() {
		if (!newSessionName.trim() || !project) return;
		console.log('[ToolsPanel] Create session:', newSessionName);
		closeNewSessionModal();
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			confirmNewSession();
		}
	}

	function getStats() {
		if (!session) {
			return {
				sessions: project?.sessions.length || 0,
				pipes: 0,
				frames: 0,
				generations: project?.totalGenerations || 0,
			};
		}
		
		return {
			sessions: project?.sessions.length || 0,
			pipes: session?.pipes?.length ?? 0,
			frames: (session?.pipes ?? []).reduce((acc: number, p: PipeRow) => acc + (p?.lengthFrames || 0), 0),
			generations: session.totalGeneratedFrames,
		};
	}

	const stats = $derived(getStats());

	// T6: Compiled prompt output (T6)
	const compiledOutput = $derived.by(() => {
		if (!session?.pipes?.length) return '';
		return compilePrompt(session.pipes[0]);
	});

	// ── Focus → entity resolution for the context-sensitive inspector ────
	// The focus model only carries ids; the panel holds the live session, so
	// we resolve each level to its concrete entity here.
	function findPipe(pipeId?: string): PipeRow | null {
		if (!session?.pipes?.length || !pipeId) return null;
		return session.pipes.find((p: PipeRow) => p.id === pipeId) ?? null;
	}
	function findTimeline(pipe: PipeRow | null): TimelineElement | null {
		if (!pipe) return null;
		return (pipe.elements.find((e: any) => e.tag === 'timeline') as TimelineElement | undefined) ?? null;
	}
	function findSegment(pipe: PipeRow | null, segmentId?: string): Segment | null {
		if (!segmentId) return null;
		return findTimeline(pipe)?.segments.find((s) => s.id === segmentId) ?? null;
	}
	function findTag(pipe: PipeRow | null, segmentId: string | undefined, tagId: string): TagElement | null {
		return findSegment(pipe, segmentId)?.tags.find((t) => t.id === tagId) ?? null;
	}

	const focusedPipe = $derived(findPipe(focus.level === 'project' ? undefined : (focus as any).pipeId));
	const focusedSegment = $derived(
		focus.level === 'segment' ? findSegment(focusedPipe, (focus as any).segmentId) :
		focus.level === 'tag' ? findSegment(focusedPipe, (focus as any).segmentId) : null
	);
	const focusedTag = $derived(
		focus.level === 'tag' ? findTag(focusedPipe, (focus as any).segmentId, (focus as any).tagId) : null
	);
	const focusLabel = $derived(
		focus.level === 'project' ? 'Project' :
		focus.level === 'session' ? 'Session' :
		focus.level === 'pipe' ? `Pipe · ${focusedPipe?.name ?? focusedPipe?.id ?? ''}` :
		focus.level === 'segment' ? 'Segment' : 'Tag'
	);

	// Last-gen preview thumb (D9): served through read_media_file (Phase E).
	let lastVideoUrl = $state<string | null>(null);
	// True while lastVideoUrl is in flight — the <video> is then hidden so a
	// stale/failed 0:00 shell can't sit in the panel (mirrors Frame's
	// "don't render an unloaded <video>" behavior).
	let lastVideoLoading = $state(false);
	$effect(() => {
		let cancelled = false;
		const path = focusedPipe?.lastGeneration?.videoPath ?? null;
		if (!path) {
			lastVideoUrl = null;
			lastVideoLoading = false;
			return;
		}
		lastVideoUrl = null;
		lastVideoLoading = true;
		toMediaUrl(path).then((url) => {
			if (cancelled) return;
			lastVideoUrl = url;
			lastVideoLoading = false;
		}).catch(() => {
			// read_media_file failed (path moved / not under a media root):
			// fall back to the empty state instead of a dead <video> element.
			if (cancelled) return;
			lastVideoUrl = null;
			lastVideoLoading = false;
		});
		return () => {
			cancelled = true;
		};
	});
;
async () => {

 { svelteHTML.createElement("div", { "class":`tools-panel`,});
  
   { svelteHTML.createElement("div", { "class":`preview-section`,});
     { svelteHTML.createElement("div", { "class":`section-header`,});
       { svelteHTML.createElement("span", { "class":`section-title`,});  }
      if(session){
         { svelteHTML.createElement("button", {     "class":`btn-generate`,"onclick":ongenerate,"disabled":!session.pipes?.length,});
          APP_CONSTANTS.strings.generate;
         }
         { svelteHTML.createElement("button", {        "class":`btn-compose`,"onclick":() => oncomposesession?.(),"disabled":!ffmpegAvailable || composing,"title":ffmpegAvailable
            ? APP_CONSTANTS.strings.composeSessionVideoHint
            : APP_CONSTANTS.strings.composeSessionNoFfmpeg,});
          composing ? (compositionLabel || 'Composing…') : APP_CONSTANTS.strings.composeSessionVideo;
         }
      }
     }
     { svelteHTML.createElement("div", { "class":`preview-area`,});
      if(session && sessionVideo){
         { svelteHTML.createElement("div", { "class":`preview-active preview-video-box`,});
           { svelteHTML.createElement("div", { "class":`preview-video-frame`,});
             { svelteHTML.createElement("video", {          "src":sessionVideo.url,"class":`preview-video`,"muted":true,"loop":true,"autoplay":true,"playsinline":true,"controls":true,}); }
             { svelteHTML.createElement("button", {       "class":`preview-video-open`,"onclick":() => onopensessionpreview?.(),"title":`Show the session video in the top panel`,});
              APP_CONSTANTS.strings.openInPreview;
             }
           }
           { svelteHTML.createElement("p", { "class":`preview-name`,});sessionVideo.label; }
         }
      } else if (session){
         { svelteHTML.createElement("div", { "class":`preview-active`,});
           { svelteHTML.createElement("div", { "class":`preview-icon`,});  }
           { svelteHTML.createElement("p", { "class":`preview-name`,});session.name; }
           { svelteHTML.createElement("p", { "class":`preview-meta`,});session?.pipes?.length ?? 0;   stats.frames;  }
          if(unsynced){
             { svelteHTML.createElement("span", { "class":`unsynced-badge`,});  }
          }
         }
      }else{
         { svelteHTML.createElement("div", { "class":`preview-empty`,});
           { svelteHTML.createElement("div", { "class":`preview-icon`,});  }
           { svelteHTML.createElement("p", {});   }
           { svelteHTML.createElement("p", { "class":`hint`,});      }
         }
      }
     }
   }

  
   { svelteHTML.createElement("div", { "class":`compiler-section`,});
     { svelteHTML.createElement("div", { "class":`section-header`,});
       { svelteHTML.createElement("span", { "class":`section-title`,});  }
     }
     { svelteHTML.createElement("div", { "class":`compiler-preview`,});
      if(compiledOutput){
         { svelteHTML.createElement("div", { "class":`compiler-output`,});compiledOutput; }
      }else{
         { svelteHTML.createElement("div", { "class":`compiler-empty`,});    }
      }
     }
   }

  
   { svelteHTML.createElement("div", { "class":`settings-section`,});
     { svelteHTML.createElement("div", { "class":`section-header`,});
       { svelteHTML.createElement("span", { "class":`section-title`,});APP_CONSTANTS.strings.settings; }
     }
    
    if(session){
       { svelteHTML.createElement("div", { "class":`settings-content`,});
         { svelteHTML.createElement("div", { "class":`setting-row`,});
           { svelteHTML.createElement("label", { "class":`setting-label`,});  }
           { svelteHTML.createElement("select", {       "class":`setting-select`,"value":fpsValue,"onchange":(e) => onfpschange?.(Number(e.currentTarget.value)),});
               for(let opt of __sveltets_2_ensureArray(fpsOptions)){opt;
               { svelteHTML.createElement("option", { "value":String(opt),});opt;  }
            }
           }
         }

         { svelteHTML.createElement("div", { "class":`setting-row`,});
           { svelteHTML.createElement("label", { "class":`setting-label`,});  }
           { svelteHTML.createElement("select", {       "class":`setting-select`,"value":session.resolution,"onchange":(e) => onresolutionchange?.(e.currentTarget.value),});
             { svelteHTML.createElement("option", { "value":`480p`,});  }
             { svelteHTML.createElement("option", { "value":`720p`,});  }
             { svelteHTML.createElement("option", { "value":`1080p`,});  }
           }
         }

         { svelteHTML.createElement("div", { "class":`setting-row`,});
           { svelteHTML.createElement("label", { "class":`setting-label`,});  }
           { svelteHTML.createElement("select", {       "class":`setting-select`,"value":session.orientation,"onchange":(e) => onorientationchange?.(e.currentTarget.value),});
             { svelteHTML.createElement("option", { "value":`horizontal`,});  }
             { svelteHTML.createElement("option", { "value":`vertical`,});  }
           }
         }

         { svelteHTML.createElement("div", { "class":`setting-row`,});
           { svelteHTML.createElement("label", { "class":`setting-label`,});  }
           { svelteHTML.createElement("input", {              "type":`range`,"min":`5`,"max":`30`,"step":`1`,"value":qValue ?? 18,"class":`setting-slider`,"onchange":(e) => onqvaluechange?.(Number(e.currentTarget.value)),});}
           { svelteHTML.createElement("span", { "class":`setting-value`,});qValue ?? 18; }
         }

         { svelteHTML.createElement("div", { "class":`setting-row`,});
           { svelteHTML.createElement("label", { "class":`setting-label`,});  }
           { svelteHTML.createElement("input", {              "type":`range`,"min":`0.5`,"max":`15`,"step":`0.5`,"value":cValue ?? 7,"class":`setting-slider`,"onchange":(e) => oncvaluechange?.(Number(e.currentTarget.value)),});}
           { svelteHTML.createElement("span", { "class":`setting-value`,});cValue ?? 7; }
         }
       }
    }else{
       { svelteHTML.createElement("div", { "class":`no-session-hint`,});
         { svelteHTML.createElement("p", {});      }
       }
    }
   }

  
   { svelteHTML.createElement("div", { "class":`focus-section`,});
     { svelteHTML.createElement("div", { "class":`section-header`,});
       { svelteHTML.createElement("span", { "class":`section-title`,});  }
       { svelteHTML.createElement("span", { "class":`focus-level`,});focusLabel; }
     }

    if(focus.level === 'project'){
       { svelteHTML.createElement("div", { "class":`focus-body`,});
         { svelteHTML.createElement("p", { "class":`focus-hint`,});            }
         { svelteHTML.createElement("div", { "class":`focus-summary`,});
           { svelteHTML.createElement("span", {});project?.sessions.length ?? 0;  }
           { svelteHTML.createElement("span", {});project?.totalGenerations ?? 0;  }
         }
       }

    } else if (focus.level === 'session'){
       { svelteHTML.createElement("div", { "class":`focus-body`,});
         { svelteHTML.createElement("p", { "class":`focus-name`,});session?.name; }
         { svelteHTML.createElement("p", { "class":`focus-hint`,});        }
        if(session){
           { svelteHTML.createElement("button", {     "class":`focus-generate`,"onclick":ongenerate,"disabled":!session.pipes?.length,});
            APP_CONSTANTS.strings.generate;
           }
        }
       }

    } else if (focus.level === 'pipe'){
       { svelteHTML.createElement("div", { "class":`focus-body`,});
        if(focusedPipe){
           { svelteHTML.createElement("p", { "class":`focus-name`,});focusedPipe.name; }
           { svelteHTML.createElement("div", { "class":`focus-meta`,});
             { svelteHTML.createElement("span", {});focusedPipe.lengthFrames;  }
             { svelteHTML.createElement("span", {}); focusedPipe.qValue; }
             { svelteHTML.createElement("span", {}); focusedPipe.cValue; }
           }
           { svelteHTML.createElement("p", { "class":`focus-hint`,});             }
          if(focusedPipe.keyframes.length > 0){
             { svelteHTML.createElement("div", { "class":`focus-list`,});
                 for(let kf of __sveltets_2_ensureArray(focusedPipe.keyframes)){kf.id;
                 { svelteHTML.createElement("span", { "class":`focus-list-item`,}); kf.slotIndex;  kf.frame; }
              }
             }
          }else{
             { svelteHTML.createElement("p", { "class":`focus-hint`,});   }
          }
           { svelteHTML.createElement("button", {         "class":`focus-generate`,"onclick":() => ongeneratepipe?.(focusedPipe.id),"disabled":pipegenerating || groupActive,"title":pipegenerating ? APP_CONSTANTS.strings.generationInProgress : 'Generate this pipe',});
            APP_CONSTANTS.strings.generate;
           }
          		 { svelteHTML.createElement("div", { "class":`focus-preview`,});
          			if(lastVideoUrl){
          				 { svelteHTML.createElement("video", {           "class":`focus-video`,"src":lastVideoUrl,"muted":true,"loop":true,"autoplay":true,"playsinline":true,"aria-label":`Last generation preview`,}); }
          				 { svelteHTML.createElement("button", {   "class":`focus-preview-open`,"onclick":() => onopenpreview?.(focusedPipe),});
          					APP_CONSTANTS.strings.openInPreview;
          				 }
          			}else{
          				 { svelteHTML.createElement("span", { "class":`focus-preview-empty`,});APP_CONSTANTS.strings.noPreview; }
          			}
          		 }
        }else{
           { svelteHTML.createElement("p", { "class":`focus-hint`,});   }
        }
       }

    } else if (focus.level === 'segment'){
       { svelteHTML.createElement("div", { "class":`focus-body`,});
        if(focusedSegment){
           { svelteHTML.createElement("p", { "class":`focus-name`,}); focusedSegment.frameStart; focusedSegment.frameEnd; }
           { svelteHTML.createElement("p", { "class":`focus-hint`,});focusedSegment.tags.length; (focusedSegment.tags.length !== 1 ? 's' : '');        }
          if(focusedSegment.tags.length > 0){
             { svelteHTML.createElement("div", { "class":`focus-list`,});
                 for(let t of __sveltets_2_ensureArray(focusedSegment.tags)){t.id;
                 { svelteHTML.createElement("span", { "class":`focus-list-item`,});t.tag; }
              }
             }
          }
        }else{
           { svelteHTML.createElement("p", { "class":`focus-hint`,});   }
        }
       }

    }else{
      
       { svelteHTML.createElement("div", { "class":`focus-body`,});
        if(focusedTag){
           { svelteHTML.createElement("p", { "class":`focus-name`,});focusedTag.tag; }
           { svelteHTML.createElement("p", { "class":`focus-hint`,}); focusedTag.frameStart; focusedTag.frameEnd;         }
          if(focusedTag.prompt){
             { svelteHTML.createElement("div", { "class":`focus-prompt`,});focusedTag.prompt; }
          }else{
             { svelteHTML.createElement("p", { "class":`focus-hint`,});   }
          }
        }else{
           { svelteHTML.createElement("p", { "class":`focus-hint`,});   }
        }
       }
    }
   }

  
   { svelteHTML.createElement("div", { "class":`stats-section`,});
     { svelteHTML.createElement("div", { "class":`section-header`,});
       { svelteHTML.createElement("span", { "class":`section-title`,});APP_CONSTANTS.strings.stats; }
     }
    
     { svelteHTML.createElement("div", { "class":`stats-content`,});
       { svelteHTML.createElement("div", { "class":`stat-item`,});
         { svelteHTML.createElement("span", { "class":`stat-value`,});stats.sessions; }
         { svelteHTML.createElement("span", { "class":`stat-label`,});  }
       }
       { svelteHTML.createElement("div", { "class":`stat-item`,});
         { svelteHTML.createElement("span", { "class":`stat-value`,});stats.pipes; }
         { svelteHTML.createElement("span", { "class":`stat-label`,});  }
       }
       { svelteHTML.createElement("div", { "class":`stat-item`,});
         { svelteHTML.createElement("span", { "class":`stat-value`,});stats.frames; }
         { svelteHTML.createElement("span", { "class":`stat-label`,});  }
       }
       { svelteHTML.createElement("div", { "class":`stat-item`,});
         { svelteHTML.createElement("span", { "class":`stat-value`,});stats.generations; }
         { svelteHTML.createElement("span", { "class":`stat-label`,});  }
       }
     }
   }

  
  if(showModal && project){
     { svelteHTML.createElement("div", {     "class":`modal-backdrop`,"onclick":closeNewSessionModal,"role":`presentation`,});
       { svelteHTML.createElement("div", {         "class":`modal`,"onclick":(e) => e.stopPropagation(),"role":`dialog`,"aria-modal":`true`,"aria-labelledby":`new-session-title`,});
         { svelteHTML.createElement("div", { "class":`modal-header`,});
           { svelteHTML.createElement("span", {   "class":`modal-title`,"id":`new-session-title`,});APP_CONSTANTS.strings.createSessionModal; }
           { svelteHTML.createElement("button", {     "class":`modal-close`,"onclick":closeNewSessionModal,"aria-label":`Close`,});  }
         }
        
         { svelteHTML.createElement("div", { "class":`modal-body`,});
           { svelteHTML.createElement("label", { "class":`form-label`,});  }
           { svelteHTML.createElement("input", {           "type":`text`,"class":`modal-input`,"bind:value":newSessionName,"placeholder":`Enter session name...`,"onkeydown":handleKeyDown,});/*Ωignore_startΩ*/() => newSessionName = __sveltets_2_any(null);/*Ωignore_endΩ*/}
         }
        
         { svelteHTML.createElement("div", { "class":`modal-footer`,});
           { svelteHTML.createElement("button", {   "class":`btn-cancel`,"onclick":closeNewSessionModal,});APP_CONSTANTS.strings.cancel; }
           { svelteHTML.createElement("button", {       "class":`btn-confirm`,"disabled":!newSessionName.trim(),"onclick":confirmNewSession,});
            APP_CONSTANTS.strings.create;
           }
         }
       }
     }
  }
 }


};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const ToolsPanel__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type ToolsPanel__SvelteComponent_ = ReturnType<typeof ToolsPanel__SvelteComponent_>;
/*Ωignore_endΩ*/export default ToolsPanel__SvelteComponent_;