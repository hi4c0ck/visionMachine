///<reference types="svelte" />
;
import { onMount } from 'svelte';

;type $$ComponentProps =  { 
		error?: Error | null;
		fallback?: (err: Error | null) => any;
		children?: any;
	};function $$render() {

	

	let { error, fallback, children }:/*Ωignore_startΩ*/$$ComponentProps/*Ωignore_endΩ*/ = $props();

	let displayedError = $state<Error | null>(null);
	let retryCount = $state(0);
	let showDetails = $state(false);

	// Global uncaught error handler. Non-blocking: an error surfaces as a
	// dismissible popup on top of the live app (displayedError) instead of
	// replacing the whole UI, so the user can keep exploring and confirm the
	// error's reproducibility. A persistent, repeated error is still
	// recoverable: retry() dismisses the popup and re-attaches the listeners.
	onMount(() => {
		const handleError = (event: WindowEventMap['error']) => {
			const error = event?.error || new Error('Unknown runtime error');
			displayedError = error;
			console.error('[ErrorHandler] Uncaught error:', error);
		};

		const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
			const error = event?.reason || new Error('Unhandled promise rejection');
			displayedError = error;
			console.error('[ErrorHandler] Unhandled rejection:', error);
		};

		window.addEventListener('error', handleError);
		window.addEventListener('unhandledrejection', handleUnhandledRejection);

		return () => {
			window.removeEventListener('error', handleError);
			window.removeEventListener('unhandledrejection', handleUnhandledRejection);
		};
	});

	function retry() {
		displayedError = null;
		showDetails = false;
		retryCount++;
	}

	function getErrorMessage(err: Error | null): string {
		if (!err) return 'An unknown error occurred';
		return err.message || String(err);
	}
;
async () => {


if(displayedError || error){
	 { svelteHTML.createElement("div", {   "class":`error-popup`,"role":`presentation`,});
		if(fallback){
			;__sveltets_2_ensureSnippet(fallback(displayedError ?? error ?? null));
		}else{
			 { svelteHTML.createElement("div", { "class":`error-container`,});
				 { svelteHTML.createElement("div", { "class":`error-icon`,});  }
				 { svelteHTML.createElement("h2", {});   }
				 { svelteHTML.createElement("p", { "class":`error-message`,});getErrorMessage(displayedError ?? error ?? null); }
				 { svelteHTML.createElement("p", { "class":`error-hint`,});                }
				 { svelteHTML.createElement("div", { "class":`error-actions`,});
					 { svelteHTML.createElement("button", {   "class":`btn-details`,"onclick":() => showDetails = !showDetails,});
						showDetails ? 'Hide details' : 'More info';
					 }
					 { svelteHTML.createElement("button", {   "class":`btn-retry`,"onclick":retry,});
						
					 }
				 }
				if(showDetails){
					 { svelteHTML.createElement("div", { "class":`error-stack`,});
						 { svelteHTML.createElement("pre", {});(displayedError || error)?.stack ?? getErrorMessage(displayedError ?? error ?? null); }
					 }
				}
			 }
		}
	 }
	}

	;__sveltets_2_ensureSnippet(children?.());

};
return { props: {} as any as $$ComponentProps, exports: {}, bindings: __sveltets_$$bindings(''), slots: {}, events: {} }}
const ErrorHandler__SvelteComponent_ = __sveltets_2_fn_component($$render());
/*Ωignore_startΩ*/type ErrorHandler__SvelteComponent_ = ReturnType<typeof ErrorHandler__SvelteComponent_>;
/*Ωignore_endΩ*/export default ErrorHandler__SvelteComponent_;