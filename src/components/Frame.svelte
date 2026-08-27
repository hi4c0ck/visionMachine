<script lang="ts">
	let {
		userName,
		selectedTheme,
		layoutMode,
		showWelcome,
		onlogout,
		onthemeChange,
		onlayoutChange
	} = $props<{
		userName: string;
		selectedTheme: string;
		layoutMode: string;
		showWelcome: boolean;
		onlogout?: () => void;
		onthemeChange?: (theme: string) => void;
		onlayoutChange?: (mode: string) => void;
	}>();

	const layouts = [
		{ id: 'landscape', label: 'Landscape', icon: '⬜' },
		{ id: 'portrait', label: 'Portrait', icon: '⬛' },
		{ id: 'single', label: 'Single', icon: '🖥' },
	];

	let previewImage = $state<string | null>(null);

	function setLayout(mode: string) {
		console.log('[Frame] Layout:', mode);
		onlayoutChange?.(mode);
	}

	function handlePreviewClick() {
		console.log('[Frame] Preview image clicked');
	}
</script>

<header class="frame">
	<!-- Top section: logo + layout controls -->
	<div class="frame-top">
		<div class="logo">
			<span class="logo-icon">◆</span>
			<span class="logo-text">VisionMachine</span>
			{#if showWelcome}
				<span class="welcome-badge">✨ New</span>
			{/if}
		</div>

		<div class="layout-controls">
			{#each layouts as layout}
				<button
					class="layout-btn {layoutMode === layout.id ? 'active' : ''}"
					onclick={() => setLayout(layout.id)}
					title={layout.label}
				>
					{layout.icon} {layout.label}
				</button>
			{/each}
		</div>
	</div>

	<!-- Middle section: frame/video preview container -->
	<div class="frame-preview">
		{#if previewImage}
			<img src={previewImage} alt="Frame preview" class="preview-img" onclick={handlePreviewClick} />
		{:else}
			<div class="preview-empty" onclick={handlePreviewClick}>
				<span class="preview-icon">▶</span>
				<span class="preview-label">Frame &lt;img-video-container&gt;</span>
			</div>
		{/if}
	</div>

	<!-- Bottom section: theme selector + user info -->
	<div class="frame-bottom">
		<div class="theme-selector">
			<label for="theme-select">Theme:</label>
			<select id="theme-select" onchange={(e) => onthemeChange?.(e.currentTarget.value)}>
				<option value="jetbrains-dark">JetBrains Dark</option>
				<option value="steel-dark">Steel Machinery Dark</option>
				<option value="light">Light</option>
			</select>
		</div>

		{#if userName}
			<div class="user-section">
				<div class="user-badge">
					<span class="avatar">{userName.charAt(0).toUpperCase()}</span>
					<span class="name">{userName}</span>
				</div>
				<button class="logout-btn" onclick={onlogout}>↗ Logout</button>
			</div>
		{/if}
	</div>
</header>

<style>
	.frame {
		display: flex;
		flex-direction: column;
		background: var(--bg-secondary, #3C3F46);
		border-bottom: 1px solid var(--border-color, #4E525A);
		flex-shrink: 0;
		user-select: none;
	}

	/* ── Top section ── */
	.frame-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		border-bottom: 1px solid var(--border-color, #4E525A);
	}

	.logo {
		display: flex;
		align-items: center;
		gap: 12px;
		font-size: 1.1rem;
		font-weight: 600;
		color: var(--text-primary, #EEEEEE);
	}

	.logo-icon {
		font-size: 1.4rem;
		color: var(--accent-primary, #59B5FF);
	}

	.welcome-badge {
		background: linear-gradient(135deg, #ff3e00, #ff7b00);
		color: white;
		font-size: 0.7rem;
		padding: 2px 8px;
		border-radius: 10px;
		font-weight: 600;
	}

	.layout-controls {
		display: flex;
		gap: 8px;
	}

	.layout-btn {
		padding: 8px 16px;
		background: var(--bg-tertiary, #4E525A);
		border: 1px solid var(--border-color, #4E525A);
		border-radius: 6px;
		color: var(--text-secondary, #BFBFBF);
		cursor: pointer;
		font-size: 0.85rem;
		transition: all 0.15s ease;
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.layout-btn:hover {
		background: var(--bg-hover, #5A5D65);
		color: var(--text-primary, #EEEEEE);
	}

	.layout-btn.active {
		background: var(--accent-primary, #59B5FF);
		color: var(--text-inverse, #FFFFFF);
		border-color: var(--accent-primary, #59B5FF);
	}

	/* ── Preview section ── */
	.frame-preview {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 200px;
		background: var(--bg-primary, #1A1A1D);
		border-bottom: 1px solid var(--border-color, #3A3A3F);
		cursor: pointer;
		position: relative;
		overflow: hidden;
	}

	.preview-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		color: var(--text-muted, #606060);
		transition: all 0.15s;
	}

	.preview-empty:hover {
		color: var(--text-secondary, #BFBFBF);
	}

	.preview-icon {
		font-size: 2rem;
		opacity: 0.5;
	}

	.preview-label {
		font-size: 0.85rem;
		font-style: italic;
	}

	.preview-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	/* ── Bottom section ── */
	.frame-bottom {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 16px;
	}

	.theme-selector {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.85rem;
		color: var(--text-secondary, #BFBFBF);
	}

	.theme-selector select {
		padding: 6px 10px;
		background: var(--bg-tertiary, #4E525A);
		color: var(--text-primary, #EEEEEE);
		border: 1px solid var(--border-color, #4E525A);
		border-radius: 4px;
		cursor: pointer;
	}

	.user-section {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.user-badge {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 12px;
		background: var(--bg-tertiary, #4E525A);
		border-radius: 20px;
	}

	.avatar {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: var(--accent-primary, #59B5FF);
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.name {
		font-size: 0.875rem;
		color: var(--text-primary, #EEEEEE);
	}

	.logout-btn {
		padding: 6px 12px;
		background: transparent;
		border: 1px solid var(--border-color, #4E525A);
		border-radius: 6px;
		color: var(--text-muted, #808080);
		cursor: pointer;
		font-size: 0.85rem;
		transition: all 0.15s ease;
	}

	.logout-btn:hover {
		background: rgba(220, 38, 38, 0.15);
		color: #dc2626;
		border-color: #dc2626;
	}
</style>
