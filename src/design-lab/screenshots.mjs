// Design Lab screenshot runner — drives the REAL dev build (vite dev server)
// at the `#/design-lab` route and captures each template at each fixed
// evaluation viewport. Produces the "consistent screenshots of the same
// session at the same dimensions" deliverable for the three templates.
//
// Run: node src/design-lab/screenshots.mjs
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(__dirname, 'screenshots');
const PORT = 1450;
const BASE = `http://localhost:${PORT}/#/design-lab`;

const TEMPLATES = [
	{ id: 'a', name: 'A Open Canvas' },
	{ id: 'b', name: 'B Editorial' },
	{ id: 'c', name: 'C Precision' },
];
const VIEWPORTS = [
	{ w: 1440, h: 900, idx: 0 },
	{ w: 1280, h: 800, idx: 1 },
	{ w: 1120, h: 700, idx: 2 },
];

fs.mkdirSync(OUT_DIR, { recursive: true });

// ── start the dev server ──────────────────────────────────────────────────
const vite = spawn(process.execPath, [path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js'), 'dev', '--port', String(PORT)], {
	cwd: repoRoot,
	stdio: 'inherit',
	shell: false,
});

async function waitReady(timeoutMs = 60_000) {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		try {
			const res = await fetch(`http://localhost:${PORT}/`);
			if (res.ok) return;
		} catch {}
		await new Promise((r) => setTimeout(r, 400));
	}
	throw new Error(`vite dev server did not become ready on :${PORT} in ${timeoutMs}ms`);
}

// Use an already-cached Chromium build (no `npx playwright install` download).
// Prefer the headless shell whose revision the installed playwright expects;
// fall back to the full Chromium build.
function cachedChromiumExe() {
	const base = path.join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
	const candidates = [
		'chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe',
		'chromium-1243/chrome-win64/chrome.exe',
		'chromium_headless_shell-1234/chrome-headless-shell-win64/chrome-headless-shell.exe',
		'chromium-1234/chrome-win64/chrome.exe',
	];
	for (const c of candidates) {
		const p = path.join(base, c);
		if (fs.existsSync(p)) return p;
	}
	return undefined;
}

try {
	await waitReady();
	console.log('[shots] dev server ready, launching chromium…');
	const exe = cachedChromiumExe();
	const browser = exe
		? await chromium.launch({ executablePath: exe })
		: await chromium.launch();

	for (const vp of VIEWPORTS) {
		// A browser window big enough to host the fixed stage + the switcher bar.
		const ctx = await browser.newContext({
			viewport: { width: vp.w + 80, height: vp.h + 220 },
			deviceScaleFactor: 1,
		});
		const page = await ctx.newPage();
		await page.goto(BASE, { waitUntil: 'networkidle' });
		// wait for the lab to render + the coordinate canvas to measure
		await page.waitForSelector('.dl-canvas .dl-coord', { timeout: 15_000 });
		// pick this viewport preset, then re-measure so the timeline lays out
		await page.locator('.lab-controls .lab-group').first().locator('.lab-btn').nth(vp.idx).click();
		await page.waitForTimeout(250);

		for (const t of TEMPLATES) {
			await page.locator('.lab-tab').nth(TEMPLATES.findIndex((x) => x.id === t.id)).click();
			await page.waitForSelector(`.dl-canvas[data-template="${t.id}"]`, { timeout: 5000 });
			// let the ResizeObserver settle the coordinate canvas to a real width
			await page.waitForFunction(
				() => {
					const el = document.querySelector('.dl-canvas .dl-zone');
					return el && el.getBoundingClientRect().width > 0;
				},
				{ timeout: 5000 },
			);
			await page.waitForTimeout(200);
			const stage = page.locator('.lab-stage').first();
			const file = path.join(OUT_DIR, `template-${t.id}@${vp.w}x${vp.h}.png`);
			await stage.screenshot({ path: file });
			console.log(`[shots] saved ${path.relative(repoRoot, file)}`);
		}
		await ctx.close();
	}

	await browser.close();
	console.log('[shots] done.');
} finally {
	vite.kill('SIGTERM');
}
