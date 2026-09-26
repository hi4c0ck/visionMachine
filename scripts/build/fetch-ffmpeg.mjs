#!/usr/bin/env node
// Download a pinned BtbN/FFmpeg-Builds release asset into the Tauri sidecar
// staging directory (src-tauri/binaries/ffmpeg-<target-triple>), run by
// `build:desktop:full` BEFORE the tauri build so the binary is picked up
// by Tauri's `bundle.externalBin` (sidecar) mechanism instead of a
// resource glob.
//
// Sidecars are filtered + renamed at build time based on the active target
// triple, so the staging target must match the target being compiled, not
// the host platform. Determine it three ways, in order:
//   1. explicit argument: node fetch-ffmpeg.mjs x86_64-pc-windows-msvc
//   2. TARGET_TRIPLE env var (what CI passes per matrix runner)
//   3. fallback: the host's triple (only correct when building for the host)
//
// Asset source: BtbN/FFmpeg-Builds "latest" release (rolling auto-build).
// Pinned per-asset via PinnedAssets below — bump the tag or asset name to
// re-fetch; the cache is keyed on tag + target so an unchanged pin is a no-op.
//
// Caches in build-state/ffmpeg-cache/ so repeated builds don't re-download.
// Network: requires internet (GitHub releases). The cache check makes it a
// no-op on a warm machine.

import { createHash } from 'node:crypto';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  readSync,
  closeSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { get } from 'node:https';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// Only run main() when this file is the entry point (direct execution),
// not when it is imported by runner.mjs / stageFfmpegIfEnabled.
const isDirectRun =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cacheDir = path.join(root, 'build-state', 'ffmpeg-cache');
// Tauri sidecar convention: sidecars live in src-tauri/binaries/ named
// `ffmpeg-<target-triple>` (+ `.exe` on Windows targets). Tauri adds the
// target suffix / extension itself from `bundle.externalBin:
// ["binaries/ffmpeg", "binaries/ffprobe"]`; this script just writes the
// files under the names Tauri will look for. BOTH executables are staged:
// composition prefers a real `ffprobe` over the ffmpeg-stderr metadata
// fallback, and the bundled-ffmpeg variant ships the pair as a unit.
//
// Note: `binariesDir` is resolved from this file's location — override the
// staging directory (tests) via `FFMPEG_STAGING_DIR`.
const binariesDir =
  process.env.FFMPEG_STAGING_DIR || path.join(root, 'src-tauri', 'binaries');

// ── Pinned asset table ─────────────────────────────────────────────────────
// BtbN/FFmpeg-Builds publishes a rolling "latest" release with stable asset
// names for each OS/arch/variant combination. We pin to a specific ffmpeg
// major-version asset for determinism (the "master" assets track the bleeding
// edge and can break between builds).
//
// URL pattern:
//   https://github.com/BtbN/FFmpeg-Builds/releases/download/<tag>/<asset>
//
// `<tag>` is the release tag. "latest" always resolves to the most recent
// auto-build. For a fully reproducible pin, replace "latest" with a specific
// autobuild tag (e.g. "autobuild-2026-09-23-14-55") — check the repo's
// release list to find the tag matching your desired ffmpeg version.
//
// We use the "-shared" variants: they are smaller (~80 MB win64 vs ~185 MB
// static) and link against the same shared libs BtbN bundles in the archive.
// The ffmpeg.exe/ffmpeg binary in the archive is already linked against
// the DLLs/symlinks shipped alongside it in the same archive, and we
// extract the whole bin/ tree so the shared libs land next to the binary.
// However Tauri sidecars ship a SINGLE file next to the exe — so for the
// shared variant we must use the "-shared" archive and extract only the
// ffmpeg binary; it will NOT run on a clean system without the DLLs.
//
// Therefore: use the STATIC variant (no suffix) — it bundles all codec libs
// internally and ships as a single self-contained binary.
//
// PinnedVersions: the ffmpeg version baked into the asset name.
// "9.0" → assets named ffmpeg-n9.0-latest-<plat>-gpl-9.0.{zip|tar.xz}
// "8.1" → assets named ffmpeg-n8.1-latest-<plat>-gpl-8.1.{zip|tar.xz}
// Bump this to re-fetch a different ffmpeg generation.
const PinnedFfmpegVersion = '9.0';
const ReleaseTag = 'autobuild-2026-09-23-14-55'; // immutable FFmpeg build tag
// SHA-256 published by the GitHub release API for the current pinned asset.
// Update this together with ReleaseTag when deliberately refreshing FFmpeg.
const PinnedAssetSha256 = {
  'ffmpeg-N-126782-gdc52424419-win64-gpl.zip':
    '91a1dbfa89b77235a8c327b86fc36e70f69d3bfed0c24ce840452cd43ce26366',
  'ffmpeg-N-126782-gdc52424419-winarm64-gpl.zip':
    '845f63e8a28acff3aba5a6111f0a82fcfd6781fc6dd5e8004a1fff5cd5ce80f0',
  'ffmpeg-N-126782-gdc52424419-linux64-gpl.tar.xz':
    '6b4a8a5d850ce690a87122f298ab7a5f6cbb07c8898bf038192e5885f5f15f54',
  'ffmpeg-N-126782-gdc52424419-linuxarm64-gpl.tar.xz':
    'b02da570798ddf4519ee0d68821e113646d20e9aa3d6e4bb4272891768fff68a',
};

// Per-EXECUTABLE SHA-256 pins, keyed by `<ReleaseTag>/<asset>/<tool>`.
// The archive-level hash (above) proves the download is intact, but it is
// not enough for the two executables we extract from it: a tampered or
// partially-corrupted archive whose inner zip entry was swapped would still
// match the archive hash. Each staged sidecar is re-hashed and compared
// against its entry here before it is allowed to ship in a bundle. The BtbN
// GPL asset ships ffmpeg + ffprobe as one immutable pair per release tag, so
// both hashes are pinned together with ReleaseTag / PinnedAssetSha256.
const PinnedExecutableSha256 = {
  'autobuild-2026-09-23-14-55/ffmpeg-N-126782-gdc52424419-win64-gpl.zip/ffmpeg':
    '09948d4cdd0650da6ff5a87577469f2a218dc2615ae379f8f734d24c49de0f73',
  'autobuild-2026-09-23-14-55/ffmpeg-N-126782-gdc52424419-win64-gpl.zip/ffprobe':
    'a6618e99bb58869ded3c6f37b53aa1a8d701c3591dbb7b5b317d47369c112be2',
};

// Pinned asset URLs per target triple prefix.
// Windows x64:  .zip   (static GPL, single self-contained ffmpeg.exe)
// Linux x64:    .tar.xz (static GPL, single self-contained ffmpeg binary)
// Linux arm64:  .tar.xz
// macOS:        BtbN does NOT publish macOS assets — use FFMPEG_URL override
//               or a static macOS build from another source (e.g. evermeet).
function assetForTarget(target) {
  const isWin = target.includes('windows');
  const arch = target.split('-')[0];

  if (isWin) {
    // Immutable release assets use the N-<revision>-g<commit> naming scheme.
    const plat = arch === 'aarch64' ? 'winarm64' : 'win64';
    return {
      url: `https://github.com/BtbN/FFmpeg-Builds/releases/download/${ReleaseTag}/ffmpeg-N-126782-gdc52424419-${plat}-gpl.zip`,
      ext: 'zip',
      arch: plat,
    };
  }

  if (target.includes('linux') || target.includes('gnu') || target.includes('musl')) {
    const plat = arch === 'aarch64' ? 'linuxarm64' : 'linux64';
    return {
      url: `https://github.com/BtbN/FFmpeg-Builds/releases/download/${ReleaseTag}/ffmpeg-N-126782-gdc52424419-${plat}-gpl.tar.xz`,
      ext: 'tar.xz',
      arch: plat,
    };
  }

  // macOS / unknown: no built-in asset. Override via FFMPEG_URL_<target> or
  // FFMPEG_URL env var. BtbN does not publish darwin assets.
  return null;
}

// Allow per-target override so CI can point a specific target at a
// different asset (e.g. a custom static macOS build) without a code change.
function urlForTarget(target) {
  const envKey = `FFMPEG_URL_${target.replace(/[^A-Za-z0-9]+/g, '_')}`;
  const override = process.env[envKey] || process.env.FFMPEG_URL;
  if (override) return { url: override, ext: extFromUrl(override), arch: target };
  return assetForTarget(target);
}

function extFromUrl(url) {
  if (url.endsWith('.tar.xz')) return 'tar.xz';
  if (url.endsWith('.zip')) return 'zip';
  return 'unknown';
}

// Resolve the effective target triple: explicit > TARGET_TRIPLE env > host.
function hostTriple() {
  // Matches rustc's default target on the common cases we ship for.
  if (process.platform === 'win32') {
    return process.arch === 'x64'
      ? 'x86_64-pc-windows-msvc'
      : process.arch === 'arm64'
        ? 'aarch64-pc-windows-msvc'
        : 'i686-pc-windows-msvc';
  }
  if (process.platform === 'darwin') {
    return process.arch === 'arm64'
      ? 'aarch64-apple-darwin'
      : 'x86_64-apple-darwin';
  }
  // Linux: assume gnu flavor (what most CI runners use); musl targets
  // should be passed explicitly via arg / TARGET_TRIPLE.
  return process.arch === 'arm64'
    ? 'aarch64-unknown-linux-gnu'
    : 'x86_64-unknown-linux-gnu';
}

function resolveTarget(explicit) {
  if (explicit) return explicit;
  if (process.env.TARGET_TRIPLE) return process.env.TARGET_TRIPLE;
  return hostTriple();
}

function sidecarNames(target) {
  const base = target;
  const ext = target.includes('windows') ? '.exe' : '';
  return [
    `ffmpeg-${base}${ext}`,
    `ffprobe-${base}${ext}`,
  ];
}

function sidecarName(target) {
  return sidecarNames(target)[0];
}

function destPaths(target) {
  return sidecarNames(target).map((name) => path.join(binariesDir, name));
}

function destPath(target) {
  return path.join(binariesDir, sidecarName(target));
}

function noUrlMsg(target) {
  return (
    `no download URL for target "${target}". BtbN publishes Windows + Linux assets; ` +
    `macOS must be overridden. Set FFMPEG_URL=<asset URL> (or FFMPEG_URL_${target.replace(/[^A-Za-z0-9]+/g, '_')}) ` +
    `and re-run.`
  );
}

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

// Core staging: download (cache-aware) + extract + rename into the
// target-triple sidecar name. Throws on failure (caller decides whether to
// exit the process or propagate the error).
async function stageForTarget(target, { throwOnNoUrl = true } = {}) {
  const asset = urlForTarget(target);
  if (!asset) {
    const msg = noUrlMsg(target);
    if (throwOnNoUrl) throwStageError(msg);
    throw new Error(msg);
  }

  const { url, ext } = asset;
  const archiveExt = ext === 'tar.xz' ? '.tar.xz' : '.zip';

  mkdirSync(cacheDir, { recursive: true });
  mkdirSync(binariesDir, { recursive: true });

  const dest = destPath(target);
  const cacheKey = `${PinnedFfmpegVersion}-${ReleaseTag}-${target}`;
  const cacheMeta = path.join(cacheDir, `${cacheKey}.meta.json`);
  const cachedArchive = path.join(cacheDir, `${cacheKey}${archiveExt}`);

  // 1) Both sidecars already staged? Done.
  const ffprobeDest = destPaths(target)[1];
  if (existsSync(dest) && existsSync(ffprobeDest)) {
    console.log(
      `[fetch-ffmpeg] ${path.relative(root, dest)} + ${path.relative(root, ffprobeDest)} already present — using them.`,
    );
    return;
  }
  // A half-staged pair from a failed run: remove so re-staging is clean.
  if (existsSync(dest)) {
    rmSync(dest, { force: true });
  }

  // 2) Need to download. Cache-check the archive.
  if (existsSync(cachedArchive) && existsSync(cacheMeta)) {
    try {
      const meta = JSON.parse(readFileSync(cacheMeta, 'utf8'));
      if (meta.ffmpegVersion === PinnedFfmpegVersion && meta.target === target) {
        console.log(
          `[fetch-ffmpeg] cache hit (${path.relative(root, cachedArchive)}) — skipping download.`,
        );
      } else {
        console.log(
          `[fetch-ffmpeg] cache stale (${meta.ffmpegVersion} ≠ ${PinnedFfmpegVersion}) — re-downloading.`,
        );
        rmSync(cachedArchive, { force: true });
      }
    } catch {
      rmSync(cachedArchive, { force: true });
    }
  }
  if (!existsSync(cachedArchive)) {
    console.log(`[fetch-ffmpeg] downloading ${url} …`);
    await downloadTo(url, cachedArchive);
    assertArchiveSha256(cachedArchive, url);
    writeFileSync(
      cacheMeta,
      JSON.stringify({ ffmpegVersion: PinnedFfmpegVersion, target, url }, null, 2),
    );
  }
  // The `finally` of a FAILED extract stage dropped the cached archive, but
  // the download is expensive — keep the verified archive in cache so a
  // re-stage after a transient extract failure does not re-download 200 MB.
  // (On success the archive is intentionally dropped, as before.)

  // 3) Extract ffmpeg(.exe) out of the archive into a scratch dir, then
  // rename into the target-triple sidecar name.
  //
  // The BtbN archive layout (both .zip and .tar.xz) is:
  //   ffmpeg-n<version>-latest-<plat>-gpl-<version>/
  //     bin/ffmpeg(.exe)          ← we want this
  //     bin/ffprobe(.exe)
  //     lib/…  doc/…  LICENSE   ← we discard the rest
  //
  // For the static GPL variant the binary in bin/ is self-contained
  // (all codec libs linked in).
  const outDir = path.join(binariesDir, `.extract-${target}`);
  mkdirSync(outDir, { recursive: true });
  try {
    if (ext === 'tar.xz') {
      await extractTarXz(cachedArchive, outDir);
    } else {
      await extractZip(cachedArchive, outDir);
    }
    const extracted = findFfmpegExec(outDir, target, 'ffmpeg');
    if (!extracted) {
      // Diagnostic dump so the next failure is easy to triage.
      let listing = '';
      try {
        const walk = (d, depth = 0) => {
          for (const e of readdirSync(d)) {
            const full = path.join(d, e);
            let st;
            try {
              st = statSync(full);
            } catch {
              continue;
            }
            listing += `${'  '.repeat(depth)}${e} (${st.size}B)\n`;
            if (depth < 4 && st.isDirectory()) walk(full, depth + 1);
          }
        };
        walk(outDir);
      } catch {
        listing = '(could not list outDir)';
      }
      throwStageError(
        `extract finished but no ffmpeg binary found inside ${url} — ` +
          `asset layout changed? Contents of ${path.relative(root, outDir)}:\n${listing}`,
      );
    }
    // Stage BOTH sidecars from the same archive: the BtbN GPL asset always
    // ships ffmpeg AND ffprobe in the same bin/ dir. Composition prefers a
    // real ffprobe over the ffmpeg-stderr metadata fallback, so the full
    // variant ships the pair as a unit. Deterministic SHA-256 verification
    // (pinned below) guards each staged executable against a corrupted or
    // swapped archive before it ships in a bundle.
    const ffprobeSource = findFfmpegExec(outDir, target, 'ffprobe');
    if (!extracted || !ffprobeSource) {
      throwStageError(
        `no ${!extracted ? 'ffmpeg' : 'ffprobe'} executable found inside ${url} — ` +
          `asset layout changed? the full variant requires both ffmpeg and ffprobe sidecars.`,
      );
    }
    const assetName = path.basename(new URL(url).pathname);
    renameSync(extracted, dest);
    assertRealBinary(dest);
    assertExecutableSha256(dest, 'ffmpeg', assetName);
    const ffprobeDest = destPaths(target)[1];
    renameSync(ffprobeSource, ffprobeDest);
    assertRealBinary(ffprobeDest);
    assertExecutableSha256(ffprobeDest, 'ffprobe', assetName);
    console.log(`[fetch-ffmpeg] staged ffprobe → ${path.relative(root, ffprobeDest)}`);
  } catch (e) {
    // Keep the verified cached archive on failure so a re-stage is a no-op
    // download (only the extract is retried). The old behavior deleted it,
    // forcing a 200 MB re-download for a transient extract glitch.
    rmSync(outDir, { recursive: true, force: true });
    throw e;
  }
  console.log(`[fetch-ffmpeg] staged → ${path.relative(root, dest)}`);
}

// Recursively find a named *executable* (ffmpeg or ffprobe) inside the
// extraction dir. The BtbN archive layout is a top-level version folder with
// a bin/ subdir:
//   <asset>/bin/ffmpeg(.exe)   ← the real binaries
//   <asset>/bin/ffprobe(.exe)
//   <asset>/doc/*.html         ← docs (NOT binaries)
//
// Two passes, BFS shallow-first:
//   1. Exact bare name (ffmpeg.exe / ffprobe.exe on Windows, no extension on
//      unix) — always where BtbN puts the executable.
//   2. Versioned/suffixed executable only: must end in .exe (Windows) or
//      have no extension (unix), so HTML/doc files never match.
function findFfmpegExec(dir, target, tool = 'ffmpeg') {
  const isWin = target.includes('windows');
  const wanted = isWin ? `${tool}.exe` : tool;
  const re = new RegExp(`^${tool}([-._][A-Za-z0-9.]+)?(\\.exe)?$`, 'i');
  // Pass-2 name test: an executable, not a doc file.
  const isExecName = (e) =>
    isWin
      ? new RegExp(`^${tool}([-._][A-Za-z0-9.]+)?\\.exe$`, 'i').test(e)
      : re.test(e) && !e.includes('.');
  // BFS (queue, not stack) so shallower hits win: bin/ffmpeg.exe at depth 2
  // is preferred over anything buried deeper.
  const queue = [dir];
  let foundExec = null;
  let foundAny = null;
  while (queue.length) {
    const d = queue.shift();
    let entries;
    try {
      entries = readdirSync(d);
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(d, e);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        queue.push(full);
        continue;
      }
      if (e === wanted) {
        foundExec = full;
        break;
      }
      if (!foundAny && isExecName(e)) {
        foundAny = full;
      }
    }
    if (foundExec) break;
  }
  return foundExec || foundAny;
}

async function main() {
  const target = resolveTarget(process.argv[2]);
  console.log(
    `[fetch-ffmpeg] target triple: ${target} (sidecar names: ${sidecarNames(target).join(', ')})`,
  );
  await stageForTarget(target, { throwOnNoUrl: false });
}

function downloadTo(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    const req = get(
      url,
      { headers: { 'User-Agent': 'visionmachine-build' } },
      (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          // GitHub release assets redirect; follow one hop.
          file.close();
          rmSync(dest, { force: true });
          const loc = res.headers.location;
          if (!loc) {
            reject(new Error(`redirect for ${url} has no location header`));
            return;
          }
          downloadTo(loc, dest).then(resolve, reject);
          return;
        }
        // Defensively treat a non-asset response (e.g. GitHub HTML error
        // page returned with 200) as a failure instead of writing garbage.
        const isAsset = res.headers['content-type']?.includes('octet-stream') ||
          res.headers['content-type']?.includes('application/zip') ||
          res.headers['content-type']?.includes('application/x-xz') ||
          res.headers['content-type']?.includes('application/octet-stream');
        if (!isAsset) {
          file.close();
          rmSync(dest, { force: true });
          reject(
            new Error(
              `unexpected content-type "${res.headers['content-type']}" for ${url} — ` +
                `got HTTP ${res.statusCode}, not an asset. ` +
                `The release tag or asset name may be wrong.`,
            ),
          );
          return;
        }
        if (res.statusCode !== 200) {
          file.close();
          rmSync(dest, { force: true });
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      },
    );
    req.on('error', (e) => {
      file.close();
      reject(e);
    });
  });
}

// Guard: verify the staged sidecar is a real binary, not an HTML error page
// or other non-executable content that a broken download / wrong asset URL
// can silently produce. Call after renameSync; throw if it looks fake.
function assertArchiveSha256(filePath, url) {
  const expected = PinnedAssetSha256[path.basename(new URL(url).pathname)];
  if (!expected) return;
  const actual = createHash('sha256').update(readFileSync(filePath)).digest('hex');
  if (actual !== expected) {
    rmSync(filePath, { force: true });
    throwStageError(`SHA-256 mismatch for ${url}: expected ${expected}, got ${actual}`);
  }
}

function assertExecutableSha256(filePath, tool, assetName) {
  const expected = PinnedExecutableSha256[`${ReleaseTag}/${assetName}/${tool}`];
  if (!expected) return;
  const actual = createHash('sha256').update(readFileSync(filePath)).digest('hex');
  if (actual !== expected) {
    rmSync(filePath, { force: true });
    throwStageError(
      `SHA-256 mismatch for staged ${tool} (${filePath}): ` +
        `expected ${expected}, got ${actual}. Refusing to ship an unverifiable binary.`,
    );
  }
  console.log(`[fetch-ffmpeg] ${tool} SHA-256 verified (${expected.slice(0, 12)}…)`);
}

function assertRealBinary(filePath) {
  const st = statSync(filePath);
  // A real ffmpeg build is at least a few MB; an HTML error page is <1 MB.
  if (st.size < 1_000_000) {
    throwStageError(
      `staged sidecar ${filePath} is only ${st.size} bytes — ` +
        `likely a broken download (GitHub HTML error page). Check the asset URL.`,
    );
  }
  const buf = Buffer.alloc(4);
  const fd = openSync(filePath, 'r');
  readSync(fd, buf, 0, 4, 0);
  closeSync(fd);
  // Windows PE binaries start with 'MZ'; unix ELF starts with 0x7f 'E' 'L' 'F'.
  const isPE = buf[0] === 0x4d && buf[1] === 0x5a; // MZ
  const isELF = buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46;
  const isMachO =
    buf.readUInt32LE(0) === 0xfeedface ||
    buf.readUInt32LE(0) === 0xfeedface;
  if (!isPE && !isELF && !isMachO) {
    throwStageError(
      `staged sidecar ${filePath} is not a recognized executable ` +
        `(magic: ${buf.toString('hex')}). Likely a broken download.`,
    );
  }
}

// Extract a .zip archive.
//
// Strategy: prefer `unzip` (present on Linux/macOS CI and Git-Bash on
// Windows) since it is far faster and more reliable than PowerShell's
// Expand-Archive for large archives. Fall back to PowerShell
// Expand-Archive when `unzip` is unavailable (bare Windows host). On
// unix, if `unzip` fails, fall back to `python3 -m zipfile`.
async function extractZip(zipPath, outDir) {
  const { spawn } = await import('node:child_process');

  // Try `unzip` first on every platform (Git-Bash ships it on Windows;
  // Linux/macOS CI images always have it).
  try {
    await new Promise((resolve, reject) => {
      const child = spawn('unzip', ['-o', zipPath, '-d', outDir]);
      child.on('close', (code) =>
        code === 0 ? resolve() : reject(new Error(`unzip exited ${code}`)),
      );
      child.on('error', (e) => reject(e));
    });
    return;
  } catch {
    // `unzip` unavailable or failed — fall through to platform-specific.
  }

  if (process.platform === 'win32') {
    // Bare Windows host without unzip: PowerShell Expand-Archive.
    // Escape backslashes for the PowerShell -Command string explicitly
    // (avoid a regex inside a template literal, which the parser chokes on).
    const psPath = (p) => p.replace(/\\/g, '\\\\');
    await new Promise((resolve, reject) => {
      const child = spawn('powershell', [
        '-NoProfile',
        '-Command',
        `Expand-Archive -LiteralPath '${psPath(zipPath)}' -DestinationPath '${psPath(outDir)}' -Force`,
      ]);
      child.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Expand-Archive exited ${code}`));
        }
      });
      child.on('error', (e) => {
        reject(new Error(`unzip and Expand-Archive both failed (Expand-Archive: ${e.message})`));
      });
    });
    return;
  }

  // unix: fall back to python3 -m zipfile.
  await new Promise((resolve, reject) => {
    const py = spawn('python3', ['-m', 'zipfile', '-e', zipPath, outDir]);
    py.on('close', (c2) =>
      c2 === 0 ? resolve() : reject(new Error('unzip + python3 both failed')),
    );
    py.on('error', reject);
  });
}

// Extract a .tar.xz archive. Requires `tar` + `xz` on the host (both are
// present on standard Linux/macOS CI images and Windows Git-Bash/WSL).
async function extractTarXz(tarXzPath, outDir) {
  const { spawn } = await import('node:child_process');
  await new Promise((resolve, reject) => {
    const child = spawn('tar', ['-xJf', tarXzPath, '-C', outDir]);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`tar -xJf exited ${code}`)),
    );
    child.on('error', (e) =>
      reject(
        new Error(
          `tar not available (needed for .tar.xz extraction): ${e.message}. ` +
            'Install tar + xz, or set FFMPEG_URL to a .zip asset.',
        ),
      ),
    );
  });
}

if (isDirectRun) {
  main().catch((e) => die(e.message));
}

/**
 * Stage the ffmpeg sidecar only when the `bundled-ffmpeg` cargo feature is
 * requested (full-variant ship). The tiny variant passes no features (or a
 * csv that omits it) → this is a no-op and the build ships no sidecar.
 * Exported for the build runner (runner.mjs) so staging happens BEFORE the
 * tauri build picks up the external binary.
 *
 * `target` is the target triple to stage for (defaults to TARGET_TRIPLE env
 * or the host's own triple). Pass it explicitly for cross-compilation
 * (e.g. Windows-from-WSL: `x86_64-pc-windows-msvc`).
 *
 * Throws on failure instead of calling process.exit so runner.mjs can
 * write a partial state record and exit with a clean error.
 */
export async function stageFfmpegIfEnabled({ root, features, target } = {}) {
  if (!features || !String(features).includes('bundled-ffmpeg')) {
    console.log(
      '[fetch-ffmpeg] bundled-ffmpeg feature not set — skipping binary stage (tiny variant).',
    );
    return;
  }
  // Re-run the download/stage for the requested target (warm cache → no-op).
  // When imported (not direct-run), stageForTarget throws instead of exiting
  // the process on failure.
  await stageForTarget(resolveTarget(target));
}

// Exported for unit tests: the pure name/dest-path helpers that the full
// packaging test asserts on (both ffmpeg AND ffprobe sidecars, correct
// target-triple suffix + extension).
export const _internal = {
  sidecarNames,
  sidecarName,
  destPaths,
  destPath,
  PinnedExecutableSha256,
  PinnedAssetSha256,
};
