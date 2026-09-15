#!/usr/bin/env node
// Single source of truth for critical app metadata: src-tauri/tauri.conf.json
// (version + productName). It is what the Tauri bundler actually ships with
// (MSI/exe name, product version, upgrade identifier), so everything else is
// derived and kept aligned by this script:
//
//   version     → package.json, src-tauri/Cargo.toml, src-tauri/Cargo.lock,
//                 src/constants.ts (APP_VERSION)
//   productName → src/constants.ts (appName), tauri.conf.json window title
//
// Intentionally NOT synced (toolchain-coupled identifiers — change manually,
// deliberately): npm package name ("visionmachine-desktop"), crate name
// ("vision-machine"), bundle identifier ("com.visionmachine.desktop").
//
// Usage: npm run sync:meta  (also auto-runs before every desktop build)

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const confRaw = readFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf8');
const conf = JSON.parse(confRaw);
const version = conf.version;
const productName = conf.productName;

if (!version || !productName) {
  console.error('[sync-meta] tauri.conf.json is missing version/productName — nothing to sync from.');
  process.exit(1);
}

let confDirty = false;
let confNext = confRaw;
// Keep the window title inside the source file itself consistent with productName.
const titleMatch = confNext.match(/"title":\s*"[^"]*"/);
if (titleMatch && titleMatch[0] !== `"title": "${productName}"`) {
  confNext = confNext.replace(titleMatch[0], `"title": "${productName}"`);
  confDirty = true;
}

const targets = [
  ['package.json', (s) => s.replace(/"version":\s*"[^"]*"/, `"version": "${version}"`)],
  ['src-tauri/Cargo.toml', (s) => s.replace(/^version = "[^"]*"/m, `version = "${version}"`)],
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
  console.log('[sync-meta] updated src-tauri/tauri.conf.json (window title)');
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
    ? `[sync-meta] all in sync with tauri.conf.json v${version} (${productName})`
    : `[sync-meta] synced v${version} (${productName}) → ${updated + (confDirty ? 1 : 0)} file(s) updated`,
);
