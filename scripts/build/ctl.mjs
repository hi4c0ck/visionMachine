#!/usr/bin/env node
// Build control panel: inspect and steer the build started by runner.mjs.
//
//   node scripts/build/ctl.mjs status   one-shot state + log tail
//   node scripts/build/ctl.mjs watch    live tail until the build ends
//   node scripts/build/ctl.mjs stop     kill the whole build tree
//
// Reads build-state/current.json — the runner's heartbeat. If the recorded
// pid is dead but the state still says "running", the state is stale
// (terminal closed, crash) and is reported as such.

import path from 'node:path';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { BuildState, tailLines } from './state.mjs';
import { statusHead, statusDetail } from './render.mjs';
import { killTree } from './spawn.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const state = new BuildState(root);
const cmd = process.argv[2] ?? 'status';

function load() {
  const s = state.read();
  if (!s) return null;
  s.logPath = s.logFile ? path.join(root, s.logFile) : null;
  s.live = state.isLive(s);
  return s;
}

if (cmd === 'status') {
  const s = load();
  if (!s) {
    console.log('[BUILD] no build recorded — start one with: npm run build:desktop');
    process.exit(0);
  }
  if (s.status === 'running' && !s.live) {
    console.log(statusHead(s));
    console.log('  ⚠ stale state: the build process is gone (terminal closed or crash?)');
    console.log('  clear it:  npm run build:stop');
    process.exit(1);
  }
  console.log(statusHead(s));
  const tail = s.status === 'running' ? [] : tailLines(s.logPath, 6);
  const detail = statusDetail(s, s.status === 'running' ? [s.lastLine] : tail);
  if (detail) console.log(detail);
  if (s.status === 'running') {
    console.log(`  log: ${s.logFile}`);
    console.log('  follow: npm run build:watch · stop: npm run build:stop');
  }
  process.exit(s.status === 'failed' || s.status === 'aborted-low-ram' ? 1 : 0);
}

if (cmd === 'watch') {
  let s = load();
  if (!s) {
    console.error('[BUILD] no build recorded — start one with: npm run build:desktop');
    process.exit(1);
  }
  // Start following from the current end so a long log never floods the screen.
  let offset = 0;
  let lastHead = '';

  const tick = () => {
    s = load();
    if (!s) {
      console.error('[BUILD] state file vanished');
      process.exit(1);
    }
    // New log lines since the last tick (the runner appends as the build runs).
    if (s.logPath) {
      try {
        const content = readFileSync(s.logPath, 'utf8');
        const fresh = content.slice(offset);
        if (fresh) process.stdout.write(fresh.endsWith('\n') ? fresh : fresh + '\n');
        offset = content.length;
      } catch { /* log not (yet) created */ }
    }
    const head = statusHead(s, Date.now());
    if (head !== lastHead) {
      lastHead = head;
      console.log(head);
    }
    if (s.status === 'running' && !s.live) {
      console.log('  ⚠ build process died (stale state) — clear with: npm run build:stop');
      process.exit(1);
    }
    if (s.status !== 'running') {
      const detail = statusDetail(s, tailLines(s.logPath, s.status === 'failed' ? 10 : 4));
      if (detail) console.log(detail);
      process.exit(s.status === 'done' ? 0 : 1);
    }
    setTimeout(tick, 2000);
  };
  tick();
}

if (cmd === 'stop') {
  const s = load();
  if (!s || s.status !== 'running') {
    console.log('[BUILD] nothing running to stop');
    process.exit(0);
  }
  if (s.live) {
    killTree(s.pid);
    s.status = 'stopped';
    s.failReason = 'stopped by user';
    s.finishedAt = Date.now();
    state.write(s);
    console.log(`[BUILD] stop requested (pid ${s.pid}) — marked stopped`);
    process.exit(0);
  }
  // Stale state (process already gone): just clear the record.
  s.status = 'stopped';
  s.failReason = 'stale state — process already gone';
  s.finishedAt = Date.now();
  state.write(s);
  console.log('[BUILD] stale state cleared (marked stopped)');
  process.exit(0);
}

console.error(`unknown command: ${cmd} (use status | watch | stop)`);
process.exit(1);
