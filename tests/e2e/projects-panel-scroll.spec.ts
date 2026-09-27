/**
 * Regression: with many projects/sessions the left column used to grow past
 * the viewport, pushing the ProfilePanel (and its Settings entry) off-screen.
 * The projects list must now scroll internally so the Settings button is
 * always reachable — the panel pins the profile row, not the user.
 */

import { test, expect, type Page } from '@playwright/test';

async function setupProject(page: Page) {
  await page.goto('/');
  await page.locator('input[placeholder*="name"]').fill('Test User');
  await page.locator('button:has-text("Get Started")').click();
  await page.locator('.projects-panel .add-btn').click();
  await page.waitForSelector('.modal', { timeout: 5000 });
  await page.locator('input[placeholder*="project name"]').fill('Project');
  await page.locator('.modal .btn-confirm').click();
}

// Add sessions by creating projects: each project auto-selects and the panel
// shows its session. (Browser dev mode: projects persist to localStorage.)
async function seedManySessions(page: Page, projectNames: string[]) {
  for (const name of projectNames) {
    await page.locator('.projects-panel .add-btn').click();
    await page.locator('input[placeholder*="project name"]').fill(name);
    await page.locator('.modal .btn-confirm').click();
    	// Add 3 sessions to each project (button is scoped to the selected project).
    	// Force-click: as the list grows the button can sit under the pinned
    	// profile panel until the panel scrolls — the click target still resolves
    	// to the correct element.
    	for (let i = 0; i < 3; i++) {
    		await page.locator('.add-session-btn').last().click({ force: true });
    		await page.waitForTimeout(80);
    	}
  }
}

test.describe('Left column never hides the profile panel', () => {
  test('projects list scrolls; Settings entry stays in the viewport', async ({ page }) => {
    // Short viewport so the content-height pressure is guaranteed.
    await page.setViewportSize({ width: 1280, height: 520 });
    await setupProject(page);
    // 8 projects x 3 sessions each + the initial project = plenty of rows.
    await seedManySessions(page, ['P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8']);

    // The projects list overflows the panel and scrolls internally…
    const list = page.locator('.projects-list');
    const scrollable = await list.evaluate(
      (el) => el.scrollHeight > el.clientHeight + 1,
    );
    expect(scrollable).toBe(true);

    // …and the Settings entry (last child of the profile panel) is fully
    // visible — inside the viewport, not clipped below it.
    const settingsEntry = page.locator('.settings-entry');
    await expect(settingsEntry).toBeVisible();
    const box = await settingsEntry.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.y + box!.height).toBeLessThanOrEqual(520);

    // The profile panel itself must end at the viewport bottom, not below it.
    const profile = page.locator('.profile-panel');
    const pbox = await profile.boundingBox();
    expect(pbox!.y + pbox!.height).toBeLessThanOrEqual(520);
  });

  test('Settings opens from the pinned profile panel after adding sessions', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 520 });
    await setupProject(page);
    await seedManySessions(page, ['P2', 'P3', 'P4']);
    await page.locator('.settings-entry').click();
    await expect(page.locator('.settings-modal')).toBeVisible();
    await expect(
      page.locator('.settings-modal .tab-btn:has-text("Defaults")'),
    ).toHaveClass(/active/);
  });
});
