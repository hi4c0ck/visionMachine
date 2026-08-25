const fs = require('fs');

let c = fs.readFileSync('D:/work/horizonsMachine/VisionMachine/src/components/Workspace.svelte', 'utf8');

// Add pipes to any session that doesn't have them when loading from localStorage
c = c.replace(
  'projects = parsed;',
  `projects = parsed.map(p => ({
    ...p,
    sessions: p.sessions.map(s => ({
      ...s,
      pipes: s.pipes && s.pipes.length > 0 ? s.pipes : [{
        id: crypto.randomUUID(),
        lengthFrames: 121,
        keyframes: [],
        qValue: 18,
        cValue: 7,
        segments: [],
      }],
    })),
  }));`
);

fs.writeFileSync('D:/work/horizonsMachine/VisionMachine/src/components/Workspace.svelte', c);
console.log('Fixed Workspace.svelte - now ensures all sessions have pipes on load');
