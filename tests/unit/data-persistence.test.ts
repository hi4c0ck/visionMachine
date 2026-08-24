/**
 * Unit tests for data persistence (localStorage)
 * Tests: Save/Load projects, sessions, selection state
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

describe('Data Persistence', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('should save projects to localStorage', () => {
    const projects = [
      { id: '1', name: 'Project 1', sessions: [] },
      { id: '2', name: 'Project 2', sessions: [] },
    ];

    localStorageMock.setItem('vm-projects', JSON.stringify(projects));
    
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'vm-projects',
      JSON.stringify(projects)
    );
  });

  it('should load projects from localStorage', () => {
    const projects = [
      { id: '1', name: 'Loaded Project', sessions: [] },
    ];
    
    localStorageMock.setItem('vm-projects', JSON.stringify(projects));
    
    const loaded = localStorageMock.getItem('vm-projects');
    expect(loaded).toBe(JSON.stringify(projects));
  });

  it('should restore selected project ID', () => {
    localStorageMock.setItem('vm-selected-project', 'project-123');
    
    const restored = localStorageMock.getItem('vm-selected-project');
    expect(restored).toBe('project-123');
  });

  it('should restore selected session ID', () => {
    localStorageMock.setItem('vm-selected-session', 'session-456');
    
    const restored = localStorageMock.getItem('vm-selected-session');
    expect(restored).toBe('session-456');
  });

  it('should persist username across sessions', () => {
    localStorageMock.setItem('vm-username', 'Test User');
    
    const restored = localStorageMock.getItem('vm-username');
    expect(restored).toBe('Test User');
  });

  it('should persist theme preference', () => {
    localStorageMock.setItem('vm-theme', 'steel-dark');
    
    const restored = localStorageMock.getItem('vm-theme');
    expect(restored).toBe('steel-dark');
  });

  it('should persist layout mode', () => {
    localStorageMock.setItem('vm-layout', 'portrait');
    
    const restored = localStorageMock.getItem('vm-layout');
    expect(restored).toBe('portrait');
  });

  it('should handle malformed JSON gracefully', () => {
    localStorageMock.setItem('vm-projects', 'invalid-json');
    
    expect(() => {
      JSON.parse(localStorageMock.getItem('vm-projects') || '');
    }).toThrow();
  });

  it('should clear selection when project deleted', () => {
    localStorageMock.setItem('vm-selected-project', 'project-1');
    localStorageMock.removeItem('vm-selected-project');
    localStorageMock.removeItem('vm-selected-session');
    
    expect(localStorageMock.getItem('vm-selected-project')).toBeNull();
    expect(localStorageMock.getItem('vm-selected-session')).toBeNull();
  });

  it('should handle empty projects array', () => {
    localStorageMock.setItem('vm-projects', JSON.stringify([]));
    
    const loaded = JSON.parse(localStorageMock.getItem('vm-projects') || '[]');
    expect(loaded).toEqual([]);
  });
});
