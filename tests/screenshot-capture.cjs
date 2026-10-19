/**
 * Feature-focus screenshots for the 0.7.7 README: subjects, lightbox,
 * keyframe preview, and the subject-strip in a prompt modal.
 * Dev server on :1420. Run: node tests/screenshot-capture.cjs
 */
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'img', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

// Inline SVG data-URIs render in <img> with zero network.
function svgUri(label, bg1, bg2) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/>` +
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

  const shotFull = async (n) => { await page.screenshot({ path: path.join(OUT, n + '.png') }); console.log('  ✓', n); };
  const shotEl = async (n, sel) => {
    try {
      await page.locator(sel).first().screenshot({ path: path.join(OUT, n + '.png') });
      console.log('  ✓', n, '<' + sel + '>');
    } catch (e) {
      console.log('  ✗', n, '—', e.message.split('\n')[0]);
    }
  };
  const dismiss = async () => {
    for (let i = 0; i < 4; i++) {
      if (await page.locator('.modal-overlay').count() > 0) {
        await page.keyboard.press('Escape'); await page.waitForTimeout(350);
      } else break;
    }
  };

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

  // ── Clean full-workspace hero (before any modal or media-mode switch)
  await shotFull('feature-workspace');

  // ── Switch the pipe to Reference media mode (shows SUBJECT REFS row)
  const refOpt = page.locator('.media-opt', { hasText: 'Reference' }).first();
  if (await refOpt.count() > 0) {
    await refOpt.click();
    await page.waitForSelector('.sr-add, .sr-row', { timeout: 6000 });
    await page.waitForTimeout(300);
  }

  // ── Add 3 subject refs with data-URI images ──────────────────────
  async function addSubject(url) {
    const addBtn = page.locator('.sr-add').first();
    if (await addBtn.count() === 0) return;
    await addBtn.click();
    await page.waitForSelector('.modal-overlay', { timeout: 5000 });
    // Modal defaults to 'url' preset — fill the Image URL field.
    await page.locator('.modal-overlay input[aria-labelledby="sr-url-label"], .modal-overlay input[placeholder*="https"]').first()
      .fill(url);
    await page.locator('.modal-overlay .btn-confirm').click();
    await page.waitForTimeout(450);
    await dismiss();
  }
  await addSubject(svgUri('A', '#c86a1a', '#e8a13a'));
  await addSubject(svgUri('B', '#2a7a8a', '#40c0d0'));
  await addSubject(svgUri('C', '#7a3aa0', '#b05adc'));
  await page.waitForTimeout(500);

  // ── Capture: the subject-refs row with thumbnails ────────────────
  await shotEl('feature-subject-refs', '.sr-row');

  // ── Open the lightbox on the first subject thumbnail ─────────────
  const firstImg = page.locator('.sr-img').first();
  if (await firstImg.count() > 0) {
    await firstImg.click();
    await page.waitForSelector('.lightbox', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    await shotFull('feature-lightbox');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }

  // ── Switch back to Keyframes mode and add a keyframe with a URL ───
  const kfOpt = page.locator('.media-opt', { hasText: 'Keyframes' }).first();
  if (await kfOpt.count() > 0) {
    await kfOpt.click();
    await page.waitForSelector('.kf-add, .kf-chip', { timeout: 6000 });
    await page.waitForTimeout(300);
  }
  const kfEmpty = page.locator('.kf-chip.kf-empty').first();
  if (await kfEmpty.count() > 0) {
    await kfEmpty.click();
    await page.waitForSelector('.modal-overlay', { timeout: 5000 });
    // Keyframe modal: pick URL preset + fill.
    const urlBtn = page.locator('.modal-overlay .mode-btn', { hasText: 'URL' }).first();
    if (await urlBtn.count() > 0) await urlBtn.click();
    await page.locator('.modal-overlay input[aria-labelledby="kf-url-label"], .modal-overlay input[placeholder*="https"]').first()
      .fill(svgUri('K', '#e8a13a', '#5a3a80'));
    await page.locator('.modal-overlay .btn-confirm').click();
    await page.waitForTimeout(600);
    await shotEl('feature-keyframe-preview', '.kf-row');
    await dismiss();
  }

  // ── Subject strip in a prompt modal (add a Global track, edit it) ─
  // The global prompt modal carries the compact SubjectRefStrip footer.
  // [+ add-track] menu → Global, then click the global pill to open it.
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
  // Click the global pill to open the global prompt modal.
  const globalPill = page.locator('.pill-label', { hasText: 'Global' }).first();
  if (await globalPill.count() > 0) {
    await globalPill.click();
    await page.waitForSelector('.modal-overlay', { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
    await shotFull('feature-subject-strip');
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
