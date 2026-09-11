/**
 * E2E: appending a second (and third) zone via the persistent "+ Zone"
 * button in the zone chrome row.
 *
 * Regression guard: the only entry point to handleAddSegment used to be the
 * "+ Add first zone" empty placeholder, which disappears after the first
 * zone — so zones could never be appended. The append affordance must stay
 * visible for any number of zones and keep producing non-overlapping,
 * gap-computed ranges from getNextAvailableRange.
 *
 * Run with: npx playwright test tests/e2e/append-zone.spec.ts
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
	await page.locator('input[placeholder*="project name"]').fill('AppendZone');
	await page.locator('.modal .btn-confirm').click();
	await page.waitForSelector('.project-name', { timeout: 5000 });

	// Add session
	await page.locator('.add-session-btn').click();
	await page.waitForSelector('.session-item', { timeout: 5000 });
	await page.locator('.session-item').first().click();
	await page.waitForSelector('.composer-panel', { timeout: 10000 });
}

async function addZoneAt(page: any, start: string, end: string) {
	await page.locator('.modal input[type="number"]').nth(0).fill(start);
	await page.locator('.modal input[type="number"]').nth(1).fill(end);
	await page.locator('.modal .btn-confirm').click();
	await page.waitForTimeout(300);
}

test.describe('Appending zones', () => {
	test.beforeEach(async ({ page }) => {
		await setupComposer(page);
	});

	test('first zone via placeholder, then "+ Zone" button appends without overlap', async ({ page }) => {
		// Ensure a timeline lane exists so the zone chrome row renders.
		const plus = page.locator('.btn-add-track').first();
		await plus.click();
		await page.locator('.dropdown-menu .dropdown-item', { hasText: 'Timeline' }).click();

		// Zone 1: 0–80 via the empty placeholder.
		await page.locator('.seg-empty.full-width').first().click();
		await page.waitForSelector('.modal', { timeout: 5000 });
		await addZoneAt(page, '0', '80');
		expect(await page.locator('.segment-body').count()).toBe(1);

		// The empty placeholder is gone; the append button must now be visible.
		await expect(page.locator('.seg-empty.full-width')).toHaveCount(0);
		const appendBtn = page.locator('.btn-add-zone');
		await expect(appendBtn).toBeVisible();

		// Zone 2: append → getNextAvailableRange picks 80–88 (first gap after
		// the last segment). Confirm it.
		await appendBtn.click();
		await page.waitForSelector('.modal', { timeout: 5000 });
		const prefill = [
			await page.locator('.modal input[type="number"]').nth(0).inputValue(),
			await page.locator('.modal input[type="number"]').nth(1).inputValue(),
		];
		expect(Number(prefill[0])).toBe(80);
		expect(Number(prefill[1])).toBeGreaterThanOrEqual(88);
		await addZoneAt(page, prefill[0], prefill[1]);
		expect(await page.locator('.segment-body').count()).toBe(2);

		// Zone 3: append again → next gap after zone 2's end.
		await appendBtn.click();
		await page.waitForSelector('.modal', { timeout: 5000 });
		const prefill3 = await page.locator('.modal input[type="number"]').nth(0).inputValue();
		const zone2End = Number(prefill[1]);
		expect(Number(prefill3)).toBe(zone2End);
		await addZoneAt(page, prefill3, await page.locator('.modal input[type="number"]').nth(1).inputValue());
		expect(await page.locator('.segment-body').count()).toBe(3);

		// No overlaps: segment ranges stay strictly non-touching.
		const labels = await page.locator('.seg-label').allInnerTexts();
		const ranges = labels.map((l: string) =>
			l.split('–').map(Number) as [number, number]
		);
		ranges.sort((a, b) => a[0] - b[0]);
		for (let i = 1; i < ranges.length; i++) {
			expect(ranges[i][0]).toBeGreaterThanOrEqual(ranges[i - 1][1]);
		}
	});

	test('pipe-full guard: when no gap fits min span, append shows a toast, not a dead modal', async ({ page }) => {
		// Pack the whole pipe (0–240 on the default 241-frame pipe), then try
		// to append. handleAddSegment must short-circuit with a flashToast
		// instead of opening an unconfirmable modal.
		const plus = page.locator('.btn-add-track').first();
		await plus.click();
		await page.locator('.dropdown-menu .dropdown-item', { hasText: 'Timeline' }).click();

		await page.locator('.seg-empty.full-width').first().click();
		await page.waitForSelector('.modal', { timeout: 5000 });
		await addZoneAt(page, '0', '240');

		const appendBtn = page.locator('.btn-add-zone');
		await appendBtn.click();

		// No modal should open…
		await expect(page.locator('.modal')).toHaveCount(0);
		// …and the pipe-full toast should surface.
		await expect(page.locator('div[role="alert"]', { hasText: /No free space for a new segment/i })).toBeVisible({
			timeout: 5000,
		});
	});
});
