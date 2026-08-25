#!/usr/bin/env python3
"""Debug script to trace session selection flow"""

import json
import sys

# Simulate the Workspace.svelte logic
class MockWorkspace:
    def __init__(self):
        self.projects = []
        self.selectedProjectId = None
        self.selectedSessionId = None
        
    def handle_session_select(self, session_id):
        """Simulates handleSessionSelect in Workspace.svelte"""
        found_project = None
        for p in self.projects:
            if any(s['id'] == session_id for s in p.get('sessions', [])):
                found_project = p
                break
        
        if found_project:
            self.selectedProjectId = found_project['id']
            self.selectedSessionId = session_id
            print(f"[OK] Session selected: {session_id} in project: {found_project['id']}")
            return True
        else:
            print(f"[FAIL] Session not found: {session_id}")
            return False
    
    def get_selected_session(self):
        """Simulates $derived.by(() => ...) in Workspace.svelte"""
        if not self.selectedProjectId or not self.selectedSessionId:
            return None
        
        # Find the project
        selected_project = None
        for p in self.projects:
            if p['id'] == self.selectedProjectId:
                selected_project = p
                break
        
        if not selected_project:
            return None
        
        # Find the session
        for s in selected_project.get('sessions', []):
            if s['id'] == self.selectedSessionId:
                return s
        
        return None

# Test case
ws = MockWorkspace()

# Create test data
test_project = {
    'id': 'proj-1',
    'name': 'Test Project',
    'sessions': [
        {'id': 'sess-1', 'name': 'Session 1', 'pipes': []}
    ]
}
ws.projects.append(test_project)

print("=== Testing Session Selection ===")
print(f"Projects: {json.dumps(ws.projects, indent=2)}")
print()

# Test session selection
result = ws.handle_session_select('sess-1')
print(f"Selection result: {result}")
print()

# Check derived session
selected = ws.get_selected_session()
print(f"Selected session: {selected}")
print(f"Has pipes: {selected['pipes'] if selected else 'N/A'}")
print()

if selected:
    print("[OK] SUCCESS: Session properly selected")
    sys.exit(0)
else:
    print("[FAIL] FAILURE: Session is null/undefined")
    sys.exit(1)