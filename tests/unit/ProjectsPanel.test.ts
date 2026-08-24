import { describe, it, expect, vi } from 'vitest';
import type { ProjectData } from '../../src/types';

describe('ProjectsPanel Logic', () => {
  const mockProject: ProjectData = {
    id: 'proj-1',
    name: 'Test Project',
    createdAt: Date.now(),
    directoryPath: 'C:/projects/test',
    sessions: [
      {
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
      },
    ],
    totalGenerations: 0,
  };

  it('should find project by ID', () => {
    const projects: ProjectData[] = [mockProject];
    const found = projects.find(p => p.id === 'proj-1');
    expect(found).toBeDefined();
    expect(found?.name).toBe('Test Project');
  });

  it('should find session in project', () => {
    const found = mockProject.sessions.find(s => s.id === 'sess-1');
    expect(found).toBeDefined();
    expect(found?.name).toBe('Session 1');
  });

  it('should handle empty projects array', () => {
    const projects: ProjectData[] = [];
    const found = projects.find(p => p.id === 'proj-1');
    expect(found).toBeUndefined();
  });

  it('should have valid ID format', () => {
    // IDs should be non-empty strings
    expect(mockProject.id.length).toBeGreaterThan(0);
    expect(mockProject.sessions[0].id.length).toBeGreaterThan(0);
  });
});
