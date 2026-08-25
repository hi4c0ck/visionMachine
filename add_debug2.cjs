const fs = require('fs');
let c = fs.readFileSync('D:/work/horizonsMachine/VisionMachine/src/components/Workspace.svelte', 'utf8');

// Add debug logging before rendering ComposerPanel
c = c.replace(
  '{#if selectedSession && selectedProject}',
  `{#if selectedSession && selectedProject}
    {@debug selectedSession selectedProject}
    <script>
      console.log('[Workspace] Rendering ComposerPanel', {
        hasSession: !!selectedSession,
        hasProject: !!selectedProject,
        sessionId: selectedSession?.id,
        hasPipes: !!(selectedSession?.pipes),
        pipeCount: selectedSession?.pipes?.length
      });
    </script>`
);

// Also add error boundary to catch any errors
c = c.replace(
  '<div class="composer-area">',
  `<div class="composer-area" onerror={(e) => console.error('[Workspace] Error:', e.detail)}>`
);

fs.writeFileSync('D:/work/horizonsMachine/VisionMachine/src/components/Workspace.svelte', c);
console.log('Added detailed debugging');
