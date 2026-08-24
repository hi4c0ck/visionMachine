import type { Project, Layer, Frame, UserProfile } from './types/app';

export default class App {
	projects: Project[] = [];
	activeProjectId: string | null = null;
	activeLayerIndex: number = 0;
	user: UserProfile = {
		email: '',
		displayName: '',
		theme: 'dark',
		preferences: {},
		projectsCreated: 0,
		sessionTime: 0,
	};
	composerTemplates: Array<{name: string; config: any; createdAt: Date; updatedAt: Date; usedCount: number}> = [];
	isDragging: boolean = false;

	constructor() {
		this.loadFromStorage();
	}

	get activeProject(): Project | null {
		return this.projects.find(p => p.id === this.activeProjectId) ?? null;
	}

	createProject(name: string): Project {
		const project: Project = {
			id: crypto.randomUUID(),
			name,
			createdAt: new Date(),
			updatedAt: new Date(),
			layers: [
				{
					id: crypto.randomUUID(),
					name: 'Layer 1',
					visible: true,
					opacity: 100,
					blendingMode: 'normal',
					strokeColor: '#000000',
					strokeWidth: 1,
					fillColor: '#ffffff',
				}
			],
			frames: [],
			dimensions: { width: 1920, height: 1080 },
			activeFrameId: null,
			activeLayerIndex: 0,
			isDirty: false,
		};
		
		this.projects.push(project);
		this.activeProjectId = project.id;
		this.user.projectsCreated++;
		this.saveToStorage();
		return project;
	}

	selectProject(projectId: string): void {
		this.activeProjectId = projectId;
	}

	deleteProject(projectId: string): void {
		this.projects = this.projects.filter(p => p.id !== projectId);
		if (this.activeProjectId === projectId) {
			this.activeProjectId = this.projects[0]?.id ?? null;
		}
		this.saveToStorage();
	}

	addLayer(): void {
		const project = this.activeProject;
		if (!project) return;
		
		const layer: Layer = {
			id: crypto.randomUUID(),
			name: `Layer ${project.layers.length + 1}`,
			visible: true,
			opacity: 100,
			blendingMode: 'normal',
			strokeColor: '#000000',
			strokeWidth: 1,
			fillColor: '#ffffff',
		};
		
		project.layers.push(layer);
		this.activeLayerIndex = project.layers.length - 1;
		project.isDirty = true;
		this.saveToStorage();
	}

	deleteLayer(layerId: string): void {
		const project = this.activeProject;
		if (!project) return;
		
		const index = project.layers.findIndex(l => l.id === layerId);
		if (index === -1) return;
		
		project.layers.splice(index, 1);
		
		if (this.activeLayerIndex >= project.layers.length) {
			this.activeLayerIndex = Math.max(0, project.layers.length - 1);
		}
		
		project.isDirty = true;
		this.saveToStorage();
	}

	toggleLayerVisibility(layerId: string): void {
		const project = this.activeProject;
		if (!project) return;
		
		const layer = project.layers.find(l => l.id === layerId);
		if (layer) {
			layer.visible = !layer.visible;
			project.isDirty = true;
			this.saveToStorage();
		}
	}

	changeLayerOrder(layerId: string, direction: 'up' | 'down'): void {
		const project = this.activeProject;
		if (!project) return;
		
		const index = project.layers.findIndex(l => l.id === layerId);
		if (index === -1) return;
		
		if (direction === 'up' && index < project.layers.length - 1) {
			[project.layers[index], project.layers[index + 1]] = 
			[project.layers[index + 1], project.layers[index]];
		} else if (direction === 'down' && index > 0) {
			[project.layers[index], project.layers[index - 1]] = 
			[project.layers[index - 1], project.layers[index]];
		}
		
		project.isDirty = true;
		this.saveToStorage();
	}

	setComposerConfig(config: any): void {
		console.log('Setting composer config:', config);
	}

	applyComposerToLayer(layer: Layer, config: any): void {
		if (config.color) layer.fillColor = config.color;
		if (config.opacity !== undefined) layer.opacity = config.opacity;
		layer.name = config.text ?? layer.name;
	}

	saveComposerTemplate(name: string, config: any): void {
		this.composerTemplates.push({
			name,
			config,
			createdAt: new Date(),
			updatedAt: new Date(),
			usedCount: 0,
		});
		this.saveToStorage();
	}

	loadComposerTemplate(name: string): any | null {
		const template = this.composerTemplates.find(t => t.name === name);
		if (template) {
			template.usedCount++;
			this.saveToStorage();
			return template.config;
		}
		return null;
	}

	saveToStorage(): void {
		try {
			localStorage.setItem('vm-projects', JSON.stringify(this.projects));
			localStorage.setItem('vm-user', JSON.stringify(this.user));
			localStorage.setItem('vm-templates', JSON.stringify(this.composerTemplates));
			localStorage.setItem('vm-active-project', this.activeProjectId ?? '');
		} catch (error) {
			console.error('Failed to save to storage:', error);
		}
	}

	loadFromStorage(): void {
		try {
			const projects = localStorage.getItem('vm-projects');
			const user = localStorage.getItem('vm-user');
			const templates = localStorage.getItem('vm-templates');
			const activeProjectId = localStorage.getItem('vm-active-project');
			
			if (projects) {
				this.projects = JSON.parse(projects);
			}
			if (user) {
				this.user = JSON.parse(user);
			}
			if (templates) {
				this.composerTemplates = JSON.parse(templates);
			}
			if (activeProjectId) {
				this.activeProjectId = activeProjectId;
			}
		} catch (error) {
			console.error('Failed to load from storage:', error);
		}
	}

	async exportProject(): Promise<void> {
		const project = this.activeProject;
		if (!project) return;
		
		const data = {
			project,
			exportedAt: new Date().toISOString(),
			version: '1.0.0',
		};
		
		const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${project.name}-export.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	async importProject(file: File): Promise<void> {
		const text = await file.text();
		const data = JSON.parse(text) as { project: Project; version: string };
		
		if (data.version !== '1.0.0') {
			throw new Error('Unsupported project version');
		}
		
		this.projects.push(data.project);
		this.activeProjectId = data.project.id;
		this.saveToStorage();
	}
}
