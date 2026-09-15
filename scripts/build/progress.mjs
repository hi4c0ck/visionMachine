// Pure stream parser for the `tauri build` output (vite → cargo → wix → msi).
// No I/O, no side effects — feed() lines and read the resulting state.
// This is the part that gets unit-tested; everything else around it is thin.

export const PHASES = ['preflight', 'vite', 'cargo', 'wix', 'done'];

export class ProgressParser {
  constructor() {
    this.phase = 'preflight';
    this.units = 0; // completed cargo units ("Compiling X" lines)
    this.lastCrate = '';
    this.lastLine = '';
    this.errors = 0;
    this.msiPath = null;
    this.lastActivityAt = 0;
  }

  feed(line, at = Date.now()) {
    const text = line.trim();
    this.lastLine = text;
    this.lastActivityAt = at;
    if (!text) return;

    // Advance the phase forward only (never regress on late/echoed lines).
    if (/^\s*Compiling\s/.test(text)) {
      this.units += 1;
      this.lastCrate = text;
      this.bump('cargo');
    }
    if (/Running\s+(candle|light)\b/.test(text)) this.bump('wix');
    if (this.phase === 'wix' && /^Finished\s+\d+\s+bundle at\b/.test(text)) this.bump('done');
    if (this.phase === 'preflight') this.bump('vite');

    // Error accounting (cargo `error[...]` / `error:` lines)
    if (/^\s*error(\[|:)/.test(text)) this.errors += 1;

    // MSI path: "Running light to produce D:\...\VisionMachine_0.6.0_x64_en-US.msi"
    const light = text.match(/to produce\s+(.+\.msi)\s*$/);
    if (light) this.msiPath = light[1];
    // or the final bare "    D:\...\bundle\msi\VisionMachine_....msi" summary line
    if (this.phase === 'done') {
      const bare = text.match(/^[A-Za-z]:[\\/].*\.msi\s*$/);
      if (bare) this.msiPath = text.trim();
    }
  }

  bump(next) {
    if (PHASES.indexOf(next) > PHASES.indexOf(this.phase)) this.phase = next;
  }

  /** ms of silence — the stall signal for quiet LTO links / I/O hangs. */
  quietMs(now = Date.now()) {
    return this.lastActivityAt > 0 ? Math.max(0, now - this.lastActivityAt) : 0;
  }
}
