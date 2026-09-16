/**
 * E2E tests for the settings modal (docs/settings-provider-tasks.md, Phase 3).
 * Browser dev mode: settings persist to localStorage; the provider ping
 * returns the friendly "desktop only" outcome.
 */

import { test, expect } from '@playwright/test';

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    // Login first (same boilerplate as the other workspace specs)
    await page.goto('/');
    await page.locator('input[placeholder*="name"]').fill('Test User');
    await page.locator('button:has-text("Get Started")').click();
  });

  test('opens the settings modal from the profile panel', async ({ page }) => {
    await page.locator('.settings-entry').click();
    const modal = page.locator('.settings-modal');
    await expect(modal).toBeVisible();
    // Defaults tab is the entry point from the profile panel
    await expect(page.locator('.settings-modal .tab-btn:has-text("Defaults")')).toHaveClass(/active/);
  });

  test('provider settings persist to storage and re-seed on reopen', async ({ page }) => {
    await page.locator('.settings-entry').click();
    await page.locator('.tab-btn:has-text("Providers")').click();
    const card = page.locator('.provider-card').first(); // text provider
    // Use the custom preset for this round-trip: it is /v1-native, while the
    // agnes preset normalizes a pasted trailing /v1 away (host-root base).
    await card.locator('#prov-preset-text').selectOption('custom');
    await card.locator('#prov-url-text').fill('https://api.example.com/v1');
    await card.locator('#prov-key-text').fill('sk-test-key-123');

    // Dirty indicator shows, Save commits + persists
    await expect(page.locator('.settings-modal .save-hint.show')).toBeVisible();
    await page.locator('.settings-modal .btn-confirm').click();
    await expect(page.locator('.settings-modal')).toBeHidden();

    // Persisted (browser dev path → localStorage)
    const stored = await page.evaluate(() => localStorage.getItem('vm-settings-Test User'));
    expect(stored).toBeTruthy();
    const saved = JSON.parse(stored);
    expect(saved.providers.text.baseUrl).toBe('https://api.example.com/v1');
    expect(saved.providers.text.apiKey).toBe('sk-test-key-123');

    // Reopen: values re-seed into the draft and the card reads Configured
    await page.locator('.settings-entry').click();
    await page.locator('.tab-btn:has-text("Providers")').click();
    const card2 = page.locator('.provider-card').first();
    await expect(card2.locator('#prov-preset-text')).toHaveValue('custom');
    await expect(card2.locator('#prov-url-text')).toHaveValue('https://api.example.com/v1');
    await expect(card2.locator('#prov-key-text')).toHaveValue('sk-test-key-123');
    await expect(card2.locator('.status-badge.ok')).toHaveText('Configured');
  });

  test('API key input masks by default and toggles show/hide', async ({ page }) => {
    await page.locator('.settings-entry').click();
    await page.locator('.tab-btn:has-text("Providers")').click();
    const card = page.locator('.provider-card').first();
    const keyInput = card.locator('#prov-key-text');
    await keyInput.fill('secret');
    expect(await keyInput.getAttribute('type')).toBe('password');
    await card.locator('.mini-btn').click();
    expect(await keyInput.getAttribute('type')).toBe('text');
    await card.locator('.mini-btn').click();
    expect(await keyInput.getAttribute('type')).toBe('password');
  });

  test('new sessions inherit the saved generation defaults', async ({ page }) => {
    await page.locator('.settings-entry').click();
    await page.locator('#sd-fps').selectOption('30');
    await page.locator('.settings-modal .btn-confirm').click();
    await expect(page.locator('.settings-modal')).toBeHidden();

    // Project + session (browser dev → fallback creation path inherits defaults)
    await page.locator('.projects-panel .add-btn').click();
    await page.locator('input[placeholder*="project name"]').fill('P');
    await page.locator('.modal .btn-confirm').click();
    await page.locator('.add-session-btn').click();
    await page.locator('.session-item').first().click();

    // Tools panel FPS select reflects the inherited default (30)
    const fps = page.locator('.tools-panel .setting-select').first();
    await expect(fps).toHaveValue('30');
  });

  test('always-new-seed toggle defaults on and persists off', async ({ page }) => {
    await page.locator('.settings-entry').click();
    const box = page.locator('#sd-newseed');
    await expect(box).toBeChecked();
    await box.uncheck();
    await page.locator('.settings-modal .btn-confirm').click();
    await expect(page.locator('.settings-modal')).toBeHidden();

    const stored = await page.evaluate(() => localStorage.getItem('vm-settings-Test User'));
    expect(JSON.parse(stored).generationDefaults.alwaysNewSeed).toBe(false);
  });

  test('paid read-only video model shows a badge + limits in the provider card', async ({ page }) => {
    await page.locator('.settings-entry').click();
    await page.locator('.tab-btn:has-text("Providers")').click();
    const videoCard = page.locator('.provider-card').nth(2);
    await videoCard.locator('#prov-model-video').selectOption('agnes-video-2.5');
    await expect(videoCard.locator('.hint-readonly')).toBeVisible();
    await expect(videoCard.locator('.hint-readonly')).toContainText(/read-only/i);
    await expect(videoCard.locator('.field .hint').filter({ hasText: 'Limits' })).toContainText('2K');
  });
  test('provider status chip opens the modal at the Providers tab', async ({ page }) => {
    // The chip lives in the top bar; with the default (keyless) settings it
    // reports the unconfigured state. Clicking it must land on Providers.
    const chip = page.locator('.provider-chip');
    await expect(chip).toBeVisible();
    await expect(chip).toContainText('Provider not set');
    await chip.click();
    const modal = page.locator('.settings-modal');
    await expect(modal).toBeVisible();
    await expect(page.locator('.settings-modal .tab-btn:has-text("Providers")')).toHaveClass(/active/);
  });
});
