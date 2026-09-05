/**
 * E2E Tests for Workspace
 * Run with: npm run test:e2e
 */

import { test, expect } from '@playwright/test';

test.describe('Workspace Layout', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/');
    await page.locator('input[placeholder*="name"]').fill('Test User');
    await page.locator('button:has-text("Get Started")').click();
  });

  test('should display 5-container layout', async ({ page }) => {
    // Frame header
    await expect(page.locator('.frame')).toBeVisible();
    
    // Left panel (Projects)
    await expect(page.locator('.projects-panel')).toBeVisible();
    
    // Center (Composer area)
    await expect(page.locator('.composer-area')).toBeVisible();
    
    // Right panel (Tools) - should be visible in landscape mode with session
  });

  test('should show empty composer state initially', async ({ page }) => {
    await expect(page.locator('.composer-empty')).toBeVisible();
    await expect(page.locator('.composer-empty h2')).toContainText('Select a Session');
  });

  test('should create project from sidebar', async ({ page }) => {
    // Click the "+" button to open create project modal
    await page.locator('.projects-panel .add-btn').click();
    
    // Wait for modal
    await page.waitForSelector('.modal', { timeout: 5000 });
    
    // Fill project name in modal
    await page.locator('input[placeholder*="project name"]').fill('My Project');
    
    // Click confirm button in modal (not the one that opens it)
    await page.locator('.modal .btn-confirm').click();
    
    // Should appear in list
    await expect(page.locator('.project-name')).toContainText('My Project');
  });

  test('should add session to project', async ({ page }) => {
    // Create project first
    await page.locator('.projects-panel .add-btn').click();
    await page.waitForSelector('.modal', { timeout: 5000 });
    await page.locator('input[placeholder*="project name"]').fill('Test Project');
    await page.locator('.modal .btn-confirm').click();
    
    // Add session
    await page.locator('.add-session-btn').click();
    
    // Should show session in list
    await expect(page.locator('.session-item')).toBeVisible();
  });

  test('should unlock composer when session selected', async ({ page }) => {
    // Create project and session
    await page.locator('.projects-panel .add-btn').click();
    await page.waitForSelector('.modal', { timeout: 5000 });
    await page.locator('input[placeholder*="project name"]').fill('Project');
    await page.locator('.modal .btn-confirm').click();
    
    await page.locator('.add-session-btn').click();
    
    // Select session - should now use correct event handler
    await page.locator('.session-item').first().click();
    
    // Composer should unlock
    await expect(page.locator('.composer-panel')).toBeVisible();
    await expect(page.locator('.pipe')).toBeVisible();
  });

  test('should show tools panel when landscape layout and session selected', async ({ page }) => {
    // Create project and session
    await page.locator('.projects-panel .add-btn').click();
    await page.waitForSelector('.modal', { timeout: 5000 });
    await page.locator('input[placeholder*="project name"]').fill('Project');
    await page.locator('.modal .btn-confirm').click();
    await page.locator('.add-session-btn').click();
    await page.locator('.session-item').first().click();
    
    // Tools should be visible in landscape mode
    await expect(page.locator('.tools-panel')).toBeVisible();
  });

  test('should persist data across page reloads', async ({ page }) => {
    // Create project
    await page.locator('.projects-panel .add-btn').click();
    await page.waitForSelector('.modal', { timeout: 5000 });
    await page.locator('input[placeholder*="project name"]').fill('Persistent Project');
    await page.locator('.modal .btn-confirm').click();
    
    // Reload page
    await page.reload();
    
    // Project should still exist
    await expect(page.locator('.project-name')).toContainText('Persistent Project');
  });
});
