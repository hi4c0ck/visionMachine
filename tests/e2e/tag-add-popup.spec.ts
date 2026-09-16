/**
 * E2E: the add-tag popup (TagSelectorMenu) — clicking a tag type must attach
 * a tag to the clicked zone; a second same-type tag into a full zone
 * resplits the zone evenly instead of failing, and only a zone too small to
 * resplit disables the type with a "too small" hint (covered at 18/24/60 fps
 * with ≥1s zones — docs/composer-timeline-sla.md).
 *
 * Run with: npx playwright test tests/e2e/tag-add-popup.spec.ts
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
	await page.locator('input[placeholder*="project name"]').fill('TagPopupTest');
	await page.locator('.modal .btn-confirm').click();
	await page.waitForSelector('.project-name', { timeout: 5000 });

	// Add session
	await page.locator('.add-session-btn').click();
	await page.waitForSelector('.session-item', { timeout: 5000 });
	await page.locator('.session-item').first().click();
	await page.waitForSelector('.composer-panel', { timeout: 10000 });
}

/** New pipes ship an empty timeline — add one zone via the empty-slot placeholder. */
async function addZone(page: any) {
	await page.locator('.seg-empty.full-width').first().click();
	await page.waitForSelector('.modal', { timeout: 5000 });
	await page.locator('.modal input[type="number"]').nth(0).fill('0');
	await page.locator('.modal input[type="number"]').nth(1).fill('240');
	await page.locator('.modal .btn-confirm').click();
	await page.waitForSelector('.segment-body', { timeout: 5000 });
}

async function openTagMenu(page: any) {
	// Click just inside the pill's left edge (x+8) instead of the center: on a
	// narrow zone the hover-revealed delete button (×, right:4px, up to 40%
	// of the pill width) covers the pill center, so a center click would
	// delete the zone instead of opening the menu.
	const pill = page.locator('.segment-body').first();
	const box = await pill.boundingBox();
	await page.mouse.click(box.x + 8, box.y + box.height / 2);
	await page.waitForSelector('.tag-menu', { timeout: 5000 });
}

test.describe('Add-tag popup (TagSelectorMenu)', () => {
	test.beforeEach(async ({ page }) => {
		await setupComposer(page);
		await addZone(page);
	});

	test('clicking a tag type in the popup adds the tag to the zone', async ({ page }) => {
		await openTagMenu(page);
		await expect(page.locator('.tag-menu .tag-item', { hasText: 'Scene' })).toBeVisible();

		await page.locator('.tag-menu .tag-item', { hasText: 'Scene' }).click();

		// Popup closes and a Scene pill appears on the Scene lane.
		await expect(page.locator('.tag-menu')).toHaveCount(0);
		const pills = page.locator('.tag-lane .tag-body');
		await expect(pills.first()).toBeVisible();
		expect(await pills.count()).toBe(1);
	});

	test('a different type also adds (types only block same-type overlap)', async ({ page }) => {
		await openTagMenu(page);
		await page.locator('.tag-menu .tag-item', { hasText: 'Scene' }).click();
		await page.waitForTimeout(300); // let the first commit settle

		await openTagMenu(page);
		await page.locator('.tag-menu .tag-item', { hasText: 'Camera' }).click();

		const pills = page.locator('.tag-lane .tag-body');
		expect(await pills.count()).toBe(2);
	});

	test('second same-type tag resplits the zone instead of failing', async ({ page }) => {
		// First Scene tag spans the whole zone (placement rule C). A second one
		// finds no free slot → the zone is resplit evenly and BOTH tags exist.
		await openTagMenu(page);
		await page.locator('.tag-menu .tag-item', { hasText: 'Scene' }).click();
		await page.waitForTimeout(300);

		await openTagMenu(page);
		// Declared types stay greyed but clickable (choice A).
		await page.locator('.tag-menu .tag-item', { hasText: 'Scene' }).click();

		const pills = page.locator('.tag-lane .tag-body');
		expect(await pills.count()).toBe(2);
		// No error surfaced for the resplit.
		await expect(page.locator('div[role="alert"]')).toHaveCount(0);
	});

	// ── "too small to resplit" — fps sizes: small 18, default 24, large 60 ──
	// A "complete" zone is ≈1s at the session fps (soft SLA —
	// docs/composer-timeline-sla.md): roundUp8(fps) frames. Filling it with
	// same-type tags exhausts the zone, so the next one is disabled with a
	// "too small" hint.

	async function setFps(page: any, fps: number) {
		// The FPS select is the only settings select offering value "18".
		const fpsSelect = page
			.locator('select.setting-select')
			.filter({ has: page.locator('option[value="18"]') });
		await expect(fpsSelect).toBeVisible();
		await fpsSelect.selectOption(String(fps));
	}

	async function resetToZone(page: any, end: number) {
		// Delete the single existing zone, then create a fresh 0–end one.
		await page.locator('.segment-body').first().hover();
		await page.locator('.segment-body .seg-del').first().click();
		await page.waitForSelector('.seg-empty.full-width', { timeout: 5000 });

		await page.locator('.seg-empty.full-width').first().click();
		await page.waitForSelector('.modal', { timeout: 5000 });
		await page.locator('.modal input[type="number"]').nth(0).fill('0');
		await page.locator('.modal input[type="number"]').nth(1).fill(String(end));
		await page.locator('.modal .btn-confirm').click();
		await page.waitForSelector('.segment-body', { timeout: 5000 });
	}

	async function tooSmallCase(page: any, fps: number) {
		await setFps(page, fps);
		const zoneEnd = Math.ceil(fps / 8) * 8; // 1s, snapped up to the 8-grid
		const fillCount = zoneEnd / 8; // same-type tags that exhaust the zone
		await resetToZone(page, zoneEnd);

		for (let i = 0; i < fillCount; i++) {
			await openTagMenu(page);
			await page.locator('.tag-menu .tag-item', { hasText: 'Scene' }).click();
			await page.waitForTimeout(300);
		}
		expect(await page.locator('.tag-lane .tag-body').count()).toBe(fillCount);

		// The zone is exhausted for Scene — one more cannot fit, so the menu
		// disables it with a "too small" hint.
		await openTagMenu(page);
		const sceneItem = page.locator('.tag-menu .tag-item', { hasText: 'Scene' });
		await expect(sceneItem).toBeDisabled();
		await expect(sceneItem).toHaveAttribute('title', /too small/i);
	}

	test('too small to resplit @ 18 fps (small)', ({ page }) => tooSmallCase(page, 18));
	test('too small to resplit @ 24 fps (default)', ({ page }) => tooSmallCase(page, 24));
	test('too small to resplit @ 60 fps (large)', ({ page }) => tooSmallCase(page, 60));
});
