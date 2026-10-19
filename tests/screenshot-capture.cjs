/**
 * Screenshot: subject-strip in a prompt modal (the 0.7.7 key feature).
 * Dev server must be on :1420. Run: node tests/screenshot-capture.cjs
 * Output: img/screenshots/feature-subject-strip.png
 */
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'img', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

// Inline SVG data-URIs (no network, no fixtures).
function svgUri(label, c1, c2) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>` +
    `</linearGradient></defs>` +
    `<rect width="480" height="270" fill="url(#g)"/>` +
    `<text x="240" y="150" font-family="Segoe UI,Arial" font-size="64" ` +
    `font-weight="700" fill="#fff" text-anchor="middle" opacity="0.9">${label}</text>` +
    `</svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  // ── Workspace + project + session ─────────────────────────────────
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
  await page.waitForTimeout(1000);

  // ── Switch to Reference media mode → add 3 subject refs ───────────
  const refOpt = page.locator('.media-opt', { hasText: 'Reference' }).first();
  if (await refOpt.count() > 0) {
    await refOpt.click();
    await page.waitForSelector('.sr-add, .sr-row', { timeout: 6000 });
    await page.waitForTimeout(300);
  }

  async function addSubject(url) {
    const addBtn = page.locator('.sr-add').first();
    if (await addBtn.count() === 0) return;
    await addBtn.click();
    await page.waitForSelector('.modal-overlay', { timeout: 5000 });
    await page.locator('.modal-overlay input[aria-labelledby="sr-url-label"], .modal-overlay input[placeholder*="https"]').first()
      .fill(url);
    await page.locator('.modal-overlay .btn-confirm').click();
    await page.waitForTimeout(450);
    // Close the subject-ref modal (not the prompt modal).
    for (let i = 0; i < 4; i++) {
      if (await page.locator('.modal-overlay').count() > 0) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(350);
      } else break;
    }
  }
  await addSubject(svgUri('A', '#c86a1a', '#e8a13a'));
  await addSubject(svgUri('B', '#2a7a8a', '#40c0d0'));
  await addSubject(svgUri('C', '#7a3aa0', '#b05adc'));
  await page.waitForTimeout(500);

  // ── Add Global track → open global prompt modal (subject strip in footer)
  const addTrack = page.locator('.btn-add-track').first();
  if (await addTrack.count() > 0) {
    await addTrack.click();
    await page.waitForSelector('.dropdown-item', { timeout: 4000 }).catch(() => {});
    const globalItem = page.locator('.dropdown-item', { hasText: 'Global' }).first();
    if (await globalItem.count() > 0) {
      await globalItem.click();
      await page.waitForTimeout(500);
    }
  }

  const globalPill = page.locator('.pill-label', { hasText: 'Global' }).first();
  if (await globalPill.count() > 0) {
    await globalPill.click();
    await page.waitForSelector('.modal-overlay', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
  }

  // ── Capture ────────────────────────────────────────────────────────
  await page.screenshot({ path: path.join(OUT, 'feature-subject-strip.png') });
  console.log('✓ feature-subject-strip.png');

  await browser.close();
})().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
