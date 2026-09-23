#!/usr/bin/env node
// Download a pinned BtbN/buildffmpeg release asset into the Tauri resource
// tree (src-tauri/bin/ffmpeg/<platform>/). Run by `build:desktop:full`
// BEFORE the tauri build so the binary lands in the MSI's resource dir.
//
// Caches in build-state/ffmpeg-cache/ so repeated builds don't re-download.
// Network: requires internet (GitHub releases). The cache check makes it a
// no-op on a warm machine.

import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { get } from 'node:https';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// Only run main() when this file is the entry point (direct execution),
// not when it is imported by runner.mjs / stageFfmpegIfEnabled.
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cacheDir = path.join(root, 'build-state', 'ffmpeg-cache');
const resourceRoot = path.join(root, 'src-tauri', 'bin', 'ffmpeg');

// Pinned BtbN/buildffmpeg release. Bump the version to re-fetch; the cache
// is keyed on version + platform so an unchanged pin is a no-op.
const PinnedVersion = '7.1';
// BtbN publishes a per-platform archive; the windows x64 build is
// ffmpeg-master-latest-win64-gpl.zip (single ffmpeg.exe inside, flat).
const platform = process.platform === 'win32' ? 'win64'
  : process.platform === 'darwin' ? 'macos'
  : 'linux';
const urlByPlatform = {
  win64: 'https://github.com/BtbN/buildffmpeg/releases/download/win64-gpl-7.1/ffmpeg-master-latest-win64-gpl.zip',
  // macOS / Linux assets are named differently in the BtbN release; the
  // full-variant build is a Windows-first target for now. For non-Windows
  // dev machines, set FFMPEG_URL to override.
  macos: process.env.FFMPEG_URL || '',
  linux: process.env.FFMPEG_URL || '',
};

function die(msg) {
  console.error(`[fetch-ffmpeg] ${msg}`);
  process.exit(1);
}

/**
 * Throw an error instead of calling process.exit — used when this module is
 * imported by runner.mjs so that the runner can write a partial state record
 * and exit gracefully instead of the whole process dying mid-import.
 */
function throwStageError(msg) {
  throw new Error(`[fetch-ffmpeg] ${msg}`);
}

function destPath() {
  const exe = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  return path.join(resourceRoot, platform, exe);
}

async function main() {
  const url = urlByPlatform[platform];
  if (!url) {
    if (isDirectRun) {
      die(`no download URL for platform "${platform}". Set FFMPEG_URL=<release asset URL> and re-run, or build on Windows.`);
    } else {
      throwStageError(`no download URL for platform "${platform}". Set FFMPEG_URL=<release asset URL> and re-run, or build on Windows.`);
    }
  }

  mkdirSync(cacheDir, { recursive: true });
  mkdirSync(path.join(resourceRoot, platform), { recursive: true });

  const cacheKey = `${PinnedVersion}-${platform}`;
  const cacheMeta = path.join(cacheDir, `${cacheKey}.meta.json`);
  const cachedZip = path.join(cacheDir, `${cacheKey}.zip`);

  // 1) Already extracted into the resource tree? Done.
  if (existsSync(destPath())) {
    console.log(`[fetch-ffmpeg] ${destPath()} already present — using it.`);
    return;
  }

  // 2) Need to download. Cache-check the zip.
  let downloaded = false;
  if (existsSync(cachedZip) && existsSync(cacheMeta)) {
    try {
      const meta = JSON.parse(readFileSync(cacheMeta, 'utf8'));
      if (meta.version === PinnedVersion && meta.platform === platform) {
        console.log(`[fetch-ffmpeg] cache hit (${cachedZip}) — skipping download.`);
      } else {
        console.log(`[fetch-ffmpeg] cache stale (${meta.version} ≠ ${PinnedVersion}) — re-downloading.`);
        rmSync(cachedZip, { force: true });
      }
    } catch {
      rmSync(cachedZip, { force: true });
    }
  }
  if (!existsSync(cachedZip)) {
    console.log(`[fetch-ffmpeg] downloading ${url} …`);
    await downloadTo(url, cachedZip);
    downloaded = true;
    writeFileSync(cacheMeta, JSON.stringify({ version: PinnedVersion, platform, url }, null, 2));
  }

  // 3) Extract ffmpeg(.exe) out of the zip into the resource tree.
  // The BtbN windows zip has a flat layout: ffmpeg.exe, ffprobe.exe, README.
  // We only need ffmpeg.exe. Use a small dependency-free approach: shell out
  // to the platform's unzip tool (Windows: Expand-Archive via PowerShell;
  // unix: unzip). If the tool is missing, fail loudly with guidance.
  const extracted = await extractZip(cachedZip, path.join(resourceRoot, platform));
  if (extracted && !existsSync(destPath())) {
    if (isDirectRun) {
      die(`extract finished but ${destPath()} is still missing — asset layout changed?`);
    } else {
      throwStageError(`extract finished but ${destPath()} is still missing — asset layout changed?`);
    }
  }
  console.log(`[fetch-ffmpeg] ${existsSync(destPath()) ? 'staged' : 'FAILED'} → ${destPath()}`);
}

function downloadTo(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    const req = get(url, { headers: { 'User-Agent': 'visionmachine-build' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // GitHub release assets redirect; follow one hop.
        file.close();
        rmSync(dest, { force: true });
        downloadTo(res.headers.location, dest).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        rmSync(dest, { force: true });
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    });
    req.on('error', (e) => { file.close(); reject(e); });
  });
}

async function extractZip(zipPath, outDir) {
  const { spawn } = await import('node:child_process');
  if (process.platform === 'win32') {
    await new Promise((resolve, reject) => {
      const child = spawn('powershell', [
        '-NoProfile', '-Command',
        `Expand-Archive -LiteralPath '${zipPath.replace(/\\/g, '\\\\')}' -DestinationPath '${outDir.replace(/\\/g, '\\\\')}' -Force`,
      ]);
      child.on('close', (code) => (code === 0 ? resolve(true) : reject(new Error(`Expand-Archive exited ${code}`))));
      child.on('error', reject);
    });
    return true;
  }
  // unix: prefer `unzip`, fall back to `python3 -m zipfile`.
  await new Promise((resolve, reject) => {
    const child = spawn('unzip', ['-o', zipPath, '-d', outDir]);
    child.on('close', (code) => {
      if (code === 0) return resolve(true);
      const py = spawn('python3', ['-m', 'zipfile', '-e', zipPath, outDir]);
      py.on('close', (c2) => (c2 === 0 ? resolve(true) : reject(new Error(`unzip + python3 both failed`))));
      py.on('error', reject);
    });
    child.on('error', reject);
  });
  return true;
}

if (isDirectRun) {
  main().catch((e) => die(e.message));
}

/**
 * Stage the ffmpeg binary only when the `bundled-ffmpeg` cargo feature is
 * requested (full-variant ship). The tiny variant passes no features (or a
 * csv that omits it) → this is a no-op and the build ships an empty
 * placeholder tree. Exported for the build runner (runner.mjs) so staging
 * happens BEFORE the tauri build picks up the resource glob.
 *
 * Throws on failure instead of calling process.exit so runner.mjs can
 * write a partial state record and exit with a clean error.
 */
export async function stageFfmpegIfEnabled({ root, features }) {
  if (!features || !String(features).includes('bundled-ffmpeg')) {
    console.log('[fetch-ffmpeg] bundled-ffmpeg feature not set — skipping binary stage (tiny variant).');
    return;
  }
  // Re-run the download/stage main() so a version bump re-fetches; warm
  // cache → no-op. When imported (not direct-run), main() throws instead of
  // exiting the process on failure.
  await main();
}
