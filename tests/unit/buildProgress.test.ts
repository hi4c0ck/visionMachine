/**
 * Unit tests for the pure build-orchestration logic in scripts/build/:
 *   - ProgressParser: phase machine over `tauri build` output
 *   - resource decisions: assessRam / suggestJobs
 *   - rendering: statusHead / statusDetail / fmtMs / fmtGB
 */
import { describe, it, expect } from 'vitest';
import { ProgressParser, PHASES } from '../../scripts/build/progress.mjs';
import { assessRam, suggestJobs } from '../../scripts/build/health.mjs';
import { statusHead, statusDetail, fmtMs, fmtGB } from '../../scripts/build/render.mjs';

// A realistic (abridged) `tauri build` transcript.
const TRANSIT = [
  'vite v7.3.2 building for production...',
  '✓ 186 modules transformed.',
  '✓ built in 1.16s',
  '   Compiling vision-machine v0.5.0 (D:\\x)',
  '    Compiling tauri v2.5.0',
  "    Finished `release` profile [optimized] target(s) in 3m 34s",
  '       Built application at: D:\\x\\target\\release\\vision-machine.exe',
  '     Running candle for "D:\\x\\main.wxs"',
  '     Running light to produce D:\\x\\VisionMachine_0.5.0_x64_en-US.msi',
  '    Finished 1 bundle at:',
  '        D:\\x\\target\\release\\bundle\\msi\\VisionMachine_0.5.0_x64_en-US.msi',
];

function parse(lines: string[]): ProgressParser {
  const p = new ProgressParser();
  lines.forEach((l) => p.feed(l));
  return p;
}

describe('ProgressParser', () => {
  it('walks the full transcript to done, counting cargo units', () => {
    const p = parse(TRANSIT);
    expect(p.phase).toBe('done');
    expect(p.units).toBe(2); // two "Compiling" lines in the abridged log
    expect(p.errors).toBe(0);
  });

  it('starts in preflight and bumps to vite on the first output line', () => {
    expect(new ProgressParser().phase).toBe('preflight');
    expect(parse(['vite v7.3.2 building...']).phase).toBe('vite');
  });

  it('captures the msi path from the "Running light to produce" line', () => {
    const p = parse(TRANSIT.slice(0, 9));
    expect(p.phase).toBe('wix');
    expect(p.msiPath).toBe('D:\\x\\VisionMachine_0.5.0_x64_en-US.msi');
  });

  it('refreshes the msi path from the final summary line (bundle dir)', () => {
    const p = parse(TRANSIT);
    expect(p.msiPath).toBe('D:\\x\\target\\release\\bundle\\msi\\VisionMachine_0.5.0_x64_en-US.msi');
  });

  it('never regresses the phase', () => {
    const p = parse(TRANSIT);
    p.feed('Compiling something v0'); // echoed/late line after done
    expect(p.phase).toBe('done');
    // PHASES order is the only way forward
    expect(PHASES.indexOf('done')).toBeGreaterThan(PHASES.indexOf('wix'));
  });

  it('counts cargo error lines', () => {
    const p = parse(['Compiling foo', 'error[E0308]: mismatched types', 'error: could not compile']);
    expect(p.errors).toBe(2);
    expect(p.phase).toBe('cargo');
  });

  it('measures quiet time for stall detection', () => {
    const p = new ProgressParser();
    expect(p.quietMs(5000)).toBe(0); // no activity yet
    p.feed('Compiling foo', 1000);
    expect(p.quietMs(5000)).toBe(4000);
    p.feed('Compiling bar', 6000);
    expect(p.quietMs(6000)).toBe(0);
  });

  it('a blank line still counts as activity (the process is alive)', () => {
    const p = new ProgressParser();
    p.feed('Compiling foo', 1000);
    p.feed('   ', 2000); // whitespace-only — the stream is flowing, so no stall
    expect(p.quietMs(2000)).toBe(0);
    expect(p.units).toBe(1); // blank lines never advance the phase/counters
  });
});

describe('resource decisions', () => {
  it('assessRam: critical below guard, warn below warn, else ok', () => {
    expect(assessRam(500, { warnMB: 4096, guardMB: 1024 })).toBe('critical');
    expect(assessRam(3000, { warnMB: 4096, guardMB: 1024 })).toBe('warn');
    expect(assessRam(8000, { warnMB: 4096, guardMB: 1024 })).toBe('ok');
  });

  it('suggestJobs: capped at 4, floor of 2, drops to 2 when RAM is tight', () => {
    expect(suggestJobs({ ramMB: 20000, cpus: 16 })).toBe(4);
    expect(suggestJobs({ ramMB: 20000, cpus: 2 })).toBe(2); // floor
    expect(suggestJobs({ ramMB: 20000, cpus: 1 })).toBe(2); // floor
    expect(suggestJobs({ ramMB: 4000, cpus: 16 })).toBe(2); // RAM-limited
    expect(suggestJobs({ ramMB: null, cpus: 64 })).toBe(4); // cap wins
  });
});

describe('rendering', () => {
  it('fmtMs / fmtGB', () => {
    expect(fmtMs(75400)).toBe('01:15');
    expect(fmtGB(6400)).toBe('6.3 GB'); // 6400/1024 = 6.25 → rounds up
    expect(fmtGB(null)).toBe('-');
  });

  it('statusHead running line carries phase, units, elapsed, ram, jobs', () => {
    const now = Date.now();
    const line = statusHead(
      { status: 'running', phase: 'cargo', units: 213, startedAt: now - 7 * 60000, ramMB: 6500, jobs: 4 },
      now,
    );
    expect(line).toContain('[BUILD] running · cargo · 213u');
    expect(line).toContain('07:00');
    expect(line).toContain('ram 6.3 GB · jobs 4');
  });

  it('statusHead done line carries the msi path', () => {
    const now = Date.now();
    const line = statusHead(
      { status: 'done', startedAt: now - 60000, finishedAt: now, msiPath: 'D:\\x\\a.msi' },
      now,
    );
    expect(line).toContain('[BUILD] done');
    expect(line).toContain('D:\\x\\a.msi');
  });

  it('statusHead failed line carries the fail reason', () => {
    const now = Date.now();
    const line = statusHead(
      { status: 'failed', failReason: 'exit 101', startedAt: now - 60000, finishedAt: now },
      now,
    );
    expect(line).toContain('[BUILD] failed');
    expect(line).toContain('(exit 101)');
  });

  it('statusHead with no state prompts to start a build', () => {
    expect(statusHead(null)).toContain('no build recorded');
  });

  it('statusDetail: running shows last crate + hint; done shows install line', () => {
    const run = statusDetail({
      status: 'running',
      lastCrate: 'Compiling tauri v2.5.0',
      logFile: 'build-state/build-x.log',
    } as never);
    expect(run).toContain('last:');
    expect(run).toContain('npm run build:watch');
    const done = statusDetail({
      status: 'done',
      msiPath: 'D:\\x\\a.msi',
    } as never, ['some log line']);
    expect(done).toContain('msiexec /i "D:\\x\\a.msi"');
    expect(done).toContain('some log line');
  });
});
