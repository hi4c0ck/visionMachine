// build-state persistence: one JSON heartbeat file + the raw log location.
// Dumb on purpose — read/write/validate, no logic.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Last N lines of a log file (tolerates missing files — preflight failures have none). */
export function tailLines(file, n) {
  try {
    const txt = readFileSync(file, 'utf8');
    return txt.split('\n').slice(-n - 1, -1); // drop the trailing empty chunk
  } catch {
    return [];
  }
}

const STATE_DIR = 'build-state';
const CURRENT = 'current.json';

export class BuildState {
  constructor(cwd = process.cwd()) {
    this.dir = path.join(cwd, STATE_DIR);
    this.file = path.join(this.dir, CURRENT);
  }

  ensure() {
    mkdirSync(this.dir, { recursive: true });
    return this;
  }

  write(state) {
    this.ensure();
    const doc = { schema: 1, ...state, updatedAt: Date.now() };
    writeFileSync(this.file, JSON.stringify(doc, null, 2));
    return doc;
  }

  read() {
    try {
      return JSON.parse(readFileSync(this.file, 'utf8'));
    } catch {
      return null;
    }
  }

  /** Is the recorded pid still alive? Catches "terminal closed / crash" zombies. */
  isLive(state) {
    if (!state || state.status !== 'running' || !state.pid) return false;
    try {
      process.kill(state.pid, 0); // signal 0 = existence check, no actual signal
      return true;
    } catch {
      return false;
    }
  }
}
