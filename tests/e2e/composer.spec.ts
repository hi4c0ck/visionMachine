/**
 * E2E Tests for Composer Panel
 * Run with: npm run test:e2e
 */

import { test, expect } from '@playwright/test';

async function setupComposer(page: any) {
  await page.goto('/');
  
  // Login
  await page.locator('input[placeholder*="name"]').fill('Test User');
  await page.getByRole('button', { name: 'Get Started' }).click();
  await page.waitForSelector('.workspace', { timeout: 10000 });
  
  // Create project
  await page.locator('.projects-panel .add-btn').click();
  await page.waitForSelector('.modal', { timeout: 5000 });
  await page.locator('input[placeholder*="project name"]').fill('Test Project');
  await page.locator('.modal .btn-confirm').click();
  await page.waitForSelector('.project-name', { timeout: 5000 });
  
  // Add session
  await page.locator('.add-session-btn').click();
  await page.waitForSelector('.session-item', { timeout: 5000 });
  await page.locator('.session-item').first().click();
  await page.waitForSelector('.composer-panel', { timeout: 10000 });
}

test.describe('Composer Panel', () => {
  test.beforeEach(async ({ page }) => {
    await setupComposer(page);
  });

  test('should display composer panel', async ({ page }) => {
    await expect(page.locator('.composer-panel')).toBeVisible();
  });

  test('should show add pipe button', async ({ page }) => {
    const addPipeBtn = page.locator('.btn-add-pipe');
    await expect(addPipeBtn).toBeVisible();
    await expect(addPipeBtn).toContainText(/Add Pipe/i);
  });

  test('should show segment empty placeholder when no segments', async ({ page }) => {
    const addSegmentBtn = page.locator('.seg-empty.full-width');
    await expect(addSegmentBtn).toBeVisible();
    await expect(addSegmentBtn).toContainText(/Add first segment/i);
  });

  test('should show tag add button when segment exists', async ({ page }) => {
    // Wait for any existing segments
    const segBar = page.locator('.seg-bar').first();
    const hasSegments = await segBar.count() > 0;
    
    if (hasSegments) {
      const addTagBtn = page.locator('.btn-add-tag');
      await expect(addTagBtn).toBeVisible();
    }
  });
});
