/**
 * Vitest setup file
 * Global mocks and utilities for unit tests
 */

import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/svelte';

// Auto-cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock crypto.randomUUID for deterministic IDs
Object.defineProperty(window, 'crypto', {
  value: {
    randomUUID: () => 'test-uuid-' + Math.random().toString(36).substr(2, 9),
  },
});

// Global test utilities
(global as any).expect = expect;
(global as any).describe = describe;
(global as any).it = it;
(global as any).beforeEach = beforeEach;
(global as any).afterEach = afterEach;
