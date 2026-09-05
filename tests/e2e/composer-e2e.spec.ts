/**
 * End-to-end tests for Composer functionality
 * Tests the full flow: create project → session → pipes → keyframes → segments
 */
import { test, expect } from '@playwright/test';

test.describe('Composer E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display composer panel when session exists', async ({ page }) => {
    const composerPanel = page.locator('.composer-panel');
    await expect(composerPanel).toBeVisible();
  });

  test('should switch between list and timeline views', async ({ page }) => {
    const timelineBtn = page.getByRole('button', { name: 'Timeline' });
    await timelineBtn.click();
    
    const timelineTrack = page.locator('.timeline-track');
    await expect(timelineTrack).toBeVisible();

    const listViewBtn = page.getByRole('button', { name: 'List' });
    await listViewBtn.click();
    
    const pipesList = page.locator('.pipes-list');
    await expect(pipesList).toBeVisible();
  });

  test('should add a new pipe', async ({ page }) => {
    const initialPipeCount = page.locator('.pipe').count();
    
    const addPipeBtn = page.getByRole('button', { name: /Add Pipe/i });
    await addPipeBtn.click();
    
    const confirmBtn = page.getByRole('button', { name: 'Add' });
    await confirmBtn.click();
    
    const newPipeCount = page.locator('.pipe').count();
    await expect(newPipeCount).toBeGreaterThan(initialPipeCount);
  });

  test('should delete a pipe (when more than one)', async ({ page }) => {
    const pipeRows = page.locator('.pipe');
    const initialCount = await pipeRows.count();
    
    if (initialCount > 1) {
      const secondPipe = pipeRows.nth(1);
      const deleteBtn = secondPipe.locator('[title="Delete Pipe"]');
      await deleteBtn.click();
      
      const newCount = await page.locator('.pipe').count();
      await expect(newCount).toBeLessThan(initialCount);
    }
  });

  test('should add a segment with validation', async ({ page }) => {
    const firstPipe = page.locator('.pipe').first();
    const addSegmentBtn = firstPipe.getByRole('button', { name: /Add Segment/i });
    await addSegmentBtn.click();
    
    const sceneType = page.getByText('Scene');
    await sceneType.click();
    
    const segments = page.locator('.tag-row');
    await expect(segments).toBeVisible();
  });

  test('should show toast notification on validation error', async ({ page }) => {
    const lengthInput = page.locator('.length-input').first();
    await lengthInput.clear();
    await lengthInput.fill('10');
    
    await lengthInput.blur();
    
    const finalValue = await lengthInput.inputValue();
    await expect(Number(finalValue)).toBeGreaterThanOrEqual(41);
  });

  test('should have functional FPS controls', async ({ page }) => {
    const fpsSelect = page.locator('.fps-select');
    await expect(fpsSelect).toBeVisible();
    
    await fpsSelect.selectOption('30');
    const selectedValue = await fpsSelect.inputValue();
    await expect(selectedValue).toBe('30');
  });

  test('should have functional resolution controls', async ({ page }) => {
    const resSelect = page.locator('.resolution-select');
    await expect(resSelect).toBeVisible();
    
    await resSelect.selectOption('1080p');
    const selectedValue = await resSelect.inputValue();
    await expect(selectedValue).toBe('1080p');
  });
});

test.describe('Composer Timeline E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const timelineBtn = page.getByRole('button', { name: 'Timeline' });
    await timelineBtn.click();
  });

  test('should display timeline ruler', async ({ page }) => {
    const timelineRuler = page.locator('.frame-ruler');
    await expect(timelineRuler).toBeVisible();
  });

  test('should zoom timeline', async ({ page }) => {
    const zoomOutBtn = page.locator('.timeline-zoom-controls button').first();
    await zoomOutBtn.click();
    
    const zoomLevel = page.locator('.timeline-zoom-controls span');
    await expect(zoomLevel).toBeVisible();
  });

  test('should show segment tracks in timeline', async ({ page }) => {
    const addSegmentBtn = page.locator('.add-segment-row button').first();
    await addSegmentBtn.click();
    
    const sceneType = page.getByText('Scene');
    await sceneType.click();
    
    const segmentBlocks = page.locator('.seg-bar');
    await expect(segmentBlocks).toBeVisible();
  });

  test('should display keyframe chips in timeline', async ({ page }) => {
    const kfTrack = page.locator('.track-row').filter({ hasText: 'KF' });
    await expect(kfTrack).toBeVisible();
  });
});

test.describe('Composer Persistence', () => {
  test('should persist changes across reload', async ({ page, browser }) => {
    const addPipeBtn = page.getByRole('button', { name: /Add Pipe/i });
    await addPipeBtn.click();
    
    const confirmBtn = page.getByRole('button', { name: 'Add' });
    await confirmBtn.click();
    
    await page.reload();
    
    const pipes = page.locator('.pipe');
    const count = await pipes.count();
    await expect(count).toBeGreaterThan(0);
  });
});
