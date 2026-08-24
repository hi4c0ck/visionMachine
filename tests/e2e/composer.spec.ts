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
    
    // Add session
    await page.locator('.add-session-btn').click();
    
    // Select session
    await page.locator('.session-item').first().click();
  };

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('input[placeholder*="name"]').fill('Test User');
    await page.locator('button:has-text("Get Started")').click();
    await setupSession(page);
  });

  test('should display pipe with controls', async ({ page }) => {
    await expect(page.locator('.pipe-row')).toBeVisible();
    await expect(page.locator('.pipe-label')).toContainText('Pipe 1');
  });

  test('should add keyframe', async ({ page }) => {
    const addKfBtn = page.locator('.add-kf-btn');
    await expect(addKfBtn).toBeVisible();
    
    await addKfBtn.click();
    
    // Modal should appear
    await expect(page.locator('.modal')).toBeVisible();
  });

  test('should add up to 3 keyframes', async ({ page }) => {
    // Add first keyframe
    await page.locator('.add-kf-btn').click();
    await page.locator('.mode-tab:has-text("URL")').click();
    await page.locator('.modal-input').fill('https://example.com/image1.jpg');
    await page.locator('.btn-confirm').click();
    
    // Should have one keyframe
    await expect(page.locator('.kf-box')).toHaveCount(1);
    
    // Add second
    await page.locator('.add-kf-btn').click();
    await page.locator('.modal-input').fill('https://example.com/image2.jpg');
    await page.locator('.btn-confirm').click();
    
    await expect(page.locator('.kf-box')).toHaveCount(2);
    
    // Add third
    await page.locator('.add-kf-btn').click();
    await page.locator('.modal-input').fill('https://example.com/image3.jpg');
    await page.locator('.btn-confirm').click();
    
    await expect(page.locator('.kf-box')).toHaveCount(3);
    
    // Add button should disappear
    await expect(page.locator('.add-kf-btn')).not.toBeVisible();
  });

  test('should adjust Q slider', async ({ page }) => {
    const qSlider = page.locator('.qc-group input[type="range"]').first();
    await qSlider.fill('25');
    
    // Value should update
    const qValue = page.locator('.qc-value').first();
    await expect(qValue).toContainText('25');
  });

  test('should adjust C slider', async ({ page }) => {
    const cSliders = page.locator('.qc-group input[type="range"]');
    await cSliders.nth(1).fill('10');
    
    const cValue = page.locator('.qc-value').nth(1);
    await expect(cValue).toContainText('10');
  });

  test('should add segment via type picker', async ({ page }) => {
    const addSegmentBtn = page.locator('.add-param-row');
    await addSegmentBtn.click();
    
    // Type picker modal should appear
    await expect(page.locator('.type-grid')).toBeVisible();
    await expect(page.locator('.type-btn:has-text("Scene")')).toBeVisible();
    await expect(page.locator('.type-btn:has-text("Camera")')).toBeVisible();
  });

  test('should select segment type', async ({ page }) => {
    await page.locator('.add-param-row').click();
    
    // Click on Scene type
    await page.locator('.type-btn:has-text("Scene")').click();
    
    // Segment should be added
    await expect(page.locator('.param-row')).toBeVisible();
  });

  test('should edit segment by clicking', async ({ page }) => {
    // Add a segment first
    await page.locator('.add-param-row').click();
    await page.locator('.type-btn:has-text("Camera")').click();
    
    // Click on segment to edit
    await page.locator('.param-row').first().click();
    
    // Edit modal should appear
    await expect(page.locator('.segment-info')).toBeVisible();
  });

  test('should validate frame length is 8n+1', async ({ page }) => {
    const lengthInput = page.locator('.length-input');
    await lengthInput.fill('100');
    await lengthInput.blur();
    
    // Should snap to valid value (97 or 105)
    const newValue = await lengthInput.inputValue();
    const frames = parseInt(newValue);
    expect((frames - 1) % 8).toBe(0);
  });
});
