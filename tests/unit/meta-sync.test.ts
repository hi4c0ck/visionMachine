/**
 * Meta single source of truth: src-tauri/tauri.conf.json (version + productName).
 * All other occurrences are DERIVED and must stay aligned via
 * `npm run sync:meta` (auto-runs before every desktop build). This suite
 * fails on drift so a half-done version bump can't ship.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(process.cwd());
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');
const conf = JSON.parse(read('src-tauri/tauri.conf.json'));

const derivedFiles = [
  'package.json',
  'src-tauri/Cargo.toml',
  'src-tauri/Cargo.lock',
  'src/constants.ts',
];

describe('meta sync (tauri.conf.json is the single source of truth)', () => {
  it('package.json version matches tauri.conf.json', () => {
    expect(JSON.parse(read('package.json')).version).toBe(conf.version);
  });

  it('Cargo.toml crate version matches tauri.conf.json', () => {
    const m = read('src-tauri/Cargo.toml').match(/^version\s*=\s*"([^"]+)"/m);
    expect(m?.[1]).toBe(conf.version);
  });

  it('Cargo.lock vision-machine entry matches tauri.conf.json', () => {
    const lock = read('src-tauri/Cargo.lock');
    const idx = lock.indexOf('name = "vision-machine"');
    expect(idx).toBeGreaterThanOrEqual(0);
    const m = lock.slice(idx, idx + 200).match(/version = "([^"]+)"/);
    expect(m?.[1]).toBe(conf.version);
  });

  it('constants.ts APP_VERSION + appName match tauri.conf.json', () => {
    const c = read('src/constants.ts');
    expect(c).toContain(`const APP_VERSION = '${conf.version}'`);
    expect(c).toContain(`appName: '${conf.productName}'`);
  });

  it('tauri.conf.json window title matches its own productName', () => {
    expect(read('src-tauri/tauri.conf.json')).toContain(`"title": "${conf.productName}"`);
  });

  it('sync script runs clean and is a no-op when in sync', () => {
    const before = derivedFiles.map(read).join('|');
    execFileSync('node', ['scripts/sync-meta.mjs'], { cwd: root, stdio: 'pipe' });
    const after = derivedFiles.map(read).join('|');
    expect(after).toBe(before);
  });
});
