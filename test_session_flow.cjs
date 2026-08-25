// Simple test script to verify session flow
const fs = require('fs');

// Simulate Workspace logic
class Workspace {
    constructor() {
        this.projects = [];
        this.selectedProjectId = null;
        this.selectedSessionId = null;
    }

    handleSessionSelect(sessionId) {
        console.log('[Workspace] handleSessionSelect called:', sessionId);
        const foundProject = this.projects.find(p => 
            p.sessions.some(s => s.id === sessionId)
        );
        
        if (foundProject) {
            this.selectedProjectId = foundProject.id;
            this.selectedSessionId = sessionId;
            console.log('[Workspace] Session selected:', {
                project: foundProject.id,
                session: sessionId,
                sessionsCount: foundProject.sessions.length
            });
            return true;
        } else {
            console.error('[Workspace] Session NOT found:', sessionId);
            console.error('[Workspace] Available sessions:', this.projects.flatMap(p => p.sessions.map(s => s.id)));
            return false;
        }
    }

    get selectedSession() {
        if (!this.selectedProject || !this.selectedSessionId) {
            console.log('[Workspace] selectedSession = null', {
                hasProject: !!this.selectedProject,
                hasSessionId: !!this.selectedSessionId
            });
            return null;
        }
        const sess = this.selectedProject.sessions.find(s => s.id === this.selectedSessionId);
        console.log('[Workspace] selectedSession resolved:', sess ? { id: sess.id, pipes: sess.pipes?.length } : null);
        return sess || null;
    }

    get selectedProject() {
        return this.projects.find(p => p.id === this.selectedProjectId) || null;
    }
}

// Create test data
const ws = new Workspace();
ws.projects = [{
    id: 'proj-1',
    name: 'Test Project',
    sessions: [
        {
            id: 'sess-1',
            name: 'Session 1',
            pipes: [],
            fps: 24,
            resolution: '720p'
        }
    ]
}];

console.log('\n=== Test 1: Click on existing session ===');
ws.handleSessionSelect('sess-1');
console.log('selectedSession:', ws.selectedSession);
console.log('pipes:', ws.selectedSession?.pipes);

console.log('\n=== Test 2: Create empty session and select ===');
ws.projects[0].sessions.push({
    id: 'sess-2',
    name: 'Empty Session',
    pipes: [],
    fps: 24,
    resolution: '720p'
});
ws.handleSessionSelect('sess-2');
console.log('selectedSession:', ws.selectedSession);
console.log('pipes:', ws.selectedSession?.pipes);

console.log('\n=== Test 3: Non-existent session ===');
ws.handleSessionSelect('non-existent');
console.log('selectedSession:', ws.selectedSession);
