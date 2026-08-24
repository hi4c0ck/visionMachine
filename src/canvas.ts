import type App from './App';

export function createCanvas(canvas: HTMLCanvasElement, app: App): { destroy: () => void } {
	const ctx = canvas.getContext('2d');
	if (!ctx) {
		return { destroy: () => {} };
	}

	// Use a local variable to help TypeScript narrow the type
	const context = ctx;

	function render() {
		const container = document.getElementById('canvas-container');
		if (!container) return;
		
		const rect = container.getBoundingClientRect();
		canvas.width = rect.width - 40;
		canvas.height = rect.height - 40;
		
		context.clearRect(0, 0, canvas.width, canvas.height);
		
		const project = app.activeProject;
		if (!project) return;
		
		// Draw layers from bottom to top
		for (const layer of project.layers) {
			if (!layer.visible) continue;
			
			context.save();
			context.globalAlpha = layer.opacity / 100;
			context.fillStyle = layer.fillColor;
			context.strokeStyle = layer.strokeColor;
			context.lineWidth = layer.strokeWidth;
			
			// Draw layer content (simplified for now)
			context.fillRect(50, 50, 200, 150);
			
			context.restore();
		}
		
		// Draw active frame if exists
		if (project.activeFrameId) {
			const frame = project.frames.find(f => f.id === project.activeFrameId);
			if (frame) {
				context.save();
				context.translate(frame.x + frame.width / 2, frame.y + frame.height / 2);
				context.rotate((frame.rotation * Math.PI) / 180);
				context.strokeStyle = '#4CAF50';
				context.lineWidth = 2;
				context.strokeRect(-frame.width / 2, -frame.height / 2, frame.width, frame.height);
				context.restore();
			}
		}
	}

	function onResize() {
		render();
	}

	window.addEventListener('resize', onResize);
	render();

	return {
		destroy() {
			window.removeEventListener('resize', onResize);
		}
	};
}
