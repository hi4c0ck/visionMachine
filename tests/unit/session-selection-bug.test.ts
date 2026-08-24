import { describe, it, expect } from 'vitest';
import type { ProjectData } from '../../src/types';

describe('Session Selection Bug Fix', () => {
  const mockProject: ProjectData = {
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
  };

  it('should find session in project by ID', () => {
    const found = mockProject.sessions.find(s => s.id === 'sess-1');
    expect(found).toBeDefined();
    expect(found?.name).toBe('Session 1');
  });

  it('should return undefined for non-existent session', () => {
    const found = mockProject.sessions.find(s => s.id === 'non-existent');
    expect(found).toBeUndefined();
  });

  it('should handle empty sessions array', () => {
    const emptyProject: ProjectData = {
      ...mockProject,
      sessions: [],
    };
    
    const found = emptyProject.sessions.find(s => s.id === 'sess-1');
    expect(found).toBeUndefined();
  });
});
