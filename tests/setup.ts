import { afterEach, beforeEach } from 'vitest';
import { cleanup, configure } from '@testing-library/svelte';

// Auto-cleanup after each test
afterEach(() => {
  cleanup();
});

// Configure testing library
configure({
  testIdAttribute: 'data-testid',
});
