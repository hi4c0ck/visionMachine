with open('D:/work/horizonsMachine/VisionMachine/src/components/Workspace.svelte', 'r', encoding='utf-8') as f:
    content = f.read()

# Insert debug overlay before the ComposerPanel conditional
old = '\t\t\t{#if selectedSession && selectedProject}'
new = '''\t\t\t<!-- DEBUG: Current state -->
\t\t\t<div style="position:fixed;top:0;left:0;background:rgba(0,0,0,0.9);color:#0f0;padding:8px;font-family:monospace;font-size:10px;z-index:9999;pointer-events:none;">
DEBUG | projects={' + '{projects.length}' + '} | projId={' + '{selectedProjectId||\'null\'}' + '} | sessionId={' + '{selectedSessionId||\'null\'}' + '} | hasProj={' + '{!!selectedProject}' + '} | hasSess={' + '{!!selectedSession}' + '}
\t\t\t</div>
\t\t\t{#if selectedSession && selectedProject}'''

if old in content:
    content = content.replace(old, new)
    with open('D:/work/horizonsMachine/VisionMachine/src/components/Workspace.svelte', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Debug overlay added")
else:
    print("Could not find target string")
    # Show what's around line 325
    lines = content.split('\n')
    for i in range(318, 335):
        print(f"{i}: {repr(lines[i])}")
