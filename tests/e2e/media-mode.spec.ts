/**
 * E2E for the pipe-level media mode (docs/agnes-model-catalog.md, Q7).
 * The default video model (agnes-video-2.5-flash) offers EXCLUSIVE
 * keyframes/reference modes, so the pipe UI renders a toggle and exactly
 * one of the two media rows is available at a time. The composer ships the
 * 'current' layout: independent KEYFRAMES / SUBJECT REFS rows (no tabs).
 * Run: npx playwright test tests/e2e/media-mode.spec.ts
 */
import { test, expect } from '@playwright/test';

async function setupComposer(page: any) {
  await page.goto('/');
  await page.locator('input[placeholder*="name"]').fill('Test User');
  await page.getByRole('button', { name: 'Get Started' }).click();
  await page.waitForSelector('.workspace', { timeout: 10000 });
  await page.locator('.projects-panel .add-btn').click();
  await page.waitForSelector('.modal', { timeout: 5000 });
  await page.locator('input[placeholder*="project name"]').fill('MediaMode');
  await page.locator('.modal .btn-confirm').click();
  await page.waitForSelector('.project-name', { timeout: 5000 });
  await page.locator('.add-session-btn').click();
  await page.waitForSelector('.session-item', { timeout: 5000 });
  await page.locator('.session-item').first().click();
  await page.waitForSelector('.composer-panel', { timeout: 10000 });
}

test.describe('Pipe media mode', () => {
  test.beforeEach(async ({ page }) => {
    await setupComposer(page);
  });

  test('default video model shows the toggle; keyframes mode hides subjects', async ({ page }) => {
    const pipe = page.locator('.pipe').first();
    const toggle = pipe.locator('.media-mode');
    await expect(toggle).toBeVisible();
    await expect(toggle.locator('.media-opt.active')).toHaveText('Keyframes');

    // Current variant: in keyframes mode the KEYFRAMES row shows, SUBJECT REFS
    // row is hidden (both are independent rows, not tabs).
    await expect(pipe.locator('.row-label', { hasText: 'KEYFRAMES' })).toBeVisible();
    await expect(pipe.locator('.row-label', { hasText: 'SUBJECT REFS' })).toHaveCount(0);

    // Switching to reference flips the available row.
    await toggle.locator('.media-opt', { hasText: 'Reference' }).click();
    await expect(toggle.locator('.media-opt.active')).toHaveText('Reference');
    await expect(pipe.locator('.row-label', { hasText: 'SUBJECT REFS' })).toBeVisible();
    await expect(pipe.locator('.row-label', { hasText: 'KEYFRAMES' })).toHaveCount(0);
  });
});
