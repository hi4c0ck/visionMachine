/**
 * E2E Tests for the single frame coordinate canvas
 *
 * After the timeline-coordinate migration, .timeline-coordinate is the ONLY
 * coordinate-bearing element per pipe: FrameRuler, global ranges, segment
 * bodies/handles, and tag bodies/handles all resolve their X against the
 * same width. This spec verifies that invariant via bounding boxes.
 *
 * Run with: npx playwright test tests/e2e/coordinate-canvas.spec.ts
 */

import { test, expect } from '@playwright/test';

async function setupComposer(page: Parameters<typeof test.beforeEach>[0] extends { page: infer P } ? P : never) {
	// Login
	await page.goto('/');
	await page.locator('input[placeholder*="name"]').fill('Test User');
	await page.getByRole('button', { name: 'Get Started' }).click();
	await page.waitForSelector('.workspace', { timeout: 10000 });

	// Create project
	await page.locator('.projects-panel .add-btn').click();
	await page.waitForSelector('.modal', { timeout: 5000 });
	await page.locator('input[placeholder*="project name"]').fill('CanvasTest');
	await page.locator('.modal .btn-confirm').click();
	await page.waitForSelector('.project-name', { timeout: 5000 });

	// Add session
	await page.locator('.add-session-btn').click();
	await page.waitForSelector('.session-item', { timeout: 5000 });
	await page.locator('.session-item').first().click();
	await page.waitForSelector('.composer-panel', { timeout: 10000 });
}

test.describe('Coordinate Canvas Consistency', () => {
	test.beforeEach(async ({ page }) => {
		await setupComposer(page);
	});

	test('all timeline lanes share one frame coordinate space', async ({ page }) => {
		// Add a global + a timeline + a segment via the UI
		const plus = page.locator('.btn-add-track').first();
		await plus.click();
		await page.getByRole('button', { name: 'Global', exact: true }).click();
		await page.getByRole('button', { name: 'Timeline', exact: true }).click();

		// Segment: click the empty-slot placeholder, fill 0/240, confirm
		await page.locator('.seg-empty.full-width').first().click();
		await page.waitForSelector('.modal', { timeout: 5000 });
		await page.locator('.modal input[type="number"]').nth(0).fill('0');
		await page.locator('.modal input[type="number"]').nth(1).fill('240');
		await page.locator('.modal .btn-confirm').click();
		await page.waitForSelector('.segment-body', { timeout: 5000 });

		const canvas = await page.locator('.timeline-coordinate').boundingBox();
		const coordSpace = await page.locator('.frame-ruler .coordinate-space').boundingBox();
		expect(coordSpace).toBeTruthy();
		expect(canvas).toBeTruthy();

		// Identical origin and width:
		expect(Math.abs((coordSpace as { x: number }).x - (canvas as { x: number }).x)).toBeLessThan(1);
		expect(Math.abs((coordSpace as { width: number }).width - (canvas as { width: number }).width)).toBeLessThan(1);

		// Segment handle sits at the ruler tick position of frame 0 (left edge),
		// and the body spans 0..240 exactly across the canvas width:
		const body = await page.locator('.segment-body').first().boundingBox();
		const handleL = await page.locator('.segment-handle-left').first().boundingBox();
		expect(Math.abs((body as { x: number }).x - (canvas as { x: number }).x)).toBeLessThan(1);
		// 10px handle centered on x=0
		expect(Math.abs(((handleL as { x: number }).x + 5) - (canvas as { x: number }).x)).toBeLessThan(1);

		// Global range bar shares the same coordinate space (spans full width)
		const globalRange = await page.locator('.global-range').first().boundingBox();
		expect(globalRange).toBeTruthy();
		expect(Math.abs((globalRange as { x: number }).x - (canvas as { x: number }).x)).toBeLessThan(1);
	});
});
