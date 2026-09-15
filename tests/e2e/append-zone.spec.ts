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

// All zones now share ONE lane (.segment-lane), so there is no dedicated
// + Tag button. Add-tag is a click on the ZONE PILL itself (.segment-body
// nth(zoneIdx)); its body swallows the click's propagation, so the panel's
// document-level "close menus on outside click" handler doesn't fire.
async function pressZoneRow(page: any, zoneIdx: number) {
	const pill = page.locator('.segment-body').nth(zoneIdx);
	// Click just past the pill's left edge (x+8): clears the resize grip that
	// sits centered on the frame-start, clears the right-edge delete button,
	// and lands on the pill body itself — a plain click, not a drag.
	const box = await pill.boundingBox();
	await page.mouse.click(box.x + 8, box.y + box.height / 2);
	await page.waitForSelector('.dropdown-menu .tag-item', { timeout: 5000 });
}

// Convenience: open the tag menu on a zone and add a tag of the given type.
// Picking a type adds it immediately — the intermediate Add button is gone.
async function addTagToZone(page: any, zoneIdx: number, typeText: string) {
	await pressZoneRow(page, zoneIdx);
	await page.locator('.dropdown-menu .tag-item', { hasText: typeText }).click();
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

		// Zone 2: append → the modal prefills the WHOLE remaining gap (80–240;
		// filling it is the default intent). Use only part of it so a third
		// zone can still be appended without overlap. (Zone 2 is exactly the
		// 24-frame creation floor at the default 24 fps — smaller is rejected
		// by the modal.)
		await appendBtn.click();
		await page.waitForSelector('.modal', { timeout: 5000 });
		const prefill = [
			await page.locator('.modal input[type="number"]').nth(0).inputValue(),
			await page.locator('.modal input[type="number"]').nth(1).inputValue(),
		];
		expect(Number(prefill[0])).toBe(80);
		expect(Number(prefill[1])).toBe(240);
		await addZoneAt(page, prefill[0], '104');
		expect(await page.locator('.segment-body').count()).toBe(2);

		// Zone 3: append again → next gap after zone 2's end (104).
		await appendBtn.click();
		await page.waitForSelector('.modal', { timeout: 5000 });
		const prefill3 = await page.locator('.modal input[type="number"]').nth(0).inputValue();
		expect(Number(prefill3)).toBe(104);
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

	test('tag lanes persist on the same line when tags come and go', async ({ page }) => {
		// Set up a zone + timeline.
		const plus = page.locator('.btn-add-track').first();
		await plus.click();
		await page.locator('.dropdown-menu .dropdown-item', { hasText: 'Timeline' }).click();
		await page.locator('.seg-empty.full-width').first().click();
		await page.waitForSelector('.modal', { timeout: 5000 });
		await addZoneAt(page, '0', '120');

		// No tags yet → no type lanes rendered.
		expect(await page.locator('.tag-lane').count()).toBe(0);

		// Add a Camera tag, then a Scene tag → one lane per TYPE (shared across
		// all zones), appearing in canonical order (Scene before Camera).
		await addTagToZone(page, 0, 'Camera');
		expect(await page.locator('.tag-lane-label').allInnerTexts()).toEqual(['Camera']);
		expect(await page.locator('.tag-body').count()).toBe(1);

		await addTagToZone(page, 0, 'Scene');
		expect(await page.locator('.tag-lane-label').allInnerTexts()).toEqual(['Scene', 'Camera']);
		expect(await page.locator('.tag-body').count()).toBe(2);

		// Now remove BOTH tags. The lanes must stay on their lines (faded,
		// empty) — not disappear and shift the other lane up.
		const delButtons = page.locator('.btn-del-tag');
		await delButtons.first().click();
		await page.waitForTimeout(300);
		await delButtons.first().click();
		await page.waitForTimeout(300);

		expect(await page.locator('.tag-body').count()).toBe(0);
		const emptyLanes = page.locator('.tag-lane.empty');
		expect(await emptyLanes.count()).toBe(2);
		const persistedLabels = await page.locator('.tag-lane-label').allInnerTexts();
		expect(persistedLabels).toEqual(['Scene', 'Camera']);
	});

	test('shared + Tag menu attaches to the invoking zone', async ({ page }) => {
		// Two zones; the tag menu opens on the invoking zone and attaches the
		// tag to that zone only (zone-switcher rows were removed from the popup
		// — only functional rows: tag types + New segment).
		const plus = page.locator('.btn-add-track').first();
		await plus.click();
		await page.locator('.dropdown-menu .dropdown-item', { hasText: 'Timeline' }).click();
		await page.locator('.seg-empty.full-width').first().click();
		await page.waitForSelector('.modal', { timeout: 5000 });
		await addZoneAt(page, '0', '60');
		await page.locator('.btn-add-zone').click();
		await page.waitForSelector('.modal', { timeout: 5000 });
		await addZoneAt(page, '60', '120');

		// Open the per-zone tag menu by pressing the ZONE ROW (the row's free
		// space is the add-tag target; no + Tag button anymore). The entry
		// point preselects the INVOKING zone (Z1 here).
		await pressZoneRow(page, 0);
		await page.waitForSelector('.dropdown-menu .tag-item', { timeout: 5000 });
		// No zone-switcher rows in the popup: only tag types + New segment.
		expect(await page.locator('.dropdown-menu .zone-item').count()).toBe(0);

		// Add a Scene tag → it lands in the INVOKING zone (Z1).
		await page.locator('.dropdown-menu .tag-item', { hasText: 'Scene' }).click();
		await page.waitForSelector('.tag-body', { timeout: 5000 });

		// The pill carries its zone badge (Z1) so the shared type lane stays
		// unambiguous.
		const pill = page.locator('.tag-body').first();
		expect(await pill.locator('.tag-pill-zone').innerText()).toBe('Z1');
	});

	test('timeline collapses to a summary header and re-expands', async ({ page }) => {
		// Set up a zone + a tag so the collapsed summary has content to show.
		const plus = page.locator('.btn-add-track').first();
		await plus.click();
		await page.locator('.dropdown-menu .dropdown-item', { hasText: 'Timeline' }).click();
		await page.locator('.seg-empty.full-width').first().click();
		await page.waitForSelector('.modal', { timeout: 5000 });
		await addZoneAt(page, '0', '120');

		// Expanded: header open, the single shared zone lane + one pill visible.
		expect(await page.locator('.timeline-header.open').count()).toBe(1);
		expect(await page.locator('.segment-lane').count()).toBe(1);
		expect(await page.locator('.segment-body').count()).toBe(1);
		// The delete button now lives inside the zone pill, not a detached
		// chrome row — so a .seg-del sits inside the .segment-body.
		expect(await page.locator('.segment-body .seg-del').count()).toBe(1);

		// Collapse: zones + lanes hide, summary shows the counts.
		await page.locator('.timeline-header').click();
		expect(await page.locator('.timeline-header.open').count()).toBe(0);
		expect(await page.locator('.segment-lane').count()).toBe(0);
		const summary = page.locator('.timeline-header .tl-summary');
		await expect(summary).toContainText('1 zone');

		// Re-expand: everything back.
		await page.locator('.timeline-header').click();
		expect(await page.locator('.timeline-header.open').count()).toBe(1);
		expect(await page.locator('.segment-lane').count()).toBe(1);
	});

	test('tag pills show prompt text inline', async ({ page }) => {
		// Zone + tag, then set a prompt via the prompt modal → pill shows it.
		const plus = page.locator('.btn-add-track').first();
		await plus.click();
		await page.locator('.dropdown-menu .dropdown-item', { hasText: 'Timeline' }).click();
		await page.locator('.seg-empty.full-width').first().click();
		await page.waitForSelector('.modal', { timeout: 5000 });
		await addZoneAt(page, '0', '120');

		await addTagToZone(page, 0, 'Scene');
		await page.waitForSelector('.tag-body', { timeout: 5000 });

		// No prompt yet → pill falls back to the tag type name.
		const pill = page.locator('.tag-body').first();
		expect((await pill.locator('.tag-pill-prompt').innerText()).trim()).toBe('Scene');

	// Edit the prompt via the modal → the pill text updates live.
	await pill.click();
	await page.waitForSelector('.modal', { timeout: 5000 });
	await page.locator('.modal textarea').fill('Mountain approach');
	await page.locator('.modal .btn-confirm').click();
	await page.waitForTimeout(300);
	expect((await pill.locator('.tag-pill-prompt').innerText()).trim()).toBe('Mountain approach');
});

test('tag delete button is hidden until the pill is hovered', async ({ page }) => {
	// Zone + tag, so a pill exists.
	const plus = page.locator('.btn-add-track').first();
	await plus.click();
	await page.locator('.dropdown-menu .dropdown-item', { hasText: 'Timeline' }).click();
	await page.locator('.seg-empty.full-width').first().click();
	await page.waitForSelector('.modal', { timeout: 5000 });
	await addZoneAt(page, '0', '120');

	await addTagToZone(page, 0, 'Scene');
	await page.waitForSelector('.tag-body', { timeout: 5000 });

		// The × is hidden at rest so a narrow pill reads clean.
	const delBtn = page.locator('.btn-del-tag').first();
	expect(await delBtn.evaluate((el) => getComputedStyle(el).opacity)).toBe('0');

	// Hovering the pill reveals the ×.
	await page.locator('.tag-body').first().hover();
	await page.waitForTimeout(150);
	expect(await delBtn.evaluate((el) => getComputedStyle(el).opacity)).not.toBe('0');
});

	test('clicking a zone pill opens the tag menu scoped to that zone', async ({ page }) => {
		// One zone → the pill is the add-tag affordance (no + Tag button).
		const plus = page.locator('.btn-add-track').first();
		await plus.click();
		await page.locator('.dropdown-menu .dropdown-item', { hasText: 'Timeline' }).click();
		await page.locator('.seg-empty.full-width').first().click();
		await page.waitForSelector('.modal', { timeout: 5000 });
		await addZoneAt(page, '0', '60');
		// No dedicated + Tag button anymore — the zone pill itself is the target.
		expect(await page.locator('.seg-add-tag').count()).toBe(0);

		// Pressing the zone pill opens the tag menu with the zone
		// preselected, and adding a tag lands on that zone.
		await pressZoneRow(page, 0);
		await page.locator('.dropdown-menu .tag-item', { hasText: 'Scene' }).click();
		await page.waitForSelector('.tag-body', { timeout: 5000 });
		expect(await page.locator('.tag-body').count()).toBe(1);
		// The pill carries its zone badge (Z1) so the shared lane stays
		// unambiguous.
		expect(await page.locator('.tag-pill-zone').first().innerText()).toBe('Z1');
	});

	test('per-zone + Tag menu shows declared types greyed and "New segment" item', async ({ page }) => {
		const plus = page.locator('.btn-add-track').first();
		await plus.click();
		await page.locator('.dropdown-menu .dropdown-item', { hasText: 'Timeline' }).click();
		await page.locator('.seg-empty.full-width').first().click();
		await page.waitForSelector('.modal', { timeout: 5000 });
		await addZoneAt(page, '0', '120');

		async function openMenu() {
			await pressZoneRow(page, 0);
		}

		// "New segment" item is present and opens the zone/gap modal (choice ii).
		await openMenu();
		await page.locator('.new-segment-item').click();
		const gapChips = page.locator('.gap-chip');
		expect(await gapChips.count()).toBe(1);
		expect(await gapChips.first().getAttribute('title')).toContain('120–240');
		await page.locator('.modal .btn-cancel').click();

		// Add a Camera tag, then reopen: Camera is greyed-but-clickable (choice A).
		await openMenu();
		await page.locator('.dropdown-menu .tag-item', { hasText: 'Camera' }).click();
		await page.waitForTimeout(300);
		expect(await page.locator('.tag-body').count()).toBe(1);

		await openMenu();
		const camItem = page.locator('.dropdown-menu .tag-item', { hasText: 'Camera' });
		expect(await camItem.evaluate((el) => el.className)).toContain('declared');
		expect(await camItem.locator('.tag-item-badge').count()).toBe(1);
		const sceneItem = page.locator('.dropdown-menu .tag-item', { hasText: 'Scene' });
		expect(await sceneItem.evaluate((el) => el.className)).not.toContain('declared');
		// The menu has no Cancel row anymore — an outside click closes it. The
		// zone pill covers the lane label, so use the timeline header, which
		// sits above the lane and outside the menu's footprint.
		await page.locator('.timeline-header').click();
	});

	test('a packed zone resplits for a duplicate same-type tag; other types still fit', async ({ page }) => {
		// Two adjacent zones with NO free gap between them (0–24 | 24–48,
		// 1s at the default 24 fps): a first same-type tag in each spans its
		// whole zone, which packs that zone for further same-type additions
		// — deterministically, without ruler-pixel drag geometry.
		const plus = page.locator('.btn-add-track').first();
		await plus.click();
		await page.locator('.dropdown-menu .dropdown-item', { hasText: 'Timeline' }).click();
		await page.locator('.seg-empty.full-width').first().click();
		await page.waitForSelector('.modal', { timeout: 5000 });
		await addZoneAt(page, '0', '24');
		await page.locator('.btn-add-zone').click();
		await page.waitForSelector('.modal', { timeout: 5000 });
		await addZoneAt(page, '24', '48');

		async function addTagOfType(zoneIdx: number, typeText: string) {
			await addTagToZone(page, zoneIdx, typeText);
		}

		// 1. First Camera tag per zone → each spans its whole zone.
		await addTagOfType(0, 'Camera');
		expect(await page.locator('.tag-body').count()).toBe(1);
		await addTagOfType(1, 'Camera');
		expect(await page.locator('.tag-body').count()).toBe(2);

		// 2. Z1 is now packed for Camera: a second same-type tag finds no free
		//    slot, so the zone is resplit evenly instead of rejecting — both
		//    Camera tags share Z1's 24 frames ([0,16] + [16,24]) and no toast
		//    surfaces (the resplit returns a silent warning).
		await addTagOfType(0, 'Camera');
		expect(await page.locator('.tag-body').count()).toBe(3);
		await expect(page.locator('div[role="alert"]')).toHaveCount(0);

		// 3. A different type is NOT blocked by the packed Camera lane: Scene
		//    spans Z1 freely and lands on the shared Scene lane with a Z1 badge.
		await addTagOfType(0, 'Scene');
		expect(await page.locator('.tag-body').count()).toBe(4);
		});

	test('tag pills expose left/right resize grips that commit to the store', async ({ page }) => {
		// Set up a zone (0–120) + a Camera tag that inherits the full range.
		const plus = page.locator('.btn-add-track').first();
		await plus.click();
		await page.locator('.dropdown-menu .dropdown-item', { hasText: 'Timeline' }).click();
		await page.locator('.seg-empty.full-width').first().click();
		await page.waitForSelector('.modal', { timeout: 5000 });
		await addZoneAt(page, '0', '120');

		// Add a Camera tag by pressing the zone row (its free space is the target).
		await addTagToZone(page, 0, 'Camera');
		await page.waitForSelector('.tag-body', { timeout: 5000 });

		// Both grips sit on the pill, centered on its frame edges.
		const pill = page.locator('.tag-body').first();
		const pillBox = (await pill.boundingBox())!;
		const gripL = (await page.locator('.tag-handle-left').first().boundingBox())!;
		const gripR = (await page.locator('.tag-handle-right').first().boundingBox())!;
		expect(Math.abs(gripL.x + 4 - pillBox.x)).toBeLessThan(3); // 8px grip centered on left edge
		expect(Math.abs(gripR.x + 4 - (pillBox.x + pillBox.width))).toBeLessThan(3);

		// Drag the right grip far left to ~30% of the pill → end frame
		// recomputes below the parent range, so the committed pill shrinks
		// noticeably (the 8-grid snap still applies).
		await page.mouse.move(gripR.x + gripR.width / 2, gripR.y + gripR.height / 2);
		await page.mouse.down();
		await page.mouse.move(pillBox.x + pillBox.width * 0.3, gripR.y + gripR.height / 2, { steps: 12 });
		await page.waitForTimeout(150);
		await page.mouse.up();
		await page.waitForTimeout(500);

		// The committed width: the drag preview follows the pointer, but the
		// store clamps end ≥ start+8, so an 80px drag from a 120-frame range
		// lands on span ~56–80 (snapped), never the full 120 again. The pill
		// width therefore shrinks from the original.
		const pillText = await pill.locator('.tag-pill-prompt').innerText();
		expect(pillText.trim()).toBe('Camera');
		const newPill = (await pill.boundingBox())!;
		expect(newPill.width).toBeLessThan(pillBox.width); // the resize committed
	});

	test('global range exposes grips that resize via the store', async ({ page }) => {
		// Create the global lane, then drag its right grip in to ~30% of the
		// pipe. The committed range width must shrink (updateGlobalRange fired).
		const plus = page.locator('.btn-add-track').first();
		await plus.click();
		await page.locator('.dropdown-menu .dropdown-item', { hasText: 'Global' }).click();
		await page.waitForSelector('.global-range', { timeout: 5000 });

		// The global bar spans the whole pipe on creation; grips sit at its edges.
		const range = page.locator('.global-range').first();
		const rangeBox = (await range.boundingBox())!;
		const gripR = (await page.locator('.global-handle-right').first().boundingBox())!;
		expect(Math.abs(gripR.x + 5 - (rangeBox.x + rangeBox.width))).toBeLessThan(3);

		// Drag the right grip far left → range end recomputes, width shrinks.
		await page.mouse.move(gripR.x + gripR.width / 2, gripR.y + gripR.height / 2);
		await page.mouse.down();
		await page.mouse.move(rangeBox.x + rangeBox.width * 0.3, gripR.y + gripR.height / 2, { steps: 12 });
		await page.waitForTimeout(150);
		await page.mouse.up();
		await page.waitForTimeout(500);

		const newRange = (await range.boundingBox())!;
		expect(newRange.width).toBeLessThan(rangeBox.width); // the resize committed
	});
	test('global range body-drag moves the whole range', async ({ page }) => {
		const plus = page.locator('.btn-add-track').first();
		await plus.click();
		await page.locator('.dropdown-menu .dropdown-item', { hasText: 'Global' }).click();
		await page.waitForSelector('.global-range', { timeout: 5000 });

		const range = page.locator('.global-range').first();
		// The global bar is created full-pipe (0..N-1), so a body-drag right
		// would be clamped in place (start pinned at 0). Shrink it first via
		// the right grip so there is room to move.
		const fullBox = (await range.boundingBox())!;
		const gripR = (await page.locator('.global-handle-right').first().boundingBox())!;
		await page.mouse.move(gripR.x + gripR.width / 2, gripR.y + gripR.height / 2);
		await page.mouse.down();
		await page.mouse.move(fullBox.x + fullBox.width * 0.5, gripR.y + gripR.height / 2, { steps: 12 });
		await page.mouse.up();
		await page.waitForTimeout(500);

		// Now body-drag the (shorter) range right by ~half the pipe width.
		const box = (await range.boundingBox())!;
		const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
		await page.mouse.move(cx, cy);
		await page.mouse.down();
		await page.mouse.move(cx + fullBox.width * 0.5, cy, { steps: 12 });
		await page.waitForTimeout(150);
		await page.mouse.up();
		await page.waitForTimeout(500);

		const after = (await range.boundingBox())!;
		expect(after.x).toBeGreaterThan(box.x); // the range moved right
		// Duration preserved: only the start shifts, width stays the same.
		expect(Math.abs(after.width - box.width)).toBeLessThan(2);
	});
});
