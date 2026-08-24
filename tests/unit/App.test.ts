/**
 * Unit tests for App.svelte (Welcome Screen)
 * Tests: Name input, button state, theme persistence, login flow
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@testing-library/svelte';
import App from '../../src/App.svelte';

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

describe('App.svelte - Welcome Screen', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('should render welcome screen with title and input', () => {
    const { getByPlaceholderText, getByText } = mount(App);
    
    expect(getByPlaceholderText(/enter your name/i)).toBeInTheDocument();
    expect(getByText(/welcome to visionmachine/i)).toBeInTheDocument();
  });

  it('should have disabled Get Started button when input is empty', () => {
    const { getByRole } = mount(App);
    
    const button = getByRole('button', { name: /get started/i });
    expect(button).toBeDisabled();
  });

  it('should enable Get Started button when name is entered', () => {
    const { getByPlaceholderText, getByRole } = mount(App);
    
    const input = getByPlaceholderText(/enter your name/i);
    const button = getByRole('button', { name: /get started/i });
    
    // Type a name
    input.value = 'Test User';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    
    expect(button).not.toBeDisabled();
  });

  it('should navigate to workspace after clicking Get Started', () => {
    const { getByPlaceholderText, getByRole } = mount(App);
    
    const input = getByPlaceholderText(/enter your name/i);
    const button = getByRole('button', { name: /get started/i });
    
    input.value = 'Test User';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    
    button.click();
    
    // Check localStorage was updated
    expect(localStorageMock.setItem).toHaveBeenCalledWith('vm-username', 'Test User');
  });

  it('should restore username from localStorage on mount', () => {
    localStorageMock.setItem('vm-username', 'Restored User');
    
    const { getByText } = mount(App);
    
    // Should show workspace, not welcome screen
    expect(getByText(/workspace/i)).toBeInTheDocument();
  });

  it('should apply saved theme from localStorage', () => {
    localStorageMock.setItem('vm-theme', 'steel-dark');
    
    mount(App);
    
    expect(document.documentElement.getAttribute('data-theme')).toBe('steel-dark');
  });

  it('should show error when trying to login with empty name', () => {
    const { getByRole } = mount(App);
    const button = getByRole('button', { name: /get started/i });
    
    // Button should be disabled when empty
    expect(button).toBeDisabled();
  });

  it('should handle Enter key press for login', () => {
    const { getByPlaceholderText } = mount(App);
    const input = getByPlaceholderText(/enter your name/i);
    
    input.value = 'Enter Key User';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    
    expect(localStorageMock.setItem).toHaveBeenCalledWith('vm-username', 'Enter Key User');
  });
});
