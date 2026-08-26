#!/usr/bin/env python3
"""Fix Workspace.svelte - proper T2 migration integration"""

filepath = 'src/components/Workspace.svelte'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# The current broken line from previous PowerShell attempt
broken_line = 'let parsed: ProjectData[] = JSON.parse(saved);`r`n\t\t\t\t// Migrate old globalPrompt -> globalNodes format for each pipe in each session`r`n\t\t\t\tparsed = parsed.map(project => ({`r`n\t\t\t\t\t...project,`r`n\t\t\t\t\tsessions: project.sessions.map(session => ({`r`n\t\t\t\t\t\t...session,`r`n\t\t\t\t\t\tpipes: (session.pipes || []).map(p => migratePipeToTwoLayer(p))`r`n\t\t\t\t\t}))`r`n\t\t\t\t}));`r`n\t\t\t\tprojects = parsed;'

# Replace with properly formatted code
fixed_code = '''let parsed: ProjectData[] = JSON.parse(saved);
				// Migrate old globalPrompt -> globalNodes format for each pipe in each session
				parsed = parsed.map(project => ({
					...project,
					sessions: project.sessions.map(session => ({
						...session,
						pipes: (session.pipes || []).map(p => migratePipeToTwoLayer(p))
					}))
				}));
				projects = parsed;'''

if broken_line in content:
    content = content.replace(broken_line, fixed_code)
    print("[OK] Fixed Workspace.svelte line formatting")
else:
    # Check if already correct
    if "migratePipeToTwoLayer" in content and "parsed.map(project" in content:
        print("[OK] Workspace.svelte already has migration code")
    else:
        print("[WARN] Could not find expected pattern in Workspace.svelte")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("[OK] Saved Workspace.svelte")
