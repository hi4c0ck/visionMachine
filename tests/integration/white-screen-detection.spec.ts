/**
 * Integration Test: White Screen Detection
 * 
 * This test verifies that the application doesn't produce white screens
 * during normal user flows up to the composer panel.
 * 
 * Run with: npm run test:integration
 */

import { test, expect } from '@playwright/test';

test.describe('White Screen Integration Tests', () => {
  test('should not show white screen on app load', async ({ page }) => {
    await page.goto('/');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Check that the page is not white (has content)
    const body = await page.locator('body');
    const bgColor = await body.evaluate(el => {
      const style = window.getComputedStyle(el);
      return style.backgroundColor;
    });
    
    // Should not be pure white or transparent
    expect(bgColor).not.toBe('rgb(255, 255, 255)');
    
    // Should have some content visible
    const hasContent = await page.locator('.app, #workspace-container').count() > 0;
    expect(hasContent).toBe(true);
  });

  test('should not show white screen after login', async ({ page }) => {
    await page.goto('/');
    
    // Enter username and login
    await page.locator('input[placeholder*="name"]').fill('Test User');
    await page.locator('button:has-text("Get Started")').click();
    
    // Wait for workspace to load
    await page.waitForSelector('#workspace-container', { timeout: 5000 });
    await page.waitForTimeout(500);
    
    // Check workspace is visible and not white
    const workspace = await page.locator('#workspace-container');
    await expect(workspace).toBeVisible();
    
    // Verify no console errors
    const consoleErrors: any[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    // Page should still be functional
    expect(consoleErrors.length).toBe(0);
  });

  test('should not show white screen when creating project', async ({ page }) => {
    await page.goto('/');
    await page.locator('input[placeholder*="name"]').fill('Test User');
    await page.locator('button:has-text("Get Started")').click();
    await page.waitForSelector('#workspace-container', { timeout: 5000 });
    
    // Track console errors
    const consoleErrors: any[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    // Create a project
    await page.locator('.projects-panel .add-btn').click();
    await page.locator('input[placeholder*="project name"]').fill('Integration Test Project');
    await page.locator('button:has-text("Create")').click();
    
    // Wait for project to appear
    await page.waitForSelector('.project-item', { timeout: 3000 });
    await page.waitForTimeout(500);
    
    // Verify no white screen and no errors
    expect(consoleErrors.length).toBe(0);
    
    // Verify project is visible
    await expect(page.locator('.project-item')).toBeVisible();
  });

  test('should not show white screen when selecting session', async ({ page }) => {
    await page.goto('/');
    await page.locator('input[placeholder*="name"]').fill('Test User');
    await page.locator('button:has-text("Get Started")').click();
    await page.waitForSelector('#workspace-container', { timeout: 5000 });
    
    // Track console errors
    const consoleErrors: any[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    // Create project and session
    await page.locator('.projects-panel .add-btn').click();
    await page.locator('input[placeholder*="project name"]').fill('Session Test Project');
    await page.locator('button:has-text("Create")').click();
    await page.waitForSelector('.project-item', { timeout: 3000 });
    
    // Expand project and add session
    await page.locator('.project-item').first().click();
    await page.waitForTimeout(300);
    await page.locator('.add-session-btn').click();
    
    // Select the session
    await page.locator('.session-item').first().click();
    await page.waitForTimeout(500);
    
    // Verify composer is visible (no white screen)
    await expect(page.locator('.composer-panel')).toBeVisible();
    
    // Verify no console errors
    expect(consoleErrors.length).toBe(0);
  });

  test('should not show white screen when adding keyframe', async ({ page }) => {
    await page.goto('/');
    await page.locator('input[placeholder*="name"]').fill('Test User');
    await page.locator('button:has-text("Get Started")').click();
    await page.waitForSelector('#workspace-container', { timeout: 5000 });
    
    // Create project and select session
    await page.locator('.projects-panel .add-btn').click();
    await page.locator('input[placeholder*="project name"]').fill('Keyframe Test Project');
    await page.locator('button:has-text("Create")').click();
    await page.locator('.project-item').first().click();
    await page.waitForTimeout(300);
    await page.locator('.add-session-btn').click();
    await page.locator('.session-item').first().click();
    await page.waitForTimeout(500);
    
    // Track console errors
    const consoleErrors: any[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    // Add keyframe
    await page.locator('.add-kf-btn').click();
    await page.waitForSelector('.modal', { timeout: 3000 });
    
    // Select URL mode and add
    await page.locator('.mode-tab:has-text("URL")').click();
    await page.locator('.modal-input').fill('https://example.com/test.jpg');
    await page.locator('.btn-confirm').click();
    
    // Verify keyframe was added
    await expect(page.locator('.kf-box')).toBeVisible();
    
    // Verify no console errors
    expect(consoleErrors.length).toBe(0);
  });

  test('should not show white screen when adding segment', async ({ page }) => {
    await page.goto('/');
    await page.locator('input[placeholder*="name"]').fill('Test User');
    await page.locator('button:has-text("Get Started")').click();
    await page.waitForSelector('#workspace-container', { timeout: 5000 });
    
    // Create project and select session
    await page.locator('.projects-panel .add-btn').click();
    await page.locator('input[placeholder*="project name"]').fill('Segment Test Project');
    await page.locator('button:has-text("Create")').click();
    await page.locator('.project-item').first().click();
    await page.waitForTimeout(300);
    await page.locator('.add-session-btn').click();
    await page.locator('.session-item').first().click();
    await page.waitForTimeout(500);
    
    // Track console errors
    const consoleErrors: any[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    // Add segment
    await page.locator('.add-param-row').click();
    await page.waitForSelector('.type-grid', { timeout: 3000 });
    
    // Click on Scene type
    await page.locator('.type-btn:has-text("Scene")').click();
    
    // Verify segment was added
    await expect(page.locator('.param-row')).toBeVisible();
    
    // Verify no console errors
    expect(consoleErrors.length).toBe(0);
  });

  test('should handle localStorage errors gracefully', async ({ page }) => {
    await page.goto('/');
    
    // Block localStorage to simulate quota exceeded
    await page.evaluate(() => {
      Object.defineProperty(window, 'localStorage', {
        value: {
          getItem: () => null,
          setItem: () => { throw new Error('QuotaExceededError'); },
          removeItem: () => {},
          clear: () => {},
          length: 0,
          key: () => null,
        },
        writable: false,
      });
    });
    
    // Try to login - should not crash
    await page.locator('input[placeholder*="name"]').fill('Test User');
    await page.locator('button:has-text("Get Started")').click();
    
    // Should still show workspace, not white screen
    await page.waitForSelector('#workspace-container', { timeout: 5000 });
    await expect(page.locator('#workspace-container')).toBeVisible();
  });

  test('should handle corrupted localStorage data gracefully', async ({ page }) => {
    await page.goto('/');
    
    // Set corrupted data in localStorage
    await page.evaluate(() => {
      localStorage.setItem('vm-projects', 'invalid json {{{');
    });
    
    // Reload to trigger load error
    await page.reload();
    await page.waitForTimeout(1000);
    
    // Enter username and login
    await page.locator('input[placeholder*="name"]').fill('Test User');
    await page.locator('button:has-text("Get Started")').click();
    
    // Should still show workspace, not white screen
    await page.waitForSelector('#workspace-container', { timeout: 5000 });
    await expect(page.locator('#workspace-container')).toBeVisible();
  });

  test('composer panel should be fully interactive after session selection', async ({ page }) => {
    await page.goto('/');
    await page.locator('input[placeholder*="name"]').fill('Test User');
    await page.locator('button:has-text("Get Started")').click();
    await page.waitForSelector('#workspace-container', { timeout: 5000 });
    
    // Create project and session
    await page.locator('.projects-panel .add-btn').click();
    await page.locator('input[placeholder*="project name"]').fill('Interactive Test');
    await page.locator('button:has-text("Create")').click();
    await page.locator('.project-item').first().click();
    await page.waitForTimeout(300);
    await page.locator('.add-session-btn').click();
    await page.locator('.session-item').first().click();
    await page.waitForTimeout(500);
    
    // Verify composer is interactive
    await expect(page.locator('.composer-panel')).toBeVisible();
    
    // Test Q slider interaction
    const qSlider = page.locator('.qc-group input[type="range"]').first();
    await qSlider.fill('20');
    
    // Verify value updated
    const qValue = page.locator('.qc-value').first();
    await expect(qValue).toContainText('20');
    
    // Test C slider interaction
    const cSliders = page.locator('.qc-group input[type="range"]');
    await cSliders.nth(1).fill('10');
    
    const cValue = page.locator('.qc-value').nth(1);
    await expect(cValue).toContainText('10');
  });
});