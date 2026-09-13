/**
 * GAP 2 E2E: a zone can be added into ANY free gap (not just the first),
 * and the modal offers a "Place in free space" picker.
 * Run: npx playwright test tests/e2e/gap-insert.spec.ts
 */
import { test, expect } from '@playwright/test';

async function setupComposer(page: any) {
	await page.goto('/');
	await page.locator('input[placeholder*="name"]').fill('Test User');
	await page.getByRole('button', { name: 'Get Started' }).click();
	await page.waitForSelector('.workspace', { timeout: 10000 });
	await page.locator('.projects-panel .add-btn').click();
	await page.waitForSelector('.modal', { timeout: 5000 });
	await page.locator('input[placeholder*="project name"]').fill('GapInsert');
	await page.locator('.modal .btn-confirm').click();
	await page.waitForSelector('.project-name', { timeout: 5000 });
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

test.describe('Insert zone into any free gap', () => {
	test.beforeEach(async ({ page }) => {
		await setupComposer(page);
		// Add the timeline track so zones can be placed.
		await page.locator('.btn-add-track').first().click();
		await page.locator('.dropdown-menu .dropdown-item', { hasText: 'Timeline' }).click();
	});

	test('modal offers a picker of every free gap, not just the first', async ({ page }) => {
		// Two zones with a free gap between them: 0–40 and 80–120.
		await page.locator('.seg-empty.full-width').first().click();
		await page.waitForSelector('.modal', { timeout: 5000 });
		await addZoneAt(page, '0', '40');

		await page.locator('.btn-add-zone').click();
		await page.waitForSelector('.modal', { timeout: 5000 });
		await addZoneAt(page, '80', '120');

		// Now the free gaps are: Before Zone 1 (0–0? no, 0 is taken → none),
		// Between Zone 1 & 2 (40–80), After last zone (120–240).
		await page.locator('.btn-add-zone').click();
		await page.waitForSelector('.modal', { timeout: 5000 });

		// The gap picker must list the between-zone gap AND the after-zone gap.
		const gapChips = page.locator('.gap-chip');
		expect(await gapChips.count()).toBeGreaterThanOrEqual(2);
		const labels = await gapChips.allInnerTexts();
		expect(labels.some((l: string) => l.includes('Between Zone 1 & 2'))).toBe(true);
		expect(labels.some((l: string) => l.includes('After last zone'))).toBe(true);
	});

	test('can insert a zone into a middle gap, not just append', async ({ page }) => {
		// Two zones: 0–40 and 120–160 → a free gap 40–120 in the middle.
		await page.locator('.seg-empty.full-width').first().click();
		await page.waitForSelector('.modal', { timeout: 5000 });
		await addZoneAt(page, '0', '40');

		await page.locator('.btn-add-zone').click();
		await page.waitForSelector('.modal', { timeout: 5000 });
		await addZoneAt(page, '120', '160');

		// Open the picker and target the middle gap explicitly.
		await page.locator('.btn-add-zone').click();
		await page.waitForSelector('.modal', { timeout: 5000 });
		const middleChip = page.locator('.gap-chip', { hasText: 'Between Zone 1 & 2' });
		expect(await middleChip.count()).toBe(1);
		await middleChip.click();

		// The inputs should be seeded into the middle gap (40–120 range).
		const startVal = Number(await page.locator('.modal input[type="number"]').nth(0).inputValue());
		const endVal = Number(await page.locator('.modal input[type="number"]').nth(1).inputValue());
		expect(startVal).toBeGreaterThanOrEqual(40);
		expect(endVal).toBeLessThanOrEqual(120);
		expect(endVal).toBeGreaterThan(startVal);

		// Confirm → a third zone lands inside the middle gap.
		await page.locator('.modal .btn-confirm').click();
		await page.waitForTimeout(300);
		expect(await page.locator('.segment-body').count()).toBe(3);
	});

	test('packed pipe still shows the no-space guard, not a dead modal', async ({ page }) => {
		// One zone filling the whole pipe → no free gap → toast, not a modal.
		await page.locator('.seg-empty.full-width').first().click();
		await page.waitForSelector('.modal', { timeout: 5000 });
		await addZoneAt(page, '0', '240');

		await page.locator('.btn-add-zone').click();
		await page.waitForTimeout(400);
		await expect(page.locator('.modal')).toHaveCount(0);
		await expect(
			page.locator('div[role="alert"]', { hasText: /No free space/i })
		).toBeVisible({ timeout: 5000 });
	});
});
