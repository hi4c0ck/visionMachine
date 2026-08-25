const fs = require('fs');
let c = fs.readFileSync('D:/work/horizonsMachine/VisionMachine/src/components/Workspace.svelte', 'utf8');
c = c.replace('{#if selectedSession && selectedProject}', '{#if selectedSession && selectedProject && selectedSession.pipes}');
fs.writeFileSync('D:/work/horizonsMachine/VisionMachine/src/components/Workspace.svelte', c);
console.log('Fixed');
