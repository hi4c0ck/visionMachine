/**
 * Unit tests for the build-state persistence (scripts/build/state.mjs) and
 * the command-spec builder (scripts/build/spawn.mjs buildCommand).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { BuildState, tailLines } from '../../scripts/build/state.mjs';
import { buildCommand } from '../../scripts/build/spawn.mjs';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'vm-build-state-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('BuildState', () => {
  it('read() returns null before any write', () => {
    const s = new BuildState(dir);
    expect(s.read()).toBeNull();
  });

  it('write/read round-trips with schema + updatedAt stamps', () => {
    const s = new BuildState(dir);
    s.write({ status: 'running', pid: 123, phase: 'cargo' });
    const doc = s.read();
    expect(doc).toMatchObject({ schema: 1, status: 'running', pid: 123, phase: 'cargo' });
    expect(typeof doc!.updatedAt).toBe('number');
  });

  it('isLive: true for a live pid, false for dead/absent pids', () => {
    const s = new BuildState(dir);
    expect(s.isLive({ status: 'running', pid: process.pid } as never)).toBe(true);
    expect(s.isLive({ status: 'running', pid: 999999999 } as never)).toBe(false);
    expect(s.isLive({ status: 'done', pid: process.pid } as never)).toBe(false);
    expect(s.isLive(null)).toBe(false);
  });
});

describe('tailLines', () => {
  it('returns the last n lines of a file', () => {
    const f = path.join(dir, 'log.txt');
    mkdirSync(path.dirname(f), { recursive: true });
    writeFileSync(f, 'a\nb\nc\nd\ne\n');
    expect(tailLines(f, 2)).toEqual(['d', 'e']);
    expect(tailLines(f, 10)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('returns [] for a missing file (preflight failures have no log)', () => {
    expect(tailLines(path.join(dir, 'nope.log'), 5)).toEqual([]);
  });
});

describe('buildCommand', () => {
  it('linux: plain npx, no shell, job cap via CARGO_BUILD_JOBS', () => {
    const spec = buildCommand({ jobs: 2, platform: 'linux', stateDir: dir });
    expect(spec.cmd).toBe('npx');
    expect(spec.args).toEqual(['tauri', 'build']);
    expect(spec.shell).toBe(false);
    expect(spec.env.CARGO_BUILD_JOBS).toBe('2');
    expect(spec.env.NO_COLOR).toBe('1');
    expect(spec.env.CARGO_PROFILE_RELEASE_LTO).toBeUndefined();
  });

  it('noLto disables the release LTO link via env', () => {
    const spec = buildCommand({ noLto: true, platform: 'linux', stateDir: dir });
    expect(spec.env.CARGO_PROFILE_RELEASE_LTO).toBe('false');
  });

  it('codegenUnits splits the release codegen via env', () => {
    const spec = buildCommand({ codegenUnits: 8, platform: 'linux', stateDir: dir });
    expect(spec.env.CARGO_PROFILE_RELEASE_CODEGEN_UNITS).toBe('8');
    const off = buildCommand({ platform: 'linux', stateDir: dir });
    expect(off.env.CARGO_PROFILE_RELEASE_CODEGEN_UNITS).toBeUndefined();
  });

  it('win32 normal priority: npx.cmd through a shell, no wrapper', () => {
    const spec = buildCommand({ jobs: 4, priority: 'normal', platform: 'win32', stateDir: dir });
    expect(spec.cmd).toBe('npx');
    expect(spec.shell).toBe(true);
    expect(spec.env.CARGO_BUILD_JOBS).toBe('4');
  });

  it('win32 below/low priority: powershell wrapper that lowers the process class', () => {
    for (const [priority, cls] of [['below', 'BelowNormal'], ['low', 'Low']] as const) {
      const spec = buildCommand({ priority, platform: 'win32', stateDir: dir });
      expect(spec.cmd).toBe('powershell');
      expect(spec.shell).toBe(false);
      const ps1 = spec.args[spec.args.indexOf('-File') + 1];
      expect(ps1).toBe(path.join(dir, 'build-runner.ps1'));
      // wrapper was actually written and targets the right class
      const body = readFileSync(ps1, 'utf8');
      expect(body).toContain(cls);
      expect(body).toContain('& npx tauri build 2>&1');
      expect(body).toContain('exit $LASTEXITCODE');
    }
  });
});
