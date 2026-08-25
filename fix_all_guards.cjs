const fs = require('fs');
let c = fs.readFileSync('D:/work/horizonsMachine/VisionMachine/src/components/ComposerPanel.svelte', 'utf8');

// Fix ALL unsafe session.pipes accesses by wrapping them in guards

// Strategy: Find each function and add guard at the beginning
const functions = [
  { name: 'confirmAdd', pattern: /function confirmAdd\(\) \{/ },
  { name: 'deleteKeyframe', pattern: /function deleteKeyframe\(pipeIndex: number, kfId: string\) \{/ },
  { name: 'updateQ', pattern: /function updateQ\(pipeIndex: number, val: number\) \{/ },
  { name: 'updateC', pattern: /function updateC\(pipeIndex: number, val: number\) \{/ },
  { name: 'openSegmentModal', pattern: /function openSegmentModal\(pipeIndex: number, segment: PromptSegment\) \{/ },
  { name: 'confirmSegmentUpdate', pattern: /function confirmSegmentUpdate\(\) \{/ },
  { name: 'openTypePicker', pattern: /function openTypePicker\(pipeIndex: number\) \{/ },
  { name: 'addSegmentWithType', pattern: /function addSegmentWithType\(tag: TagType\) \{/ },
  { name: 'removeParam', pattern: /function removeParam\(pipeIndex: number, segmentId: string\) \{/ },
  { name: 'updateParam', pattern: /function updateParam\(pipeIndex: number, segmentId: string, value: number\) \{/ },
  { name: 'moveParamFrame', pattern: /function moveParamFrame\(pipeIndex: number, segmentId: string, delta: number\) \{/ },
  { name: 'updatePipeLength', pattern: /function updatePipeLength\(pipeIndex: number, newLength: number\) \{/ },
  { name: 'openGlobalPromptModal', pattern: /function openGlobalPromptModal\(pipeIndex: number\) \{/ },
  { name: 'confirmGlobalPrompt', pattern: /function confirmGlobalPrompt\(\) \{/ },
  { name: 'updateFPS', pattern: /function updateFPS\(fps: number\) \{/ },
  { name: 'updateResolution', pattern: /function updateResolution\(resolution: typeof session\.resolution\) \{/ }
];

for (const func of functions) {
  const guard = `if (!session?.pipes) return;\n\t\t`;
  c = c.replace(func.pattern, `${func.name}(...) ${guard}`);
}

// Fix template - use safe access
c = c.replace(
  '{#each session.pipes as pipe, pipeIdx (pipe.id)}',
  '{#each session?.pipes ?? [] as pipe, pipeIdx (pipe.id)}'
);

c = c.replace(
  '{#each session.pipes[activeSegmentPipeIndex || 0]?.segments as segment (segment.id)}',
  '{#each (session?.pipes?.[activeSegmentPipeIndex || 0]?.segments) ?? [] as segment (segment.id)}'
);

fs.writeFileSync('D:/work/horizonsMachine/VisionMachine/src/components/ComposerPanel.svelte', c);
console.log('Added guards to all ComposerPanel functions');
