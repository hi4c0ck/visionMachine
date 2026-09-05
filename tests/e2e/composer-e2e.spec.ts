/**
 * End-to-end tests for Composer functionality
 * Tests the full flow: create project → session → pipes → keyframes → segments
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

test.describe('Composer E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await setupComposer(page);
  });

  test('should display composer panel when session exists', async ({ page }) => {
    const composerPanel = page.locator('.composer-panel');
    await expect(composerPanel).toBeVisible();
  });

  test('should show add pipe button', async ({ page }) => {
    const addPipeBtn = page.locator('.btn-add-pipe');
    await expect(addPipeBtn).toBeVisible();
    await expect(addPipeBtn).toContainText(/Add Pipe/i);
  });

  test('should show segment empty placeholder', async ({ page }) => {
    const emptyState = page.locator('.seg-empty.full-width');
    await expect(emptyState).toBeVisible();
    await expect(emptyState).toContainText(/Add first segment/i);
  });

  test('should have frame ruler', async ({ page }) => {
    const frameRuler = page.locator('.frame-ruler');
    await expect(frameRuler).toBeVisible();
  });
});
