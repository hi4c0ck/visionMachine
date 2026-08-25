const fs = require('fs');

// Fix Workspace.svelte - add better guards
let ws = fs.readFileSync('D:/work/horizonsMachine/VisionMachine/src/components/Workspace.svelte', 'utf8');

// Fix the conditional to use optional chaining
ws = ws.replace(
  '{#if selectedSession.pipes && selectedSession.pipes.length > 0}',
  '{#if selectedSession && selectedSession.pipes && selectedSession.pipes.length > 0}'
);

fs.writeFileSync('D:/work/horizonsMachine/VisionMachine/src/components/Workspace.svelte', ws);
console.log('Fixed Workspace.svelte');

// Fix ComposerPanel.svelte - add detailed error reporting
let cp = fs.readFileSync('D:/work/horizonsMachine/VisionMachine/src/components/ComposerPanel.svelte', 'utf8');

// Add error tracking at component level
cp = cp.replace(
  '<div class="composer-panel">',
  `{#if !session || !session.pipes}
    <div class="error-state">
      <p><strong>Error: Missing session data</strong></p>
      <p>session: {session ? JSON.stringify(session, null, 2) : 'undefined'}</p>
      <p>Expected structure: { id: string, name: string, pipes: PipeRow[], fps: number, resolution: string }</p>
    </div>
  {:else}
  <div class="composer-panel">`
);

// Close the if/else block properly - find the last </div> before </style>
const lastDivIdx = cp.lastIndexOf('</div>');
const styleIdx = cp.indexOf('</style>');
if (lastDivIdx > 0 && styleIdx > lastDivIdx) {
  cp = cp.slice(0, lastDivIdx) + '</div>\n{/if}' + cp.slice(lastDivIdx);
}

fs.writeFileSync('D:/work/horizonsMachine/VisionMachine/src/components/ComposerPanel.svelte', cp);
console.log('Fixed ComposerPanel.svelte');
