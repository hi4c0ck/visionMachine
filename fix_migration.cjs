const fs = require('fs');
let c = fs.readFileSync('D:/work/horizonsMachine/VisionMachine/src/components/Workspace.svelte', 'utf8');

// Fix the loadProjects function to properly migrate data
const oldCode = `projects = [{\n\t\t\t\t...parsed[0],\n\t\t\t\tsessions: parsed[0]?.sessions?.map(s => ({\n\t\t\t\t\t...s,\n\t\t\t\t\tpipes: s.pipes && s.pipes.length > 0 ? s.pipes : [{\n\t\t\t\t\t\tid: crypto.randomUUID(),\n\t\t\t\t\t\tlengthFrames: 121`;

const newCode = `// Migrate: ensure all sessions have pipes
				parsed = parsed.map(p => ({
					...p,
					sessions: p.sessions.map(s => ({
						...s,
						pipes: s.pipes && Array.isArray(s.pipes) && s.pipes.length > 0 
							? s.pipes 
							: [{
								id: crypto.randomUUID(),
								lengthFrames: 121,
								keyframes: [],
								qValue: 18,
								cValue: 7,
								segments: [],
							}],
					})),
				}));
				console.log('[Workspace] Loaded projects:', parsed.length, 'with migrated sessions');
				projects = parsed;`;

c = c.replace(oldCode, newCode);

fs.writeFileSync('D:/work/horizonsMachine/VisionMachine/src/components/Workspace.svelte', c);
console.log('Fixed loadProjects function');
