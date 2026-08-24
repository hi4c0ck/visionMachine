export interface Point {
	x: number;
	y: number;
}

export interface Size {
	width: number;
	height: number;
}

export interface Rectangle extends Point, Size {}

export interface Color {
	r: number;
	g: number;
	b: number;
	a: number;
}

export interface RangeValue {
	min: number;
	max: number;
}

export type ToolType = 'brush' | 'eraser' | 'fill' | 'select' | 'move' | 'text' | 'shape';

export interface Tool {
	id: string;
	name: string;
	icon: string;
	config: Record<string, any>;
}

export interface Frame {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
	src: string;
	rotation: number;
	label: string;
	layerId: string;
}

export interface Layer {
	id: string;
	name: string;
	visible: boolean;
	opacity: number;
	blendingMode: string;
	strokeColor: string;
	strokeWidth: number;
	fillColor: string;
}

export interface ProjectDimensions {
	width: number;
	height: number;
}

export interface Project {
	id: string;
	name: string;
	createdAt: Date;
	updatedAt: Date;
	layers: Layer[];
	frames: Frame[];
	dimensions: ProjectDimensions;
	activeFrameId: string | null;
	activeLayerIndex: number;
	isDirty: boolean;
}

export interface UserProfile {
	email: string;
	displayName: string;
	theme: string;
	preferences: Record<string, any>;
	projectsCreated: number;
	sessionTime: number;
}

// Legacy types for backward compatibility with tests
export interface PipeConfig {
	id: string;
	type: 'text2img' | 'img2img' | 'url';
	prompt?: string;
	negativePrompt?: string;
	seed?: number;
	strength?: number;
	model?: string;
}

export interface Keyframe {
	id: string;
	imageUrl: string;
	index: number;
}

export interface Segment {
	id: string;
	type: 'scene' | 'camera' | 'rotation' | 'lighting' | 'effect' | 'zoom' | 'transition';
	duration: number;
	config: Record<string, any>;
}

export interface SessionData {
	id: string;
	name: string;
	createdAt: number;
	updatedAt: number;
	directoryPath: string;
	pipes: PipeConfig[];
	fps: number;
	resolution: string;
	orientation: string;
	totalGeneratedFrames: number;
	keyframes?: Keyframe[];
	segments?: Segment[];
	globalPrompt?: string;
}

export interface ProjectData {
	id: string;
	name: string;
	createdAt: number;
	directoryPath: string;
	sessions: SessionData[];
	totalGenerations: number;
}

export interface AppState {
	project: Project | null;
	projects: Project[];
	activeProjectId: string | null;
	activeLayerIndex: number;
	activeTool: ToolType;
	user: UserProfile;
	zoom: number;
	panOffset: Point;
	history: HistoryEntry[];
	redoStack: HistoryEntry[];
}

export interface HistoryEntry {
	timestamp: Date;
	action: string;
	data: any;
}

export interface CanvasConfig {
	width: number;
	height: number;
	backgroundColor: string;
	gridEnabled: boolean;
	gridSize: number;
	rulersEnabled: boolean;
}

export interface ThemeColors {
	primary: string;
	secondary: string;
	accent: string;
	background: string;
	surface: string;
	text: string;
	textSecondary: string;
	border: string;
	error: string;
	success: string;
	warning: string;
	info: string;
}

export interface WorkspaceLayout {
	sidebarWidth: number;
	toolbarHeight: number;
	statusBarHeight: number;
	showSidebar: boolean;
	showToolbar: boolean;
	showStatusBar: boolean;
}

export interface UndoRedoState {
	canUndo: boolean;
	canRedo: boolean;
	historyIndex: number;
	totalSteps: number;
}

export interface Notification {
	id: string;
	type: 'success' | 'error' | 'warning' | 'info';
	message: string;
	duration: number;
	dismissable: boolean;
}

export interface DialogConfig {
	title: string;
	message: string;
	type: 'alert' | 'confirm' | 'prompt';
	buttons: DialogButton[];
	defaultButton?: string;
}

export interface DialogButton {
	label: string;
	value: string;
	variant: 'primary' | 'secondary' | 'danger';
}

export interface ToastOptions {
	type: 'success' | 'error' | 'warning' | 'info';
	message: string;
	duration?: number;
	position?: 'top' | 'bottom';
}
