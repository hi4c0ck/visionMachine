const fs = require('fs');
let c = fs.readFileSync('D:/work/horizonsMachine/VisionMachine/src/components/ComposerPanel.svelte', 'utf8');

// The REAL issue: session itself might be undefined!
// Fix all accesses to use safe optional chaining

// Replace direct access patterns with safe versions
c = c.replace(/session\.pipes/g, 'session?.pipes');
c = c.replace(/session\.fps/g, 'session?.fps');
c = c.replace(/session\.name/g, 'session?.name');
c = c.replace(/session\.resolution/g, 'session?.resolution');

// Add guard at function level - early return if no session
const functions = [
  'function confirmAdd() {',
  'function deleteKeyframe(pipeIndex: number, kfId: string) {',
  'function updateQ(pipeIndex: number, val: number) {',
  'function updateC(pipeIndex: number, val: number) {',
  'function openSegmentModal(pipeIndex: number, segment: PromptSegment) {',
  'function confirmSegmentUpdate() {',
  'function openTypePicker(pipeIndex: number) {',
  'function addSegmentWithType(tag: TagType) {',
  'function removeParam(pipeIndex: number, segmentId: string) {',
  'function updateParam(pipeIndex: number, segmentId: string, value: number) {',
  'function moveParamFrame(pipeIndex: number, segmentId: string, delta: number) {',
  'function updatePipeLength(pipeIndex: number, newLength: number) {',
  'function openGlobalPromptModal(pipeIndex: number) {',
  'function confirmGlobalPrompt() {',
  'function updateFPS(fps: number) {',
  'function updateResolution(resolution: typeof session.resolution) {'
];

for (const func of functions) {
  const guard = `${func}\n\t\tif (!session?.pipes) return;`;
  c = c.replace(func, guard);
}

fs.writeFileSync('D:/work/horizonsMachine/VisionMachine/src/components/ComposerPanel.svelte', c);
console.log('Added comprehensive guards to ComposerPanel');
