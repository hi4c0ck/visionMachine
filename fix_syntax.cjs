const fs = require('fs');
let c = fs.readFileSync('D:/work/horizonsMachine/VisionMachine/src/components/ComposerPanel.svelte', 'utf8');

// Fix all the broken function definitions
c = c.replace(/confirmAdd\(\.\.\.) if \(!session\?\.pipes\) return;/g, 'function confirmAdd() {\n\t\tif (!session?.pipes) return;');
c = c.replace(/deleteKeyframe\(pipeIndex: number, kfId: string\) \.\.\.) if \(!session\?\.pipes\) return;/g, 'function deleteKeyframe(pipeIndex: number, kfId: string) {\n\t\tif (!session?.pipes) return;');
c = c.replace(/updateQ\(pipeIndex: number, val: number\) \.\.\.) if \(!session\?\.pipes\) return;/g, 'function updateQ(pipeIndex: number, val: number) {\n\t\tif (!session?.pipes) return;');
c = c.replace(/updateC\(pipeIndex: number, val: number\) \.\.\.) if \(!session\?\.pipes\) return;/g, 'function updateC(pipeIndex: number, val: number) {\n\t\tif (!session?.pipes) return;');
c = c.replace(/openSegmentModal\(pipeIndex: number, segment: PromptSegment\) \.\.\.) if \(!session\?\.pipes\) return;/g, 'function openSegmentModal(pipeIndex: number, segment: PromptSegment) {\n\t\tif (!session?.pipes) return;');
c = c.replace(/confirmSegmentUpdate\(\.\.\.) if \(!session\?\.pipes\) return;/g, 'function confirmSegmentUpdate() {\n\t\tif (!session?.pipes) return;');
c = c.replace(/openTypePicker\(pipeIndex: number\) \.\.\.) if \(!session\?\.pipes\) return;/g, 'function openTypePicker(pipeIndex: number) {\n\t\tif (!session?.pipes) return;');
c = c.replace(/addSegmentWithType\(tag: TagType\) \.\.\.) if \(!session\?\.pipes\) return;/g, 'function addSegmentWithType(tag: TagType) {\n\t\tif (!session?.pipes) return;');
c = c.replace(/removeParam\(pipeIndex: number, segmentId: string\) \.\.\.) if \(!session\?\.pipes\) return;/g, 'function removeParam(pipeIndex: number, segmentId: string) {\n\t\tif (!session?.pipes) return;');
c = c.replace(/updateParam\(pipeIndex: number, segmentId: string, value: number\) \.\.\.) if \(!session\?\.pipes\) return;/g, 'function updateParam(pipeIndex: number, segmentId: string, value: number) {\n\t\tif (!session?.pipes) return;');
c = c.replace(/moveParamFrame\(pipeIndex: number, segmentId: string, delta: number\) \.\.\.) if \(!session\?\.pipes\) return;/g, 'function moveParamFrame(pipeIndex: number, segmentId: string, delta: number) {\n\t\tif (!session?.pipes) return;');
c = c.replace(/updatePipeLength\(pipeIndex: number, newLength: number\) \.\.\.) if \(!session\?\.pipes\) return;/g, 'function updatePipeLength(pipeIndex: number, newLength: number) {\n\t\tif (!session?.pipes) return;');
c = c.replace(/openGlobalPromptModal\(pipeIndex: number\) \.\.\.) if \(!session\?\.pipes) return;/g, 'function openGlobalPromptModal(pipeIndex: number) {\n\t\tif (!session?.pipes) return;');
c = c.replace(/confirmGlobalPrompt\(\.\.\.) if \(!session\?\.pipes\) return;/g, 'function confirmGlobalPrompt() {\n\t\tif (!session?.pipes) return;');
c = c.replace(/updateFPS\(fps: number\) \.\.\.) if \(!session\?\.pipes) return;/g, 'function updateFPS(fps: number) {\n\t\tif (!session?.pipes) return;');
c = c.replace(/updateResolution\(resolution: typeof session\.resolution\) \.\.\.) if \(!session\?\.pipes\) return;/g, 'function updateResolution(resolution: typeof session.resolution) {\n\t\tif (!session?.pipes) return;');

// Also remove duplicate checks (the script added them twice)
c = c.replace(/\n\t\tif \(!session\?\.pipes\) return;\n\t\tif \(!session\?\.pipes\) return;/g, '\n\t\tif (!session?.pipes) return;');

fs.writeFileSync('D:/work/horizonsMachine/VisionMachine/src/components/ComposerPanel.svelte', c);
console.log('Fixed ComposerPanel syntax errors');
