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

async function setupComposer(page: any) {
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
		// Menu items render as "◈ Global" / "▬ Timeline" (icon glyph is part of
		// the accessible name) — match by CSS + visible text instead of exact role name.
		// The menu closes after each selection, so re-open it for the second item.
		await page.locator('.dropdown-menu .dropdown-item', { hasText: 'Global' }).click();
		await plus.click();
		await page.locator('.dropdown-menu .dropdown-item', { hasText: 'Timeline' }).click();

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

	test('dragging a segment on pipe 2 resizes pipe 2, not the active pipe', async ({ page }) => {
		// Setup: a segment on pipe 1 (default), then add pipe 2 and a segment on it.
		// Drag pipe-2's right handle far right; the label must reflect the NEW
		// end frame AND pipe-1's segment label must be unchanged. Guards the
		// "commit to the section's own pipe" invariant (regression test for
		// the activePipe shortcut).
		// Pipe 1: add timeline + segment 0..8 via the UI
		const plus = page.locator('.btn-add-track').first();
		await plus.click();
		await page.locator('.dropdown-menu .dropdown-item', { hasText: 'Timeline' }).click();
		await page.locator('.seg-empty.full-width').first().click();
		await page.waitForSelector('.modal', { timeout: 5000 });
		await page.locator('.modal input[type="number"]').nth(0).fill('0');
		await page.locator('.modal input[type="number"]').nth(1).fill('8');
		await page.locator('.modal .btn-confirm').click();
		await page.waitForSelector('.segment-body', { timeout: 5000 });

		// Add pipe 2. NOTE: the add-track dropdown renders at panel level
		// (sibling of all .pipe containers), so target the pipe-2 button by
		// index, not by scoping the menu inside pipe2.
		await page.locator('.btn-add-pipe').click();
		const pipe2 = page.locator('.pipe').nth(1);
		await page.locator('.btn-add-track').nth(1).click();
		await page.locator('.dropdown-menu .dropdown-item', { hasText: 'Timeline' }).click();
		await pipe2.locator('.seg-empty.full-width').first().click();
		await page.waitForSelector('.modal', { timeout: 5000 });
		await page.locator('.modal input[type="number"]').nth(0).fill('0');
		await page.locator('.modal input[type="number"]').nth(1).fill('8');
		await page.locator('.modal .btn-confirm').click();
		await pipe2.locator('.segment-body').waitFor({ timeout: 5000 });

		const pipe1 = page.locator('.pipe').first();
		const labelBefore = await pipe2.locator('.seg-label').first().innerText();
		expect(labelBefore.trim()).toBe('0–8');

		// Drag pipe-2's right handle to the far right in 3 steps
		const handleR = pipe2.locator('.segment-handle-right').first();
		const hb = (await handleR.boundingBox())!;
		const canvas2 = (await pipe2.locator('.timeline-coordinate').boundingBox())!;
		const targetX = canvas2.x + canvas2.width * 0.9;
		await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
		await page.mouse.down();
		await page.mouse.move((hb.x + targetX) / 2, hb.y + hb.height / 2, { steps: 10 });
		await page.waitForTimeout(150);
		await page.mouse.move(targetX, hb.y + hb.height / 2, { steps: 10 });
		await page.waitForTimeout(150);
		await page.mouse.up();
		await page.waitForTimeout(300);

		const labelAfter = await pipe2.locator('.seg-label').first().innerText();
		// Pipe 2's segment end moved (frame > 8); pipe 1's label is untouched.
		expect(labelAfter.trim()).not.toBe('0–8');
		const pipe1Label = await pipe1.locator('.seg-label').first().innerText();
		expect(pipe1Label.trim()).toBe('0–8');
	});
});
