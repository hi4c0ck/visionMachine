const fs = require('fs');
const path = 'D:/work/horizonsMachine/VisionMachine/src/components/Workspace.svelte';
let content = fs.readFileSync(path, 'utf8');

// Find and insert debug overlay
const searchStr = '{#if selectedSession && selectedProject}';
const idx = content.indexOf(searchStr);
if (idx === -1) {
  console.log('ERROR: Could not find target string');
  process.exit(1);
}

const debugOverlay = '<div style="position:fixed;top:0;left:0;background:rgba(0,0,0,0.9);color:#0f0;padding:8px;font-family:monospace;font-size:10px;z-index:9999;pointer-events:none;">\nDEBUG: projects={projects.length} | projId={selectedProjectId||\'null\'} | sessionId={selectedSessionId||\'null\'} | hasProj={!!selectedProject} | hasSess={!!selectedSession}\n</div>';

content = content.replace(searchStr, debugOverlay + '\n\t\t\t' + searchStr);

fs.writeFileSync(path, content);
console.log('Debug overlay added at index', idx);
