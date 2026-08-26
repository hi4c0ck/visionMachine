import re
with open('D:/work/horizonsMachine/VisionMachine/src/components/ComposerPanel.svelte', 'r', encoding='utf-8') as f:
    content = f.read()

# Check for the conflicting function definitions
if 'async function updateFPS(' in content:
    print('Found async function updateFPS')
if 'async function updateResolution(' in content:
    print('Found async function updateResolution')
if 'function updateFPS(' in content:
    print('Found function updateFPS')
