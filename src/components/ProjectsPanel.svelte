<script lang="ts">
	interface Project {
		id: string;
		name: string;
		thumbnail?: string;
		sessionId?: string;
	}

	let {
		projects,
		selectedProjectId,
		onselect,
		onnew,
		ondelete
	} = $props<{
		projects: Project[];
		selectedProjectId: string | null;
		onselect?: (id: string) => void;
		onnew?: () => void;
		ondelete?: (id: string) => void;
	}>();

	function handleNew() {
		console.log('[Projects] Create new project');
		onnew?.();
	}

	function handleDelete(id: string, e: Event) {
		e.stopPropagation();
		console.log('[Projects] Delete:', id);
		ondelete?.(id);
	}
</script>

<aside class="projects-panel">
	<div class="panel-header">
		<h3>📁 Projects</h3>
		<button class="add-btn" onclick={handleNew} title="Create New Project">+ New</button>
	</div>

	<div class="project-list">
		{#if projects.length === 0}
			<div class="empty-state">
				<p>No projects yet</p>
				<button class="create-first" onclick={handleNew}>Create your first project</button>
			</div>
		{:else}
			{#each projects as project (project.id)}
				<div
					class="project-item {selectedProjectId === project.id ? 'selected' : ''}"
					onclick={() => onselect?.(project.id)}
					role="button"
					tabindex="0"
					aria-pressed={selectedProjectId === project.id}
				>
					<div class="project-icon">
						{#if project.thumbnail}
							<img src={project.thumbnail} alt="" />
						{:else}
							<span>🎬</span>
						{/if}
					</div>
					<div class="project-info">
						<div class="project-name">{project.name}</div>
						{#if project.sessionId}
							<div class="session-tag">Session: {project.sessionId.slice(0, 6)}</div>
						{:else}
							<div class="project-meta">No session</div>
						{/if}
					</div>
					<button class="delete-btn" onclick={(e) => handleDelete(project.id, e)} title="Delete">×</button>
				</div>
			{/each}
		{/if}
	</div>
</aside>

<style>
	.projects-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--bg-secondary, #3C3F46);
		border-right: 1px solid var(--border-color, #4E525A);
		min-width: 220px;
		max-width: 280px;
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 16px;
		border-bottom: 1px solid var(--border-color, #4E525A);
	}

	.panel-header h3 {
		margin: 0;
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--text-primary, #EEEEEE);
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.add-btn {
		padding: 6px 12px;
		background: var(--accent-primary, #59B5FF);
		color: white;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.8rem;
		font-weight: 500;
		transition: all 0.15s ease;
	}

	.add-btn:hover {
		background: var(--accent-primary-hover, #7EC8FF);
		transform: translateY(-1px);
	}

	.project-list {
		flex: 1;
		overflow-y: auto;
		padding: 8px;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		padding: 40px 20px;
		text-align: center;
		color: var(--text-muted, #808080);
	}

	.empty-state p {
		margin: 0;
		font-size: 0.9rem;
	}

	.create-first {
		padding: 10px 20px;
		background: var(--accent-primary, #59B5FF);
		color: white;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.875rem;
		transition: all 0.15s ease;
	}

	.create-first:hover {
		background: var(--accent-primary-hover, #7EC8FF);
	}

	.project-item {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.15s ease;
		margin-bottom: 4px;
		position: relative;
		border: 1px solid transparent;
	}

	.project-item:hover {
		background: var(--bg-hover, #4E525A);
	}

	.project-item.selected {
		background: rgba(89, 181, 255, 0.15);
		border-color: var(--accent-primary, #59B5FF);
	}

	.project-icon {
		width: 36px;
		height: 36px;
		border-radius: 6px;
		background: var(--bg-tertiary, #4E525A);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.2rem;
		flex-shrink: 0;
	}

	.project-icon img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: 6px;
	}

	.project-info {
		flex: 1;
		min-width: 0;
	}

	.project-name {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--text-primary, #EEEEEE);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.session-tag {
		font-size: 0.7rem;
		color: var(--accent-primary, #59B5FF);
		background: rgba(89, 181, 255, 0.1);
		padding: 2px 6px;
		border-radius: 4px;
		display: inline-block;
		margin-top: 2px;
	}

	.project-meta {
		font-size: 0.7rem;
		color: var(--text-muted, #808080);
		margin-top: 2px;
	}

	.delete-btn {
		opacity: 0;
		padding: 4px 8px;
		background: transparent;
		border: none;
		color: var(--text-muted, #808080);
		cursor: pointer;
		font-size: 1.1rem;
		border-radius: 4px;
		transition: all 0.15s ease;
	}

	.project-item:hover .delete-btn {
		opacity: 1;
	}

	.delete-btn:hover {
		background: rgba(220, 38, 38, 0.15);
		color: #dc2626;
	}
</style>