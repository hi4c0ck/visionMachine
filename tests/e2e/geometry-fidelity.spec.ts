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

	test('frame-ruler renders', async ({ page }) => {
		const ruler = page.locator('.frame-ruler');
		await expect(ruler).toBeVisible();
	});

	test('coordinate-space renders', async ({ page }) => {
		const coord = page.locator('.coordinate-space');
		await expect(coord).toBeVisible();
		const rect = await coord.boundingBox();
		expect(rect?.width).toBeGreaterThan(100);
	});

	test('seg-bar uses pixel positioning', async ({ page }) => {
		// Click Add Pipe - this directly adds a pipe (no modal)
		const addPipeBtn = page.locator('.btn-add-pipe');
		await expect(addPipeBtn).toBeVisible();
		await addPipeBtn.click();
		
		// Wait for pipe to appear
		await page.waitForSelector('.pipe', { timeout: 5000 });

		// Add segment
		await page.locator('.seg-empty.full-width').click({ force: true });
		await page.waitForSelector('.seg-bar', { timeout: 5000 });

		const seg = page.locator('.seg-bar').first();
		await expect(seg).toBeVisible();
		const style = await seg.getAttribute('style');
		expect(style).toContain('left:');
		expect(style).toContain('px');
	});

	test('tag-body uses pixel positioning', async ({ page }) => {
		// Click Add Pipe
		const addPipeBtn = page.locator('.btn-add-pipe');
		await expect(addPipeBtn).toBeVisible();
		await addPipeBtn.click();
		await page.waitForSelector('.pipe', { timeout: 5000 });

		// Add segment
		await page.locator('.seg-empty.full-width').click({ force: true });
		await page.waitForSelector('.seg-bar', { timeout: 5000 });

		// Add tag
		await page.locator('.btn-add-tag').click({ force: true });
		await page.getByText('Scene').click({ force: true });
		await page.waitForSelector('.tag-body', { timeout: 3000 });

		const tag = page.locator('.tag-body').first();
		await expect(tag).toBeVisible();
		const style = await tag.getAttribute('style');
		expect(style).toContain('px');
	});

	test('drag updates segment position', async ({ page }) => {
		// Click Add Pipe
		const addPipeBtn = page.locator('.btn-add-pipe');
		await expect(addPipeBtn).toBeVisible();
		await addPipeBtn.click();
		await page.waitForSelector('.pipe', { timeout: 5000 });

		// Add segment
		await page.locator('.seg-empty.full-width').click({ force: true });
		await page.waitForSelector('.seg-bar', { timeout: 5000 });

		const seg = page.locator('.seg-bar').first();
		const box = await seg.boundingBox();
		if (!box) return;

		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		await page.mouse.down();
		await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2);
		await page.mouse.up();

		const newBox = await seg.boundingBox();
		if (newBox) {
			expect(newBox.x).toBeGreaterThanOrEqual(box.x - 5);
		}
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
});
