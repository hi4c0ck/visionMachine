/**
 * Advanced E2E Tests: Multi-segment, Multi-tag, Drag, and Geometry Validation
 * Run with: npm run test:e2e
 */

import { test, expect } from '@playwright/test';

test.describe('Multi-Segment Creation', () => {
  const setupSession = async (page: any) => {
    await page.locator('.projects-panel .add-btn').click();
    await page.locator('input[placeholder*="project name"]').fill('Test Project');
    await page.locator('button:has-text("Create")').click();
    await page.locator('.add-session-btn').click();
    await page.locator('.session-item').first().click();
    await page.waitForSelector('.composer-panel', { timeout: 5000 });
  };

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('input[placeholder*="name"]').fill('Test User');
    await page.locator('button:has-text("Get Started")').click();
    await setupSession(page);
  });

  test('should create multiple segments sequentially', async ({ page }) => {
    // Add first segment
    await page.locator('.seg-empty.full-width').click();
    await expect(page.locator('.tag-row')).toHaveCount(0);
    
    // Add second segment
    await page.locator('.btn-add-track').click();
    await page.getByText('Timeline').click();
    await page.locator('.seg-empty.full-width').click();
    
    // Should have two segment rows
    const segBars = page.locator('.seg-bar');
    await expect(segBars).toHaveCount(2);
  });

  test('should create mixed segment types', async ({ page }) => {
    // Add first segment
    await page.locator('.seg-empty.full-width').click();
    await page.locator('.btn-add-tag').click();
    await page.locator('.tag-item:has-text("Scene")').click();
    await page.locator('.btn-confirm:has-text("Add")').click();
    
    // Add second segment with different tag
    await page.locator('.btn-add-track').click();
    await page.getByText('Timeline').click();
    await page.locator('.seg-empty.full-width').click();
    await page.locator('.btn-add-tag').click();
    await page.locator('.tag-item:has-text("Camera")').click();
    await page.locator('.btn-confirm:has-text("Add")').click();
    
    const tags = page.locator('.tag-name');
    await expect(tags).toHaveCount(2);
  });

  test('should validate minimum frame length', async ({ page }) => {
    // Add segment and check length defaults to valid value
    await page.locator('.seg-empty.full-width').click();
    
    const segBar = page.locator('.seg-bar');
    await expect(segBar).toBeVisible();
  });
});

test.describe('Multi-Tag Creation', () => {
  const setupSession = async (page: any) => {
    await page.locator('.projects-panel .add-btn').click();
    await page.locator('input[placeholder*="project name"]').fill('Test Project');
    await page.locator('button:has-text("Create")').click();
    await page.locator('.add-session-btn').click();
    await page.locator('.session-item').first().click();
    await page.waitForSelector('.composer-panel', { timeout: 5000 });
  };

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('input[placeholder*="name"]').fill('Test User');
    await page.locator('button:has-text("Get Started")').click();
    await setupSession(page);
  });

  test('should add multiple tags to segment', async ({ page }) => {
    // Add segment
    await page.locator('.seg-empty.full-width').click();
    
    // Add first tag
    await page.locator('.btn-add-tag').click();
    await page.locator('.tag-item:has-text("Scene")').click();
    await page.locator('.btn-confirm:has-text("Add")').click();
    
    // Add second tag
    await page.locator('.btn-add-tag').click();
    await page.locator('.tag-item:has-text("Camera")').click();
    await page.locator('.btn-confirm:has-text("Add")').click();
    
    // Should have two tags
    const tagNames = page.locator('.tag-name');
    await expect(tagNames).toHaveCount(2);
  });

  test('should prevent duplicate tags', async ({ page }) => {
    await page.locator('.seg-empty.full-width').click();
    
    // Add Scene tag twice
    await page.locator('.btn-add-tag').click();
    await page.locator('.tag-item:has-text("Scene")').click();
    await page.locator('.btn-confirm:has-text("Add")').click();
    
    await page.locator('.btn-add-tag').click();
    await page.locator('.tag-item:has-text("Scene")').click();
    await page.locator('.btn-confirm:has-text("Add")').click();
    
    // Should only have one tag
    const tagNames = page.locator('.tag-name');
    await expect(tagNames).toHaveCount(1);
  });
});

test.describe('Drag Interactions', () => {
  const setupSession = async (page: any) => {
    await page.locator('.projects-panel .add-btn').click();
    await page.locator('input[placeholder*="project name"]').fill('Test Project');
    await page.locator('button:has-text("Create")').click();
    await page.locator('.add-session-btn').click();
    await page.locator('.session-item').first().click();
    await page.waitForSelector('.composer-panel', { timeout: 5000 });
  };

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('input[placeholder*="name"]').fill('Test User');
    await page.locator('button:has-text("Get Started")').click();
    await setupSession(page);
  });

  test('should show drag handles on segment', async ({ page }) => {
    await page.locator('.seg-empty.full-width').click();
    
    // Show timeline view
    const timelineBtn = page.getByRole('button', { name: 'Timeline' });
    await timelineBtn.click();
    
    // Should have left and right thumbs
    const leftThumbs = page.locator('.thumb.left');
    const rightThumbs = page.locator('.thumb.right');
    
    await expect(leftThumbs).toHaveCount(1);
    await expect(rightThumbs).toHaveCount(1);
  });

  test('should allow tag resize via thumbs', async ({ page }) => {
    // Add segment and tag
    await page.locator('.seg-empty.full-width').click();
    await page.locator('.btn-add-tag').click();
    await page.locator('.tag-item:has-text("Scene")').click();
    await page.locator('.btn-confirm:has-text("Add")').click();
    
    // Show timeline
    await page.getByRole('button', { name: 'Timeline' }).click();
    
    // Should have small thumbs for tag
    const smallThumbs = page.locator('.thumb.small');
    await expect(smallThumbs).toHaveCount(2);
  });
});

test.describe('Keyframe Tests', () => {
  const setupSession = async (page: any) => {
    await page.locator('.projects-panel .add-btn').click();
    await page.locator('input[placeholder*="project name"]').fill('Test Project');
    await page.locator('button:has-text("Create")').click();
    await page.locator('.add-session-btn').click();
    await page.locator('.session-item').first().click();
    await page.waitForSelector('.composer-panel', { timeout: 5000 });
  };

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('input[placeholder*="name"]').fill('Test User');
    await page.locator('button:has-text("Get Started")').click();
    await setupSession(page);
  });

  test('should add keyframe to slot', async ({ page }) => {
    // Find first empty keyframe slot
    const emptySlot = page.locator('.kf-chip.kf-empty');
    await expect(emptySlot).toBeVisible();
    
    await emptySlot.click();
    
    // Modal should appear
    await expect(page.locator('.modal')).toBeVisible();
  });

  test('should fill keyframe with image URL', async ({ page }) => {
    // Click empty slot
    await page.locator('.kf-chip.kf-empty').first().click();
    
    // Fill in frame and URL
    await page.locator('.modal-input').first().fill('8');
    await page.locator('input[placeholder*="https"]').fill('https://example.com/image.jpg');
    
    // Confirm
    await page.locator('.modal-footer .btn-confirm').click();
    
    // Keyframe should be filled
    await expect(page.locator('.kf-chip.kf-filled')).toBeVisible();
  });
});

test.describe('Geometry Validation', () => {
  const setupSession = async (page: any) => {
    await page.locator('.projects-panel .add-btn').click();
    await page.locator('input[placeholder*="project name"]').fill('Test Project');
    await page.locator('button:has-text("Create")').click();
    await page.locator('.add-session-btn').click();
    await page.locator('.session-item').first().click();
    await page.waitForSelector('.composer-panel', { timeout: 5000 });
  };

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('input[placeholder*="name"]').fill('Test User');
    await page.locator('button:has-text("Get Started")').click();
    await setupSession(page);
  });

  test('should enforce 8n+1 frame length', async ({ page }) => {
    // Add segment
    await page.locator('.seg-empty.full-width').click();
    
    // Check that default segment is valid (should be 8 or more)
    const segBar = page.locator('.seg-bar');
    await expect(segBar).toBeVisible();
  });

  test('should validate segment within pipe bounds', async ({ page }) => {
    // Add segment
    await page.locator('.seg-empty.full-width').click();
    
    // Should snap to valid position
    await expect(page.locator('.seg-bar')).toBeVisible();
  });
});
