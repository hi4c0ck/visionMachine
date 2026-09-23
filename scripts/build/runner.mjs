#!/usr/bin/env node
// VisionMachine desktop build runner.
//
// Wraps `tauri build` with three things a bare `npm run tauri build` can't
// give you:
//   1. PROGRESS   — phase machine (vite → cargo → wix → msi), live line in a
//                   TTY, a heartbeat state file and a per-build log you can
//                   inspect from any terminal (`build:status` / `build:watch`)
//   2. HEALTH     — pre-flight gates (app lock, disk, RAM, double build) and
//                   runtime guards (free-RAM kill-switch, stall warning)
//   3. RESOURCES  — cargo job cap + optional LTO-off + Below-Normal priority,
//                   so the build stays responsive-friendly: better slow
//                   than drained.
//
// All logic lives in the sibling modules; this file only orchestrates:
//   health.mjs · progress.mjs · state.mjs · render.mjs · spawn.mjs

import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, openSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { BuildState, tailLines } from './state.mjs';
import { ProgressParser } from './progress.mjs';
import { preflight, freeRamMB } from './health.mjs';
import { statusHead, statusDetail, fmtMs, fmtGB } from './render.mjs';
import { buildCommand, spawnBuild, killTree } from './spawn.mjs';
import { stageFfmpegIfEnabled } from './fetch-ffmpeg.mjs';

// ── CLI ──────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

if (argv.includes('--help')) {
  console.log(`Usage: node scripts/build/runner.mjs [flags]

Runs the Tauri desktop build with progress tracking, health checks and
resource guards. State lives in build-state/ (heartbeat + logs).

Flags:
  --light            lightweight preset for memory-tight machines: jobs=2,
                     no LTO, Low priority, 128 MB RAM guard, codegen-units=8
  --codegen-units <n> split release codegen into N units (lighter peaks,
                     longer link; default: profile value, 8 with --light)
  --jobs <n>         cap cargo parallelism (default: auto 2-4, based on free RAM)
  --no-lto           build without release LTO (much lighter link step)
  --priority <p>     below | low | normal — Windows process priority (default: below)
  --ram-guard <mb>   abort the build when free system RAM drops below this
                     (default: 1024, 128 with --light; use 0 to disable)
  --stall-warn <ms>  warn after this much output silence (default: 600000)
  --features <csv>   cargo features to enable (e.g. "bundled-ffmpeg" for the
                     full-variant ffmpeg ship; forwarded as: tauri build --
                     --features <csv>
  --detach           start in the background, print tracking commands, exit
  --help             this text

Track a running build:  npm run build:status
Follow it live:          npm run build:watch
Stop it:                 npm run build:stop`);
  process.exit(0);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const isWin = process.platform === 'win32';

const light = argv.includes('--light');
const jobsArg = opt('--jobs');
const noLto = argv.includes('--no-lto') || light;
const priority = isWin ? (opt('--priority') ?? (light ? 'low' : 'below')) : 'normal';
// Light mode tolerates a much lower free-RAM floor: the build itself peaks
// low (few jobs, no LTO, split codegen), and low-memory machines already
// oscillate around 0.5-1 GB of *baseline* free RAM — the guard must only
// catch real crash territory, not the system's normal breathing room.
const guardMB = opt('--ram-guard') !== undefined ? Number(opt('--ram-guard')) : (light ? 128 : 1024);
const stallMs = opt('--stall-warn') !== undefined ? Number(opt('--stall-warn')) : 600_000;
// Light mode splits the app crate's single giant codegen unit into 8 —
// the main memory spike on low-RAM machines. Regular builds keep the
// profile default (1) to stay warm-cache-friendly.
const codegenUnits = opt('--codegen-units') !== undefined ? Number(opt('--codegen-units')) : (light ? 8 : undefined);
const detach = argv.includes('--detach');
const features = opt('--features');

// ── Pre-flight (fail fast, before any process is spawned) ───────────────────

const state = new BuildState(root);
const prev = state.read();
const busy = !!prev && prev.status === 'running' && state.isLive(prev) && prev.pid !== process.pid;

const pf = await preflight({ cwd: root, ramGuardMB: guardMB, busy });

if (!pf.ok) {
  for (const e of pf.errors) console.error(`✗ ${e}`);
  for (const w of pf.warnings) console.warn(`⚠ ${w}`);
  // If we reserved the state slot already (detach re-entry), don't leave a zombie.
  if (prev && prev.status === 'running' && prev.pid === process.pid) {
    state.write({ ...prev, status: 'failed', failReason: 'preflight', finishedAt: Date.now() });
  }
  process.exit(1);
}

const jobs = jobsArg !== undefined ? Number(jobsArg) : (light ? 2 : pf.jobs);
if (light) console.log(`[BUILD] light mode: jobs=${jobsArg ?? 2}, no LTO, Low priority, ${guardMB} MB RAM guard, codegen-units=${codegenUnits}`);
for (const w of pf.warnings) console.log(`⚠ ${w}`);

// ── Resource staging (full-variant ffmpeg ship) ──────────────────────────────
// When the `bundled-ffmpeg` cargo feature is requested, stage the platform
// binary into src-tauri/bin/ffmpeg/<platform>/ BEFORE the build so Tauri's
// resource glob picks it up. No-op for the tiny variant (feature absent).
// Wrapped in try/catch: on download/fetch failure the runner writes a
// failed state record and exits cleanly instead of dying mid-stage.
try {
  await stageFfmpegIfEnabled({ root, features });
} catch (err) {
  console.error(`✗ ffmpeg staging failed: ${err.message}`);
  state.write({ ...state.read(), status: 'failed', failReason: `ffmpeg staging: ${err.message}`, finishedAt: Date.now() });
  process.exit(1);
}

// ── Log + state slot ─────────────────────────────────────────────────────────

const stamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
const logFile = path.join('build-state', `build-${stamp}.log`);
const startedAt = Date.now();

let doc = state.write({
  status: 'running',
  pid: process.pid,
  phase: 'preflight',
  startedAt,
  logFile,
  jobs,
  priority,
  ramGuardMB: guardMB,
  ramMB: pf.ramMB,
  units: 0,
  lastCrate: '',
  lastLine: '',
  lastActivityAt: 0,
  stallWarned: false,
  msiPath: null,
  exitCode: null,
  failReason: null,
  warnings: pf.warnings,
});

// ── Detach mode: hand off to a background runner, exit immediately ──────────

if (detach) {
  const logFd = openSync(path.join(root, logFile), 'a');
  // The background runner is a tiny wrapper: it spawns the real runner with
  // stdio:'ignore' in a fully detached group and exits immediately. Detached
  // + stdio:'ignore' breaks the Windows inheritance link, so the whole tree
  // (wrapper → runner → tauri → cargo → rustc) survives the shell that
  // started it — that is exactly what --detach must guarantee.
  const stateDir = path.join(root, 'build-state');
  mkdirSync(stateDir, { recursive: true });
  const detachScript = path.join(stateDir, 'build-detach.mjs');
  const runnerPath = fileURLToPath(import.meta.url);
  const featArgs = features ? ['--features', features] : [];
  writeFileSync(
    detachScript,
    [
      "import { spawn } from 'node:child_process';",
      "import { writeFileSync } from 'node:fs';",
      `const runner = ${JSON.stringify(runnerPath)};`,
      `const args = ${JSON.stringify(['--jobs', String(jobs), ...((noLto ? ['--no-lto'] : [])), ...((codegenUnits ? ['--codegen-units', String(codegenUnits)] : [])), '--priority', priority, '--ram-guard', String(guardMB), '--stall-warn', String(stallMs), ...featArgs])};`,
      'const child = spawn(process.execPath, [runner, ...args], {',
      `  cwd: ${JSON.stringify(root)},`,
      '  detached: true,',
      "  stdio: 'ignore',",
      '});',
      'child.unref();',
      "// Pin the runner's pid so ctl stop can still reach the tree even when",
      "// the runner itself has died (taskkill /T /F walks the whole tree).",
      `writeFileSync(${JSON.stringify(path.join(stateDir, 'build-pid'))}, String(child.pid));`,
    ].join('\n'),
    'utf8',
  );
  const wrapper = spawn(process.execPath, [detachScript], { detached: true, stdio: 'ignore' });
  wrapper.unref();
  console.log(`[BUILD] started in background (wrapper pid ${wrapper.pid})`);
  console.log(`  log:    ${logFile}`);
  console.log(`  track:  npm run build:status`);
  console.log(`  follow: npm run build:watch`);
  console.log(`  stop:   npm run build:stop`);
  process.exit(0);
}

// ── Foreground: spawn the build, stream + watch + finalize ──────────────────

console.log(`[BUILD] starting tauri build (jobs=${jobs}${noLto ? ', no-lto' : ''}, priority=${priority}, ram-guard=${guardMB} MB${features ? `, features=${features}` : ''})`);

const stateDir = path.join(root, 'build-state');
// Full-variant ffmpeg ship: attach the ffmpeg resource glob via a Tauri config
// override (deep-merged over tauri.conf.json) so the tiny variant's base config
// stays resource-free and never triggers an empty-glob build warning.
const bundledFfmpeg = features ? String(features).includes('bundled-ffmpeg') : false;
const configOverride = bundledFfmpeg ? 'src-tauri/tauri.full.conf.json' : undefined;
const spec = buildCommand({
  jobs,
  noLto,
  priority,
  stateDir,
  codegenUnits,
  features,
  config: configOverride,
});
const logStream = createWriteStream(path.join(root, logFile), { flags: 'a' });
const parser = new ProgressParser();
let lastPhase = 'preflight';
let lastHeartbeat = 0;
let guardAborted = false;
let stoppedByUser = false;

const { child, kill } = spawnBuild(spec, {
  stateDir,
  onLine: (line) => {
    logStream.write(line + '\n');
    parser.feed(line);
    const now = Date.now();
    const phaseChanged = parser.phase !== lastPhase;
    if (phaseChanged) lastPhase = parser.phase;
    // Heartbeat: on phase changes immediately, otherwise at most every 2s.
    if (phaseChanged || now - lastHeartbeat >= 2000) {
      lastHeartbeat = now;
      doc = state.write({
        ...doc,
        phase: parser.phase,
        units: parser.units,
        lastCrate: parser.lastCrate,
        lastLine: parser.lastLine,
        lastActivityAt: parser.lastActivityAt,
        msiPath: parser.msiPath,
        ramMB: freeRamMB(),
      });
      if (process.stdout.isTTY) {
        process.stdout.write('\r' + statusHead(doc, now) + ' '.repeat(8));
      }
    }
  },
});
doc = state.write({ ...doc, pid: child.pid });

// Watchdog: free-RAM kill-switch + stall warning, every 5s.
const watchdog = setInterval(() => {
  const ram = freeRamMB();
  doc.ramMB = ram;
  if (guardMB > 0 && ram < guardMB && !guardAborted) {
    guardAborted = true;
    console.log(`\n[BUILD] ✋ free RAM ${fmtGB(ram)} is below the ${fmtGB(guardMB)} guard — stopping the build to protect the system`);
    state.write({ ...doc, status: 'aborted-low-ram', failReason: `free RAM below ${guardMB} MB guard` });
    kill();
    return;
  }
  if (!doc.stallWarned && parser.lastActivityAt > 0 && parser.quietMs() > stallMs) {
    doc.stallWarned = true;
    state.write(doc);
    console.log(
      `\n[BUILD] ⚠ no output for ${Math.round(parser.quietMs() / 60000)} min — usually the quiet LTO link step (normal), but check: npm run build:watch`,
    );
  }
}, 5000);

process.on('SIGINT', () => {
  if (stoppedByUser) return;
  stoppedByUser = true;
  console.log('\n[BUILD] stopping…');
  kill();
});

child.on('close', (code) => {
  clearInterval(watchdog);
  logStream.end();
  const cur = state.read() ?? doc;
  let status;
  let failReason = cur.failReason ?? null;
  if (cur.status === 'aborted-low-ram') {
    status = 'aborted-low-ram';
  } else if (stoppedByUser) {
    status = 'stopped';
    failReason = 'stopped by user';
  } else if (code === 0) {
    status = 'done';
  } else {
    status = 'failed';
    failReason = `exit ${code}`;
  }
  doc = state.write({
    ...cur,
    status,
    failReason,
    finishedAt: Date.now(),
    exitCode: code,
    msiPath: parser.msiPath ?? cur.msiPath,
  });
  if (process.stdout.isTTY) process.stdout.write('\n');
  console.log(statusHead(doc, doc.finishedAt));
  const detail = statusDetail(doc, status === 'failed' ? tailLines(path.join(root, doc.logFile), 12) : []);
  if (detail) console.log(detail);
  process.exit(status === 'done' ? 0 : 1);
});
