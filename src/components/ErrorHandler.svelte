<!-- Global Error Boundary - catches all unhandled render/runtime errors -->
<script lang="ts">
	import { onMount } from 'svelte';

	let { error, fallback, children }: { 
		error?: Error | null;
		fallback?: (err: Error | null) => any;
		children?: any;
	} = $props();

	let displayedError = $state<Error | null>(null);
	let retryCount = $state(0);

	// Global uncaught error handler
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
		retryCount++;
	}

	function getErrorMessage(err: Error): string {
		if (!err) return 'An unknown error occurred';
		return err.message || String(err);
	}
</script>

{#if displayedError || error}
	<div class="error-boundary">
		{#if fallback}
			{@render fallback(displayedError || error)}
		{:else}
			<div class="error-container">
				<div class="error-icon">⚠️</div>
				<h2>Something went wrong</h2>
				<p class="error-message">{getErrorMessage(displayedError || error)}</p>
				<p class="error-hint">This might be a temporary issue. Try refreshing the app.</p>
				<div class="error-actions">
					<button class="btn-retry" onclick={retry}>
						Try Again
					</button>
					<button 
						class="btn-details" 
						onclick={() => console.error('[ErrorHandler] Full error details:', displayedError || error)}
					>
						View Details
					</button>
				</div>
				{#if import.meta.env.DEV}
					<div class="error-stack">
						<pre>{(displayedError || error)?.stack}</pre>
					</div>
				{/if}
			</div>
		{/if}
	</div>
{:else}
	{@render children?.()}
{/if}

<style>
	.error-boundary {
		position: fixed;
		inset: 0;
		z-index: 9999;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg-primary, #1A1A1D);
	}

	.error-container {
		text-align: center;
		padding: 40px;
		max-width: 500px;
		width: 90%;
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

	.error-stack {
		margin-top: 24px;
		text-align: left;
		background: var(--bg-secondary, #2A2A2E);
		padding: 16px;
		border-radius: 6px;
		max-height: 200px;
		overflow: auto;
	}

	.error-stack pre {
		font-size: 11px;
		color: var(--text-muted, #808080);
		font-family: monospace;
		white-space: pre-wrap;
		word-break: break-all;
	}
</style>