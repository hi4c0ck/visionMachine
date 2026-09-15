/**
 * E2E regression tests for session-settings selectors and session-switch
 * crash:
 *  - FPS select shows the session's fps value (pre-fix it rendered blank:
 *    Svelte strict-compares the string option value against the numeric fps
 *    and deselects every option).
 *  - Size (resolution) is an independent session-level setting — changing
 *    orientation never rewrites it.
 *  - Switching sessions with a stale active-pipe index does not throw
 *    "Cannot read properties of undefined (reading 'elements')".
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

test.describe('Session settings selectors', () => {
  test('FPS select shows the session fps value (never blank)', async ({ page }) => {
    await setupProject(page);
    await page.locator('.add-session-btn').click();
    await page.locator('.session-item').first().click();

    // Settings selects in order: FPS, Resolution, Orientation.
    const fpsSelect = page.locator('.tools-panel .setting-select').first();
    await expect(fpsSelect).toHaveValue('24');
  });

  test('orientation change does not rewrite session resolution', async ({ page }) => {
    await setupProject(page);
    await page.locator('.add-session-btn').click();
    await page.locator('.session-item').first().click();

    const selects = page.locator('.tools-panel .setting-select');
    // Independent size choice: 1080p (preset default for vertical is also
    // 1080p — pick a value the preset would NOT force: 480p).
    await selects.nth(1).selectOption('480p');
    // Switching to vertical used to re-apply the vertical preset (1080p);
    // size must now stay where the user put it.
    await selects.nth(2).selectOption('vertical');
    await expect(selects.nth(1)).toHaveValue('480p');
  });

  test('switching sessions with a stale pipe index never throws', async ({ page }) => {
    await setupProject(page);
    // Two sessions; creating one selects it, so both exist in the project.
    await page.locator('.add-session-btn').click();
    await page.locator('.add-session-btn').click();

    const sessionA = page.locator('.session-item').first();
    const sessionB = page.locator('.session-item').nth(1);

    // Session A: add a second pipe and make it the active one (index 1).
    await sessionA.click();
    await page.locator('.btn-add-pipe').click();
    await expect(page.locator('.pipe')).toHaveCount(2);
    await page.locator('.pipe').nth(1).click();

    // Back to session B (one pipe): the stale active-pipe index (1) must not
    // crash the render path — pre-fix this threw
    // "Cannot read properties of undefined (reading 'elements')".
    await sessionB.click();
    await expect(page.locator('.composer-panel')).toBeVisible();
    await page.waitForTimeout(300); // give the global error handler a beat to surface
    await expect(page.locator('.error-popup')).toHaveCount(0);
  });
});
