#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Fix Workspace.svelte - proper T2 migration integration"""
import re

filepath = 'src/components/Workspace.svelte'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Check if already fixed
if 'parsed.map(project => (' in content and 'migratePipeToTwoLayer(p))' in content:
    print("[OK] Migration code already present")
elif '`r`n' in content:
    # Fix the broken line from PowerShell
    content = content.replace(
        'let parsed: ProjectData[] = JSON.parse(saved);`r`n\t\t\t\t// Migrate old globalPrompt -> globalNodes format for each pipe in each session`r`n\t\t\t\tparsed = parsed.map(project => ({`r`n\t\t\t\t\t...project,`r`n\t\t\t\t\tsessions: project.sessions.map(session => ({`r`n\t\t\t\t\t\t...session,`r`n\t\t\t\t\t\tpipes: (session.pipes || []).map(p => migratePipeToTwoLayer(p))`r`n\t\t\t\t\t}))`r`n\t\t\t\t}));`r`n\t\t\t\tprojects = parsed;',
        '''let parsed: ProjectData[] = JSON.parse(saved);
				// Migrate old globalPrompt -> globalNodes format for each pipe in each session
				parsed = parsed.map(project => ({
					...project,
					sessions: project.sessions.map(session => ({
						...session,
						pipes: (session.pipes || []).map(p => migratePipeToTwoLayer(p))
					}))
				}));
				projects = parsed;'''
    )
    print("[OK] Fixed migration block")
else:
    print("[WARN] Pattern not found, skipping")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("[DONE] Workspace.svelte updated")
