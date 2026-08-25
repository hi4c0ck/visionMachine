const fs = require('fs');
let c = fs.readFileSync('D:/work/horizonsMachine/VisionMachine/src/components/Workspace.svelte', 'utf8');

// Remove the broken derived statement and replace with proper one
const oldPattern = /let selectedSession = \$derived\(\(\) => \{[\s\S]*?return sess \? ensurePipes\(sess\) : null;\n\t\}\);/;
const newCode = `let selectedSession = $derived(() => {
    if (!selectedProject || !selectedSessionId) return null;
    const sess = selectedProject.sessions.find(s => s.id === selectedSessionId);
    return sess ? ensurePipes(sess) : null;
});`;

c = c.replace(oldPattern, newCode);

// Also fix the template to use optional chaining
c = c.replace(
  '{#if selectedSession && selectedProject}',
  '{#if selectedSession() && selectedProject}'
);
c = c.replace(
  '{selectedSession}',
  '{selectedSession()}'
);

fs.writeFileSync('D:/work/horizonsMachine/VisionMachine/src/components/Workspace.svelte', c);
console.log('Applied fixes');