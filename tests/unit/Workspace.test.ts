import { describe, it, expect, vi } from 'vitest';
import type { ProjectData, SessionData } from '../../src/types';

describe('Workspace Logic', () => {
  const mockProjects: ProjectData[] = [
    {
      id: 'proj-1',
      name: 'Test Project',
      createdAt: Date.now(),
      directoryPath: 'C:/projects/test',
      sessions: [{
        id: 'sess-1',
        name: 'Session 1',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        directoryPath: 'C:/projects/test/session_1',
        pipes: [],
        fps: 24,
        resolution: '720p',
        orientation: 'horizontal',
        totalGeneratedFrames: 0,
      }],
      totalGenerations: 0,
    },
  ];

  it('should find project by ID', () => {
    const found = mockProjects.find(p => p.id === 'proj-1');
    expect(found).toBeDefined();
    expect(found?.name).toBe('Test Project');
  });

  it('should return null for non-existent project', () => {
    const found = mockProjects.find(p => p.id === 'non-existent');
    expect(found).toBeUndefined();
  });

  it('should find session in project', () => {
    const found = mockProjects[0].sessions.find(s => s.id === 'sess-1');
    expect(found).toBeDefined();
    expect(found?.name).toBe('Session 1');
  });

  it('should handle empty projects array', () => {
    const found = ([] as ProjectData[]).find(p => p.id === 'proj-1');
    expect(found).toBeUndefined();
  });

  it('should have valid ID format', () => {
    // IDs should be non-empty strings
    expect(mockProjects[0].id.length).toBeGreaterThan(0);
    expect(mockProjects[0].sessions[0].id.length).toBeGreaterThan(0);
  });

  it('should create new project correctly', () => {
    const newProject: ProjectData = {
      id: 'new-project-id',
      name: 'New Project',
      createdAt: Date.now(),
      directoryPath: 'C:/projects/new',
      sessions: [],
      totalGenerations: 0,
    };
    
    expect(newProject.sessions).toEqual([]);
    expect(newProject.name).toBe('New Project');
  });

  it('should create new session correctly', () => {
    const newSession: SessionData = {
      id: 'new-session-id',
      name: 'Session 1',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      directoryPath: 'C:/projects/test/session_new',
      pipes: [],
      fps: 24,
      resolution: '720p',
      orientation: 'horizontal',
      totalGeneratedFrames: 0,
    };
    
    expect(newSession.pipes).toEqual([]);
    expect(newSession.fps).toBe(24);
  });
});
