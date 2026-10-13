#!/usr/bin/env node
// Single source of truth for app metadata: package.json (version) and
// src-tauri/tauri.conf.json (productName). Everything else is DERIVED and
// kept aligned by this script — never edited by hand:
//
//   version     ← package.json   → tauri.conf.json, Cargo.toml,
//                                   Cargo.lock, src/constants.ts (APP_VERSION)
//   productName ← tauri.conf.json → constants.ts (appName), tauri.conf.json window title
//
// Bumping a release = edit ONE field in package.json, done. The script runs
// automatically before every desktop build (tauri.conf.json beforeBuildCommand
// = "npm run build && npm run sync:meta") and via scripts/build/runner.mjs, so
// the derived files cannot desync the shipped MSI/exe.
//
// Intentionally NOT synced (toolchain-coupled identifiers — change manually,
// deliberately): npm package name ("visionmachine-desktop"), crate name
// ("vision-machine"), bundle identifier ("com.visionmachine.desktop").
//
// Usage: npm run sync:meta

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── Sources ────────────────────────────────────────────────────────────────
const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
if (!version) {
  console.error('[sync-meta] package.json is missing "version" — nothing to sync from.');
  process.exit(1);
}
const confRaw = readFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf8');
const conf = JSON.parse(confRaw);
const productName = conf.productName;
if (!productName) {
  console.error('[sync-meta] tauri.conf.json is missing "productName" — cannot derive appName.');
  process.exit(1);
}

// ── Derived targets ────────────────────────────────────────────────────────
let confDirty = false;
let confNext = confRaw;
confNext = confNext.replace(/"version":\s*"[^"]*"/, `"version": "${version}"`);
// Keep the window title inside the source file itself consistent with productName.
const titleMatch = confNext.match(/"title":\s*"[^"]*"/);
if (titleMatch && titleMatch[0] !== `"title": "${productName}"`) {
  confNext = confNext.replace(titleMatch[0], `"title": "${productName}"`);
}
if (confNext !== confRaw) confDirty = true;

const targets = [
  [
    'src-tauri/Cargo.toml',
    (s) => s.replace(/^version = "[^"]*"/m, `version = "${version}"`),
  ],
  [
    'src-tauri/Cargo.lock',
    (s) => s.replace(/(name = "vision-machine"\r?\n)version = "[^"]*"/, `$1version = "${version}"`),
  ],
  [
    'src/constants.ts',
    (s) =>
      s.replace(/const APP_VERSION = '[^']*'/, `const APP_VERSION = '${version}'`)
       .replace(/appName: '[^']*'/, `appName: '${productName}'`),
  ],
];

let updated = 0;
let missing = 0;
for (const [rel, transform] of targets) {
  const abs = path.join(root, rel);
  try {
    const before = readFileSync(abs, 'utf8');
    const after = transform(before);
    if (after === before) continue; // already in sync
    writeFileSync(abs, after);
    updated += 1;
    console.log(`[sync-meta] updated ${rel}`);
  } catch (e) {
    missing += 1;
    console.error(`[sync-meta] could not process ${rel}: ${e.message}`);
  }
}

if (confDirty) {
  writeFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), confNext);
  updated += 1;
  console.log('[sync-meta] updated src-tauri/tauri.conf.json');
}

// Sanity: the Cargo.lock/vision-machine regex must have matched — otherwise
// a future lock re-layout would silently desync. Re-check after the write.
const lockAfter = readFileSync(path.join(root, 'src-tauri', 'Cargo.lock'), 'utf8');
const lockIdx = lockAfter.indexOf('name = "vision-machine"');
const lockBlock = lockIdx >= 0 ? lockAfter.slice(lockIdx, lockIdx + 200) : '';
if (!lockBlock.includes(`version = "${version}"`)) {
  console.error('[sync-meta] Cargo.lock vision-machine entry could not be aligned — fix manually.');
  missing += 1;
}

if (missing > 0) {
  process.exit(1);
}
console.log(
  updated === 0 && !confDirty
    ? `[sync-meta] all in sync with package.json v${version} (${productName})`
    : `[sync-meta] synced v${version} (${productName}) → ${updated} file(s) updated`,
);
