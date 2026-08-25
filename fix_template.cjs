const fs = require('fs');
let c = fs.readFileSync('D:/work/horizonsMachine/VisionMachine/src/components/ComposerPanel.svelte', 'utf8');

// Fix: Ensure ALL pipe accesses use safe optional chaining or are inside guarded blocks
c = c.replace(
  '{#if session?.pipes && session.pipes.length > 0}',
  '{#if session && session.pipes && session.pipes.length > 0}'
);
c = c.replace(
  '{#each session.pipes as pipe, pipeIdx (pipe.id)}',
  '{#each session.pipes as pipe, pipeIdx (pipe.id)}'
);
c = c.replace(
  '{#each session.pipes[activeSegmentPipeIndex || 0]?.segments as segment (segment.id)}',
  '{#if session && session.pipes && session.pipes[activeSegmentPipeIndex || 0])}\n          {#each session.pipes[activeSegmentPipeIndex || 0]?.segments as segment (segment.id)}'
);

// Add closing brace for the added condition
c = c.replace(
  /{#each session\.pipes\[activeSegmentPipeIndex \|\| 0\]\?\.segments[\s\S]*?\{\/each\}/,
  match => match + '\n          {/if}'
);

fs.writeFileSync('D:/work/horizonsMachine/VisionMachine/src/components/ComposerPanel.svelte', c);
console.log('Fixed ComposerPanel template safety');
