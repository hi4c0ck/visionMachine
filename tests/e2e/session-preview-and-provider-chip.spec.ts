/**
 * E2E tests for two product questions:
 *
 * 1. Sessions with a complete (composed) video should show a preview in the
 *    ToolsPanel's "Preview" section when selected. In browser (non-Tauri) mode
 *    `toMediaUrl()` returns null, so the actual `<video>` element cannot render
 *    — but we CAN test the conditional rendering: when `sessionVideo` is set
 *    the `preview-video-box` shows; when null, the fallback (session name +
 *    pipe count) shows.
 *
 * 2. The provider status chip in the top bar reflects per-profile key state:
 *    - video key set (url + key + model all present) → green "ok" dot +
 *      "Agnes · <model>"
 *    - video key missing → red "error" dot + "Key needed · Agnes · <model>"
 *
 *    The chip drives the primary generation gate: it mirrors the VIDEO provider
 *    (the one the engine requires). The tooltip lists the exact per-kind gaps
 *    for the OTHER providers (image / text) so the user knows what else is
 *    unset.
 *
 *    The provider tests drive the app's OWN settings modal (the real user
 *    flow): fill the key field, Save, and the store persists + notifies. No
 *    localStorage seeding — the modal path writes the exact key `loadSettings`
 *    reads back, so there is no format assumption.
 *
 *    While the active profile's settings are in flight (the P6b load-lifecycle
 *    flag) the chip renders a neutral "Loading…" state; in browser dev mode the
 *    load is synchronous so the window is unobservable here — it is covered by
 *    the settings-store unit tests instead. `waitForChipSettled` below is
 *    therefore a safe no-op pass in the browser.
 */

import { test, expect, type Page } from '@playwright/test';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function login(page: Page, name: string) {
  await page.goto('/');
  await page.locator('input[placeholder*="name"]').fill(name);
  await page.locator('button:has-text("Get Started")').click();
  await page.locator('.frame').waitFor({ timeout: 5000 });
}

/**
 * Open the settings modal at the Providers tab and save a video API key
 * (the video slot's url + model are pre-filled by the agnes preset, so the
 * key is the only field the generation gate needs). Pass an empty/absent key
 * to test the "not set" state.
 */
async function saveVideoKey(page: Page, key?: string) {
  await page.locator('.settings-entry').click();
  await page.locator('.tab-btn:has-text("Providers")').click();
  const videoCard = page.locator('.provider-card').nth(2); // text=0, image=1, video=2
  if (key !== undefined) {
    await videoCard.locator('#prov-key-video').fill(key);
  }
  await page.locator('.settings-modal .btn-confirm').click();
  await expect(page.locator('.settings-modal')).toBeHidden();
}

/**
 * Wait for the provider chip to leave its neutral "Loading…" state (P6b).
 * In browser dev mode the settings load is synchronous, so this passes
 * immediately; on the desktop (Tauri) build it polls for the IPC round-trip.
 */
async function waitForChipSettled(page: Page) {
  const chip = page.locator('.provider-chip');
  await expect(chip).toBeVisible();
  await expect(chip).not.toContainText('Loading…');
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Provider status chip — key verified vs key not set
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Provider status chip', () => {
  test('a fresh profile with no key shows "Key needed" (error dot)', async ({ page }) => {
    // Like the "Vlad" profile in the DB: no keys set anywhere.
    await login(page, 'vlad-e2e');
    await waitForChipSettled(page);

    const chip = page.locator('.provider-chip');
    await expect(chip).toHaveClass(/error/);
    await expect(chip).toContainText('Key needed');
    // All three kinds report their gap in the tooltip.
    const title = await chip.getAttribute('title') ?? '';
    expect(title).toContain('text');
    expect(title).toContain('image');
    expect(title).toContain('video');
  });

  test('saving a video key flips the chip to "ok" (green dot, preset·model label)', async ({ page }) => {
    // Like the "hi4" profile in the DB: keys set and configured.
    await login(page, 'hi4-e2e');
    await saveVideoKey(page, 'sk-e2e-video-key');
    await waitForChipSettled(page);

    const chip = page.locator('.provider-chip');
    // Video is the generation gate: url (preset default) + key + model (preset
    // default) all present → configured → green ok dot, "Agnes · <model>".
    await expect(chip).toHaveClass(/ok/);
    await expect(chip).toContainText('Agnes');
    await expect(chip).not.toContainText('Key needed');
    // The tooltip still names the image + text gaps (they have no keys) but
    // the video line is gone from the missing set.
    const title = await chip.getAttribute('title') ?? '';
    expect(title).toContain('image');
    expect(title).toContain('text');
    expect(title).not.toContain('video');
  });

  test('the chip state persists across reloads (per-profile settings)', async ({ page }) => {
    // The chip is a per-profile property: reload the page and the saved key
    // must come back (settings persist to vm-settings-${username} in browser
    // mode, SQLite under the hashed profile id on desktop).
    await login(page, 'persist-e2e');
    await saveVideoKey(page, 'sk-persist-key');
    await waitForChipSettled(page);
    const chip = page.locator('.provider-chip');
    await expect(chip).toHaveClass(/ok/);

    // Reload → fresh store init (default-seeded snapshot) → the persisted
    // settings re-load under the same username → the chip settles back to ok.
    await page.reload();
    await page.locator('.frame').waitFor({ timeout: 5000 });
    await waitForChipSettled(page);
    await expect(chip).toHaveClass(/ok/);
  });

  test('clearing the video key flips the chip back to "Key needed"', async ({ page }) => {
    await login(page, 'clear-e2e');
    await saveVideoKey(page, 'sk-will-clear');
    await waitForChipSettled(page);
    const chip = page.locator('.provider-chip');
    await expect(chip).toHaveClass(/ok/);

    // Clear the key and save → the generation gate fails again.
    await saveVideoKey(page, '');
    await waitForChipSettled(page);
    await expect(chip).toHaveClass(/error/);
    await expect(chip).toContainText('Key needed');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. ToolsPanel preview section — session video present vs absent
// ─────────────────────────────────────────────────────────────────────────────

test.describe('ToolsPanel session preview', () => {
  test('shows fallback (session name + pipes) when no composed video exists', async ({ page }) => {
    // Fresh user, no settings, no generation → no session video.
    await login(page, 'no-video-user');

    // Create a project + session.
    await page.locator('.projects-panel .add-btn').click();
    await page.waitForSelector('.modal', { timeout: 5000 });
    await page.locator('input[placeholder*="project name"]').fill('P');
    await page.locator('.modal .btn-confirm').click();
    await page.locator('.add-session-btn').click();
    await page.locator('.session-item').first().click();

    const toolsPanel = page.locator('.tools-panel');
    await expect(toolsPanel).toBeVisible();

    // No composed video → the fallback preview block shows the session name +
    // pipe count (the `preview-video-box` is absent).
    const previewArea = toolsPanel.locator('.preview-section');
    await expect(previewArea).toBeVisible();
    await expect(previewArea.locator('.preview-active')).toBeVisible();
    await expect(previewArea.locator('.preview-video-box')).toHaveCount(0);
    await expect(previewArea.locator('.preview-name')).toBeVisible();
  });

  test('new session has a pipe with default settings shown in the panel', async ({ page }) => {
    await login(page, 'pipe-check');
    await page.locator('.projects-panel .add-btn').click();
    await page.waitForSelector('.modal', { timeout: 5000 });
    await page.locator('input[placeholder*="project name"]').fill('P2');
    await page.locator('.modal .btn-confirm').click();
    await page.locator('.add-session-btn').click();
    await page.locator('.session-item').first().click();

    const toolsPanel = page.locator('.tools-panel');
    // Settings section shows the FPS select (session default 24).
    const fpsSelect = toolsPanel.locator('.setting-select').first();
    await expect(fpsSelect).toBeVisible();
    await expect(fpsSelect).toHaveValue('24');
  });
});
