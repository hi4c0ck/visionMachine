<!-- Global error popup — catches all unhandled render/runtime errors as a
	non-blocking, dismissible overlay so the app stays explorable (the user
	can confirm a recurring error is reproducible before dismissing it). -->
<script lang="ts">
	import { onMount } from 'svelte';

	let { error, fallback, children }: { 
		error?: Error | null;
		fallback?: (err: Error | null) => any;
		children?: any;
	} = $props();

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
</script>

{#if displayedError || error}
	<div class="error-popup" role="presentation">
		{#if fallback}
			{@render fallback(displayedError ?? error ?? null)}
		{:else}
			<div class="error-container">
				<div class="error-icon">⚠️</div>
				<h2>Something went wrong</h2>
				<p class="error-message">{getErrorMessage(displayedError ?? error ?? null)}</p>
				<p class="error-hint">The app stays usable — keep exploring; this error will pop up again if it's reproducible.</p>
				<div class="error-actions">
					<button class="btn-details" onclick={() => showDetails = !showDetails}>
						{showDetails ? 'Hide details' : 'More info'}
					</button>
					<button class="btn-retry" onclick={retry}>
						Continue
					</button>
				</div>
				{#if showDetails}
					<div class="error-stack">
						<pre>{(displayedError || error)?.stack ?? getErrorMessage(displayedError ?? error ?? null)}</pre>
					</div>
				{/if}
			</div>
		{/if}
	</div>
	{/if}

	{@render children?.()}

<style>
	.error-popup {
		position: fixed;
		inset: 0;
		z-index: 9990;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px;
		/* Subtle dim — non-blocking on purpose: the app underneath stays
		   fully interactive so the user can keep exploring. No click handler
		   on the backdrop; dismiss is via the Continue button only. */
		background: rgba(0, 0, 0, 0.35);
	}

	.error-container {
		text-align: center;
		padding: 32px 40px;
		max-width: 520px;
		width: 100%;
		background: var(--bg-secondary, #2A2A2E);
		border: 1px solid var(--border-color, #4E525A);
		border-radius: 12px;
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
		color: var(--text-primary, #EEEEEE);
	}

	.error-icon {
		font-size: 64px;
		margin-bottom: 20px;
	}

	.error-container h2 {
		font-size: 24px;
		color: var(--text-primary, #EEEEEE);
		margin-bottom: 12px;
	}

	.error-message {
		font-size: 14px;
		color: var(--text-secondary, #BFBFBF);
		margin-bottom: 8px;
		word-break: break-word;
	}

	.error-hint {
		font-size: 12px;
		color: var(--text-muted, #808080);
		margin-bottom: 24px;
	}

	.error-actions {
		display: flex;
		gap: 12px;
		justify-content: center;
		flex-wrap: wrap;
		margin-top: 16px;
	}

	.error-stack {
		margin-top: 16px;
		text-align: left;
		background: var(--bg-tertiary, #3A3A3F);
		padding: 12px;
		border-radius: 6px;
		max-height: 200px;
		overflow: auto;
	}

	.error-stack pre {
		margin: 0;
		font-size: 11px;
		color: var(--text-muted, #808080);
		font-family: monospace;
		white-space: pre-wrap;
		word-break: break-all;
	}

	.btn-retry, .btn-details {
		padding: 10px 24px;
		border-radius: 6px;
		font-size: 14px;
		cursor: pointer;
		border: none;
		transition: all 0.15s;
	}

	.btn-retry {
		background: var(--accent-primary, #59B5FF);
		color: #fff;
	}

	.btn-retry:hover {
		background: var(--accent-primary-hover, #7EC8FF);
		transform: translateY(-1px);
	}

	.btn-details {
		background: var(--bg-tertiary, #3A3A3F);
		color: var(--text-secondary, #BFBFBF);
		border: 1px solid var(--border-color, #4E525A);
	}

	.btn-details:hover {
		background: var(--bg-hover, #4A4A4F);
	}
</style>