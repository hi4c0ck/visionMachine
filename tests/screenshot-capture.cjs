/**
 * Screenshot capture for README / 0.7.7 feature showcase.
 * Dev server must be running on :1420.
 * Run: node tests/screenshot-capture.cjs   → writes img/screenshots/
 */
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'img', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  const shotFull = async (name) => {
    await page.screenshot({ path: path.join(OUT, name + '.png') });
    console.log('  ✓', name);
  };
  const shotEl = async (name, selector) => {
    try {
      await page.locator(selector).first().screenshot({ path: path.join(OUT, name + '.png') });
      console.log('  ✓', name, '<' + selector + '>');
    } catch (e) {
      console.log('  ✗', name, '—', e.message.split('\n')[0]);
    }
  };
  const dismiss = async () => {
    for (let i = 0; i < 3; i++) {
      if (await page.locator('.modal-overlay').count() > 0) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(350);
      } else break;
    }
  };

  // ── Workspace + project + session ───────────────────────────────
  await page.goto('http://localhost:1420');
  await page.locator('input[placeholder*="name"]').fill('Test User');
  await page.getByRole('button', { name: 'Get Started' }).click();
  await page.waitForSelector('.workspace', { timeout: 15000 });
  await page.locator('.projects-panel .add-btn').click();
  await page.waitForSelector('.modal', { timeout: 5000 });
  await page.locator('input[placeholder*="project name"]').fill('Demo Project');
  await page.locator('.modal .btn-confirm').click();
  await page.waitForSelector('.project-name', { timeout: 5000 });
  await page.locator('.add-session-btn').click();
  await page.waitForSelector('.session-item', { timeout: 5000 });
  await page.locator('.session-item').first().click();
  await page.waitForSelector('.composer-panel', { timeout: 15000 });
  await page.waitForTimeout(1000); // let chrome sprite inject

  await shotFull('01-workspace-full');
  await shotEl('02-projects-panel', '.projects-panel');
  await shotEl('03-profile-panel', '.profile-panel');
  await shotEl('04-frame-panel', '.frame');
  await shotEl('05-toolspanel-session', '.tools-panel');
  await shotEl('06-composer-panel', '.composer-panel');

  // ── Pipe-level breadcrumb + corner notch ────────────────────────
  if (await page.locator('.pipe').count() > 0) {
    await page.locator('.pipe').first().click();
    await page.waitForTimeout(500);
    await shotEl('07-toolspanel-pipe', '.tools-panel');
    await page.locator('.pipe').first().click();
    await page.waitForTimeout(300);
  }

  // ── Keyframe modal ──────────────────────────────────────────────
  if (await page.locator('.kf-chip.kf-empty').count() > 0) {
    await page.locator('.kf-chip.kf-empty').first().click();
    await page.waitForSelector('.modal-overlay', { timeout: 5000 });
    await page.waitForTimeout(400);
    await shotEl('08-keyframe-modal', '.modal-overlay');
    await dismiss();
  }

  // ── Subject-ref modal ───────────────────────────────────────────
  if (await page.locator('.sr-add').count() > 0) {
    await page.locator('.sr-add').first().click();
    await page.waitForSelector('.modal-overlay', { timeout: 5000 });
    await page.waitForTimeout(400);
    await shotEl('09-subjectref-modal', '.modal-overlay');
    await dismiss();
  }

  // ── Settings modal ─────────────────────────────────────────────
  await dismiss();
  if (await page.locator('.profile-icon.settings').count() > 0) {
    await page.locator('.profile-icon.settings').first().click({ timeout: 4000 }).catch(() => {});
    await page.waitForSelector('.modal-overlay', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(400);
    await shotEl('10-settings-modal', '.modal-overlay');
    await dismiss();
  }

  await browser.close();

  console.log('\nCaptured:');
  for (const f of fs.readdirSync(OUT).sort()) {
    const sz = fs.statSync(path.join(OUT, f)).size;
    console.log('  ' + f + '  (' + Math.round(sz / 1024) + ' KB)');
  }
})().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
