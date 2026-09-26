<script lang="ts">
	import { APP_CONSTANTS } from '$constants';
</script>

<!-- Global attribution footer: shown on every screen (welcome + workspace),
     satisfying the "at the point of first launch" requirement in NOTICE.md. -->
<footer class="vm-footer" aria-label="About">
	<span class="vm-footer-copy">{APP_CONSTANTS.strings.copyright}</span>
	<a
		class="vm-footer-repo"
		href={APP_CONSTANTS.strings.repoUrl}
		target="_blank"
		rel="noreferrer"
	>github</a>
	<span class="vm-footer-version">v{APP_CONSTANTS.strings.version}</span>
</footer>

<style>
	.vm-footer {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 6px 16px;
		background: var(--bg-secondary);
		border-top: 1px solid var(--border, #4E525A);
		font-size: 0.65rem;
		color: var(--text-muted, #808080);
		flex-shrink: 0;
		user-select: none;
	}

	.vm-footer-copy {
		flex: 1;
	}

	.vm-footer-repo {
		color: var(--text-muted, #808080);
		text-decoration: none;
		border-bottom: 1px dotted var(--border, #4E525A);
	}

	.vm-footer-repo:hover {
		color: var(--text-primary, #EEEEEE);
	}

	.vm-footer-version {
		font-family: 'JetBrains Mono', monospace;
		opacity: 0.8;
	}
</style>
