/**
 * E2E Tests for Geometry Fidelity
 *
 * Tests that centralized frame geometry renders consistently across
 * FrameRuler, ComposerPanel, and MultiThumbSlider.
 *
 * Run with: npx playwright test tests/e2e/geometry-fidelity.spec.ts
 */

import { test, expect } from '@playwright/test';

test.describe('Geometry Fidelity', () => {
	test.beforeEach(async ({ page }) => {
		// Login
		await page.goto('/');
		await page.locator('input[placeholder*="name"]').fill('Test User');
		await page.getByRole('button', { name: 'Get Started' }).click();
		await page.waitForSelector('.workspace', { timeout: 10000 });

		// Create project
		await page.locator('.projects-panel .add-btn').click();
		await page.waitForSelector('.modal', { timeout: 5000 });
		await page.locator('input[placeholder*="project name"]').fill('GeoTest');
		await page.locator('.modal .btn-confirm').click();
		await page.waitForSelector('.project-name', { timeout: 5000 });

		// Add session
		await page.locator('.add-session-btn').click();
		await page.waitForSelector('.session-item', { timeout: 5000 });
		await page.locator('.session-item').first().click();
		await page.waitForSelector('.composer-panel', { timeout: 10000 });
	});

	test('frame-ruler renders with coordinate-space', async ({ page }) => {
		const ruler = page.locator('.frame-ruler');
		await expect(ruler).toBeVisible();
		
		const coord = page.locator('.coordinate-space');
		await expect(coord).toBeVisible();
		const rect = await coord.boundingBox();
		expect(rect?.width).toBeGreaterThan(100);
	});

	test('geometry recomputes on resize', async ({ page }) => {
		const coord = page.locator('.coordinate-space');
		const initialRect = await coord.boundingBox();
		expect(initialRect?.width).toBeGreaterThan(100);

		await page.setViewportSize({ width: 1400, height: 900 });
		await page.waitForTimeout(500);

		const newRect = await coord.boundingBox();
		expect(newRect?.width).toBeGreaterThan(100);
	});

	test('ruler spans full coordinate-space width', async ({ page }) => {
		const coord = page.locator('.coordinate-space');
		const ruler = page.locator('.frame-ruler');
		
		const coordRect = await coord.boundingBox();
		const rulerRect = await ruler.boundingBox();
		
		expect(coordRect).toBeTruthy();
		expect(rulerRect).toBeTruthy();
		
		if (coordRect && rulerRect) {
			// Ruler should span at least 80% of coordinate-space
			const ratio = rulerRect.width / coordRect.width;
			expect(ratio).toBeGreaterThanOrEqual(0.8);
		}
	});
});
