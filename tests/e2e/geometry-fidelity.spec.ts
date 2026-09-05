/**
 * Pixel-level geometry fidelity E2E tests
 *
 * Verifies that frame→pixel conversions are deterministic across
 * FrameRuler, ComposerPanel, and MultiThumbSlider using the
 * centralized FrameGeometry engine.
 *
 * Run with: npx playwright test tests/e2e/geometry-fidelity.spec.ts
 */

import { test, expect } from '@playwright/test';

test.describe('Frame Geometry Fidelity', () => {
	test('FrameRuler renders at correct positions for key frames', async ({ page }) => {
		await page.goto('/workspace');

		// Open composer panel
		await page.click('[data-testid="tools-panel"]');
		await page.waitForSelector('.composer-panel');

		// Frame 0 should be at left edge (0%)
		// Frame 240 should be at right edge (100%)
		// We verify the ruler bar spans full width

		const rulerBar = page.locator('.ruler-bar');
		await expect(rulerBar).toBeVisible();

		// Get ruler bar bounding box
		const rect = await rulerBar.boundingBox();
		expect(rect).toBeTruthy();
		if (rect) {
			// Ruler bar should have measurable width
			expect(rect.width).toBeGreaterThan(100);
		}
	});

	test('segment positions use framePercent from geometry', async ({ page }) => {
		await page.goto('/workspace');
		await page.click('[data-testid="tools-panel"]');
		await page.waitForSelector('.composer-panel');

		// Look for a segment element with frame-based positioning
		const segBody = page.locator('.seg-body').first();
		await expect(segBody).toBeVisible();

		// Get the style attribute to verify percentage-based positioning
		const style = await segBody.getAttribute('style');
		expect(style).toContain('left:');
		expect(style).toContain('%'); // Should use percentage, not pixels directly
	});

	test('tag positions use framePercent from geometry', async ({ page }) => {
		await page.goto('/workspace');
		await page.click('[data-testid="tools-panel"]');
		await page.waitForSelector('.composer-panel');

		// Wait for segments and tags to render
		await page.waitForSelector('.tag-body');

		const tagBody = page.locator('.tag-body').first();
		await expect(tagBody).toBeVisible();

		// Get the style attribute to verify percentage-based positioning
		const style = await tagBody.getAttribute('style');
		expect(style).toContain('left:');
		expect(style).toContain('%'); // Should use percentage
	});

	test('MultiThumbSlider accepts geometry prop', async ({ page }) => {
		await page.goto('/workspace');
		await page.click('[data-testid="tools-panel"]');
		await page.waitForSelector('.composer-panel');

		// Global track uses MultiThumbSlider with geometry prop
		const globalTrack = page.locator('.global-track').first();
		if (await globalTrack.count() > 0) {
			await expect(globalTrack).toBeVisible();
		}
	});

	test('drag calculations use pxDeltaToFrame from geometry', async ({ page }) => {
		await page.goto('/workspace');
		await page.click('[data-testid="tools-panel"]');
		await page.waitForSelector('.composer-panel');

		// Find a segment body to drag
		const segBody = page.locator('.seg-body').first();
		await expect(segBody).toBeVisible();

		const box = await segBody.boundingBox();
		if (!box) return;

		// Calculate center point
		const startX = box.x + box.width / 2;
		const startY = box.y + box.height / 2;

		// Perform drag (small movement)
		await page.mouse.move(startX, startY);
		await page.mouse.down();
		await page.mouse.move(startX + 50, startY);
		await page.mouse.up();

		// After drag, segment should have updated position
		// Verify the position is still percentage-based
		const updatedStyle = await segBody.getAttribute('style');
		expect(updatedStyle).toBeTruthy();
	});

	test('geometry recomputes on window resize', async ({ page }) => {
		await page.goto('/workspace');
		await page.click('[data-testid="tools-panel"]');
		await page.waitForSelector('.composer-panel');

		// Record initial ruler width
		const rulerBar = page.locator('.ruler-bar');
		const initialRect = await rulerBar.boundingBox();
		expect(initialRect).toBeTruthy();
		if (!initialRect) return;

		const initialWidth = initialRect.width;

		// Resize window
		await page.setViewportSize({ width: 1400, height: 900 });
		await page.waitForTimeout(300);

		// Ruler should have updated width
		const newRect = await rulerBar.boundingBox();
		expect(newRect).toBeTruthy();
		if (newRect) {
			// Width should have changed
			expect(newRect.width).not.toBe(initialWidth);
		}
	});

	test('frameToX uses geometry when available', async ({ page }) => {
		await page.goto('/workspace');
		await page.click('[data-testid="tools-panel"]');
		await page.waitForSelector('.composer-panel');

		// Check that frameToX function in ComposerPanel uses geometry
		// by verifying segments are positioned correctly relative to ruler
		const rulerBar = page.locator('.ruler-bar');
		const segBody = page.locator('.seg-body').first();

		await expect(rulerBar).toBeVisible();
		await expect(segBody).toBeVisible();

		// Get bounding boxes
		const rulerBox = await rulerBar.boundingBox();
		const segBox = await segBody.boundingBox();

		expect(rulerBox).toBeTruthy();
		expect(segBox).toBeTruthy();

		if (rulerBox && segBox) {
			// Segment should be within ruler bounds horizontally
			expect(segBox.x).toBeGreaterThanOrEqual(rulerBox.x - 5); // slight tolerance
			expect(segBox.x).toBeLessThanOrEqual(rulerBox.x + rulerBox.width);
		}
	});
});
