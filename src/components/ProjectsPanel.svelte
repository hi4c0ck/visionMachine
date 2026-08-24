<script lang="ts">
	import type { Project } from '$types/app';
	import App from '../App.ts';

	let { app }: { app: App } = $props();

	let searchQuery = $state('');
	let showNewProjectModal = $state(false);
	let newProjectName = $state('');

	let filteredProjects = $derived(
		app.projects.filter((p: Project) => 
			p.name.toLowerCase().includes(searchQuery.toLowerCase())
		)
	);

	function createProject() {
		if (!newProjectName.trim()) return;
		app.createProject(newProjectName.trim());
		newProjectName = '';
		showNewProjectModal = false;
	}

	function selectProject(projectId: string) {
		app.selectProject(projectId);
	}

	function handleSearch(event: Event) {
		searchQuery = (event.target as HTMLInputElement).value;
	}

	function handleNewProjectName(event: Event) {
		newProjectName = (event.target as HTMLInputElement).value;
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter' && showNewProjectModal) {
			createProject();
		}
	}
</script>

<div class="projects-panel">
	<div class="panel-header">
		<h2>Projects</h2>
		<button onclick={() => showNewProjectModal = true} class="btn-new" aria-label="Create new project">
			<span class="material-symbols-outlined">add</span>
			New
		</button>
	</div>

	<div class="search-bar">
		<span class="material-symbols-outlined" aria-hidden="true">search</span>
		<input
			type="text"
			value={searchQuery}
			oninput={handleSearch}
			placeholder="Search projects..."
			class="search-input"
			aria-label="Search projects"
		/>
	</div>

	{#if showNewProjectModal}
		<div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title">
			<div class="modal">
				<h3 id="modal-title">Create New Project</h3>
				<input
					type="text"
					value={newProjectName}
					oninput={handleNewProjectName}
					onkeydown={handleKeyDown}
					placeholder="Project name..."
					class="project-name-input"
					aria-label="Project name"
				/>
				<div class="modal-actions">
					<button onclick={() => showNewProjectModal = false} class="btn-cancel">
						Cancel
					</button>
					<button onclick={createProject} class="btn-create">
						Create
					</button>
				</div>
			</div>
		</div>
	{/if}

	<div class="projects-list" role="list" aria-label="Projects list">
		{#if filteredProjects.length === 0}
			<div class="empty-state">
				<span class="material-symbols-outlined" aria-hidden="true">folder_open</span>
				<p>No projects found</p>
			</div>
		{:else}
			{#each filteredProjects as project (project.id)}
				<div
					class="project-item {project.id === app.activeProjectId ? 'active' : ''}"
					role="listitem"
				>
					<button
						class="project-select-btn"
						onclick={() => selectProject(project.id)}
						aria-label={`Select project ${project.name}`}
						aria-current={project.id === app.activeProjectId ? 'true' : 'false'}
					>
						<div class="project-icon">
							<span class="material-symbols-outlined" aria-hidden="true">picture_as_pdf</span>
						</div>
						<div class="project-info">
							<span class="project-name">{project.name}</span>
							<span class="project-meta">
								{project.layers.length} layers · {project.dimensions.width}×{project.dimensions.height}
							</span>
						</div>
					</button>
					<button
						class="btn-delete"
						aria-label={`Delete project ${project.name}`}
						onclick={() => {
							if (confirm(`Are you sure you want to delete "${project.name}"?`)) {
								app.deleteProject(project.id);
							}
						}}
					>
						<span class="material-symbols-outlined" aria-hidden="true">delete</span>
					</button>
				</div>
			{/each}
		{/if}
	</div>
</div>

<style>
	.projects-panel {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
	}

	.panel-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 16px;
		border-bottom: 1px solid var(--sidebar-border, #444);
	}

	.panel-header h2 {
		margin: 0;
		font-size: 18px;
		font-weight: 600;
		color: var(--text-primary, #f5f5f5);
	}

	.btn-new {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 6px 12px;
		background: var(--accent-color, #4CAF50);
		border: none;
		border-radius: 6px;
		color: white;
		font-size: 14px;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn-new:hover {
		background: var(--accent-hover, #45a049);
		transform: translateY(-1px);
	}

	.search-bar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 16px;
		background: var(--search-bg, #2a2a2a);
		border-bottom: 1px solid var(--sidebar-border, #444);
	}

	.search-bar .material-symbols-outlined {
		color: var(--text-secondary, #aaa);
		font-size: 20px;
	}

	.search-input {
		flex: 1;
		background: transparent;
		border: none;
		color: var(--text-primary, #f5f5f5);
		font-size: 14px;
	}

	.search-input:focus {
		outline: none;
	}

	.projects-list {
		flex: 1;
		overflow-y: auto;
		padding: 8px;
	}

	.project-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px;
		border-radius: 8px;
		transition: all 0.2s ease;
		margin-bottom: 4px;
	}

	.project-item:hover {
		background: var(--item-hover, #3a3a3a);
	}

	.project-item.active {
		background: var(--item-active, #4CAF50);
		color: white;
	}

	.project-select-btn {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 4px;
		border: none;
		background: transparent;
		color: inherit;
		cursor: pointer;
		flex: 1;
		text-align: left;
		border-radius: 6px;
	}

	.project-icon {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--icon-bg, #555);
		border-radius: 6px;
	}

	.project-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.project-name {
		font-size: 14px;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.project-meta {
		font-size: 11px;
		opacity: 0.7;
	}

	.btn-delete {
		padding: 4px;
		background: transparent;
		border: none;
		color: var(--text-secondary, #aaa);
		cursor: pointer;
		border-radius: 4px;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.btn-delete:hover {
		background: var(--delete-bg, #f44336);
		color: white;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 40px 20px;
		color: var(--text-secondary, #aaa);
		text-align: center;
	}

	.empty-state .material-symbols-outlined {
		font-size: 48px;
		opacity: 0.5;
	}

	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.modal {
		background: var(--modal-bg, #2c2c2c);
		border-radius: 12px;
		padding: 24px;
		min-width: 300px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
	}

	.modal h3 {
		margin: 0 0 16px 0;
		font-size: 18px;
		color: var(--text-primary, #f5f5f5);
	}

	.project-name-input {
		width: 100%;
		padding: 10px 12px;
		background: var(--input-bg, #3a3a3a);
		border: 1px solid var(--border-color, #555);
		border-radius: 6px;
		color: var(--text-primary, #f5f5f5);
		font-size: 14px;
		margin-bottom: 16px;
		box-sizing: border-box;
	}

	.project-name-input:focus {
		outline: none;
		border-bottom-color: var(--accent-color, #4CAF50);
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}

	.btn-cancel,
	.btn-create {
		padding: 8px 16px;
		border-radius: 6px;
		font-size: 14px;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn-cancel {
		background: var(--button-bg, #3a3a3a);
		border: 1px solid var(--border-color, #555);
		color: var(--text-primary, #f5f5f5);
	}

	.btn-cancel:hover {
		background: var(--button-hover, #4a4a4a);
	}

	.btn-create {
		background: var(--accent-color, #4CAF50);
		border: none;
		color: white;
	}

	.btn-create:hover {
		background: var(--accent-hover, #45a049);
	}
</style>
