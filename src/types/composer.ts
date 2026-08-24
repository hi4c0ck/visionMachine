export interface ComposerConfig {
	mode: 'text' | 'image';
	theme: string;
	color: string;
	alignment: 'left' | 'center' | 'right';
	fontSize: number;
	text?: string;
	imageSrc?: string;
	width: number;
	height: number;
	borderRadius: number;
	backgroundColor: string;
	padding: number;
	fontFamily: string;
	bold: boolean;
	italic: boolean;
	shadow: boolean;
	blur?: number;
	opacity?: number;
	x?: number;
	y?: number;
	rotation?: number;
}

export interface ComposerTemplate {
	name: string;
	config: ComposerConfig;
	createdAt: Date;
	updatedAt: Date;
	usedCount: number;
}

export interface ComposerHistory {
	id: string;
	config: ComposerConfig;
	createdAt: Date;
	previewUrl?: string;
}
