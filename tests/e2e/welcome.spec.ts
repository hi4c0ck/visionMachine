/**
 * E2E Tests for Welcome Screen
 * Run with: npm run test:e2e
 */

import { test, expect } from '@playwright/test';

test.describe('Welcome Screen', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display welcome screen with title', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Welcome to VisionMachine');
  });

  test('should have name input field', async ({ page }) => {
    const input = page.locator('input[placeholder*="name"]');
    await expect(input).toBeVisible();
  });

  test('Get Started button should be disabled when empty', async ({ page }) => {
    const button = page.locator('button:has-text("Get Started")');
    await expect(button).toBeDisabled();
  });

  test('Get Started button should enable when typing', async ({ page }) => {
    const input = page.locator('input[placeholder*="name"]');
    const button = page.locator('button:has-text("Get Started")');
    
    await input.fill('Test User');
    await expect(button).toBeEnabled();
  });

  test('should navigate to workspace after login', async ({ page }) => {
    const input = page.locator('input[placeholder*="name"]');
    const button = page.locator('button:has-text("Get Started")');
    
    await input.fill('Test User');
    await button.click();
    
    // Should see workspace elements (frame header, projects panel)
    await expect(page.locator('.frame')).toBeVisible();
    await expect(page.locator('.projects-panel')).toBeVisible();
  });

  test('should apply theme from localStorage', async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('vm-theme', 'steel-dark');
    });
    
    await page.reload();
    
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'steel-dark');
  });

  test('should handle Enter key for login', async ({ page }) => {
    const input = page.locator('input[placeholder*="name"]');
    
    await input.fill('Enter Key User');
    await input.press('Enter');
    
    // Should navigate to workspace
    await expect(page.locator('.frame')).toBeVisible();
  });
});
