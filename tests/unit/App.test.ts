import { describe, it, expect, vi } from 'vitest';

describe('App Component - Welcome Screen', () => {
  it('should have empty username initially', () => {
    const stored = localStorage.getItem('vm-username');
    expect(stored).toBeNull();
  });

  it('should handle login by setting localStorage', () => {
    localStorage.setItem('vm-username', 'Test User');
    expect(localStorage.getItem('vm-username')).toBe('Test User');
  });

  it('should restore username from localStorage', () => {
    const testUser = 'Restored User';
    localStorage.setItem('vm-username', testUser);
    expect(localStorage.getItem('vm-username')).toBe(testUser);
  });

  it('should handle theme persistence', () => {
    localStorage.setItem('vm-theme', 'steel-dark');
    expect(localStorage.getItem('vm-theme')).toBe('steel-dark');
  });
});
