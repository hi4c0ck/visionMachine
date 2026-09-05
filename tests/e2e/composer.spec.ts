/**
 * E2E Tests for Composer Panel
 * Run with: npm run test:e2e
 */

import { test, expect } from '@playwright/test';

test.describe('Composer Panel', () => {
  const setupSession = async (page: any) => {
    // Create project
    await page.locator('.projects-panel .add-btn').click();
    await page.locator('input[placeholder*="project name"]').fill('Test Project');
    await page.locator('button:has-text("Create")').click();
    
    // Create session
    await page.locator('.sessions-panel .add-session-btn').click();
    await page.locator('.session-item').first().click();
    
    // Wait for composer to load
    await page.waitForSelector('.composer-panel', { timeout: 5000 });
  };

  test.beforeEach(async ({ page }) => {
    await setupSession(page);
  });

  test('should display composer panel', async ({ page }) => {
    await expect(page.locator('.composer-panel')).toBeVisible();
  });

  test('should show timeline view', async ({ page }) => {
    const timelineBtn = page.getByRole('button', { name: 'Timeline' });
    await timelineBtn.click();
    
    const timelineTrack = page.locator('.timeline-track');
    await expect(timelineTrack).toBeVisible();
  });

  test('should add a pipe', async ({ page }) => {
    const initialPipeCount = page.locator('.pipe').count();
    
    const addPipeBtn = page.getByRole('button', { name: /Add Pipe/i });
    await addPipeBtn.click();
    
    const newPipeCount = page.locator('.pipe').count();
    await expect(newPipeCount).toBeGreaterThan(initialPipeCount);
  });

  test('should add first segment to pipe', async ({ page }) => {
    const addSegmentBtn = page.locator('.seg-empty.full-width');
    await expect(addSegmentBtn).toBeVisible();
    
    await addSegmentBtn.click();
    
    // Check segment was added
    const segBar = page.locator('.seg-bar');
    await expect(segBar).toBeVisible();
  });

  test('should add tag to segment', async ({ page }) => {
    // Add first segment
    const addSegmentBtn = page.locator('.seg-empty.full-width');
    await addSegmentBtn.click();
    
    // Open tag menu via the + Tag button
    const addTagBtn = page.locator('.btn-add-tag');
    await expect(addTagBtn).toBeVisible();
    
    await addTagBtn.click();
    
    // Select scene tag type
    await page.locator('.tag-item:has-text("Scene")').click();
    
    // Click confirm
    await page.locator('.btn-confirm:has-text("Add")').click();
    
    // Tag should be visible
    const tagRow = page.locator('.tag-row');
    await expect(tagRow).toBeVisible();
  });

  test('should show segment in timeline', async ({ page }) => {
    const timelineBtn = page.getByRole('button', { name: 'Timeline' });
    await timelineBtn.click();
    
    // Add segment
    const addSegmentBtn = page.locator('.seg-empty.full-width');
    await addSegmentBtn.click();
    
    // Segment should appear in timeline
    const segBar = page.locator('.seg-bar');
    await expect(segBar).toBeVisible();
  });
});
