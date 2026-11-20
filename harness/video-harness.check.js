'use strict';
/**
 * video-harness.check.js
 * Proves the STRUCTURAL CONFIG is self-consistent, with ZERO external deps:
 *   - each schemas/*.json is well-formed JSON
 *   - golden/*.json conform to the matching schema (tiny built-in validator)
 *   - golden film_seed / visual_novel respect the counts (scale invariant)
 *   - golden shot_spec enums are a subset of tag_vocabulary.yaml tag sets
 *
 * Read-only config check. Run with a real Windows node:
 *   "C:\Program Files\nodejs\node.exe" harness/video-harness.check.js
 * (Do NOT execute the .node wrapper; only this .js file.)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

// --- minimal validator (subset of draft-07 we use) --------------------------
function validate(schema, value, p = '$') {
  const errs = [];
  if (schema.type) {
    const ok = schema.type === 'object' ? (typeof value === 'object' && value !== null && !Array.isArray(value))
      : schema.type === 'array' ? Array.isArray(value)
      : schema.type === 'string' ? typeof value === 'string'
      : schema.type === 'integer' ? Number.isInteger(value)
      : schema.type === 'number' ? typeof value === 'number'
      : schema.type === 'boolean' ? typeof value === 'boolean'
      : true;
    if (!ok) return [`${p}: expected ${schema.type}, got ${value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value}`];
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value))
    errs.push(`${p}: ${JSON.stringify(value)} not in enum`);
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errs.push(`${p}: ${value}<min ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errs.push(`${p}: ${value}>max ${schema.maximum}`);
  }
  if (Array.isArray(value) && schema.items) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errs.push(`${p}: <minItems ${schema.minItems}`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errs.push(`${p}: >maxItems ${schema.maxItems}`);
    value.forEach((v, i) => errs.push(...validate(schema.items, v, `${p}[${i}]`)));
  }
  if (schema.type === 'object' && typeof value === 'object' && value !== null) {
    for (const r of schema.required || []) if (!(r in value)) errs.push(`${p}: missing "${r}"`);
    if (schema.additionalProperties === false)
      for (const k of Object.keys(value)) if (!(k in (schema.properties || {}))) errs.push(`${p}: unexpected "${k}"`);
    for (const [k, sub] of Object.entries(schema.properties || {}))
      if (k in value) errs.push(...validate(sub, value[k], `${p}.${k}`));
  }
  return errs;
}

// --- tiny YAML tag-set reader (handles single-line AND wrapped lists) ------
function readTagSets() {
  const txt = fs.readFileSync(path.join(root, 'config', 'tag_vocabulary.yaml'), 'utf8');
  const tags = {};
  let inTags = false, curKey = null, buf = '';
  const flush = () => {
    if (curKey) {
      const items = buf.replace(/[[\]]/g, '').split(',')
        .map(s => s.trim().replace(/^["']|["']$/g, '').replace(/\s+#.*$/, '').trim())
        .filter(Boolean);
      if (items.length) tags[curKey] = items;
      curKey = null; buf = '';
    }
  };
  for (const raw of txt.split(/\r?\n/)) {
    const h = raw.trim();
    if (h === 'tags:') { inTags = true; continue; }
    if (!inTags) continue;
    if (!h || h.startsWith('#')) continue;
    const m = h.match(/^([a-z_]+):\s*(.*)$/);
    if (m && !h.startsWith('- ')) { flush(); curKey = m[1]; buf = m[2] || ''; }
    else if (curKey) { buf += ' ' + h; }   // wrapped continuation line
  }
  flush();
  return tags;
}

const checks = [];
function check(label, cond, detail) { checks.push({ label, pass: !!cond, detail }); }

const filmSeed = read('golden/film_seed.json');
const novel = read('golden/visual_novel.json');
const shot = read('golden/shot_spec.json');

let filmSchema, novelSchema, shotSchema;
for (const [f, k] of [['film_seed.schema.json', 'filmSchema'], ['visual_novel.schema.json', 'novelSchema'], ['shot_spec.schema.json', 'shotSchema']]) {
  const s = read('schemas/' + f);
  check(`schemas/${f} well-formed`, !!s && s.type === 'object', 'type=' + s.type);
  if (f === 'film_seed.schema.json') filmSchema = s;
  if (f === 'visual_novel.schema.json') novelSchema = s;
  if (f === 'shot_spec.schema.json') shotSchema = s;
}

// schema conformance
const fe = validate(filmSchema, filmSeed);
const ne = validate(novelSchema, novel);
const se = validate(shotSchema, shot);
check('golden film_seed conforms to FilmSeed schema', fe.length === 0, fe.join(' | '));
check('golden visual_novel conforms to VisualNovel schema', ne.length === 0, ne.join(' | '));
check('golden shot_spec conforms to ShotSpec schema', se.length === 0, se.join(' | '));

// invariants tying the three files together
check('novel scenes count == filmSeed.scale.scenes',
  novel.scenes.length === filmSeed.scale.scenes,
  `${novel.scenes.length} vs ${filmSeed.scale.scenes}`);
check('novel shots count == filmSeed.scale.shotsPerScene',
  novel.scenes[0].shots.length === filmSeed.scale.shotsPerScene,
  `${novel.scenes[0].shots.length} vs ${filmSeed.scale.shotsPerScene}`);
check('shot clip_s within filmSeed.scale.clipS',
  shot.clip_s >= filmSeed.scale.clipS[0] && shot.clip_s <= filmSeed.scale.clipS[1],
  `clip_s=${shot.clip_s}, clipS=${filmSeed.scale.clipS}`);

// tag_vocabulary coverage: ShotSpec enums (now under concern groups) must be subsets of the YAML tag sets.
// Path -> vocab set. Numbers are compared as strings (the YAML reader keeps them as strings).
const tags = readTagSets();
function enumAt(pathStr) {
  let node = shotSchema.properties;
  for (const part of pathStr.split('.')) {
    if (!node) return undefined;
    node = node.properties ? node.properties[part] : undefined;
  }
  return node && node.enum;
}
const inSet = (val, allowed) => allowed.map(String).includes(String(val));
const enumPaths = {
  'concerns.camera.size': 'size',
  'concerns.camera.angle': 'angle',
  'concerns.camera.framing': 'framing',
  'concerns.camera.dof': 'dof',
  'concerns.lens.focal_mm': 'lens_focal',
  'concerns.motion.zoom': 'zoom',
  'concerns.motion.move': 'move',
  'concerns.motion.speed': 'speed',
  'concerns.lighting.key': 'light_key',
  'concerns.lighting.contrast': 'light_contrast',
  'concerns.grade.saturation': 'grade_saturation',
  'concerns.grade.contrast': 'grade_contrast',
  'concerns.grade.film_stock': 'film_stock',
  'concerns.effects': 'effects',          // array-of-enum (items)
  'transition_in': 'transition',
  'transition_out': 'transition',
};
for (const [fieldPath, set] of Object.entries(enumPaths)) {
  const allowed = tags[set];
  if (!allowed) { check(`tag_vocabulary.${set} present`, false, 'missing set'); continue; }
  const node = fieldPath === 'concerns.effects'
    ? (() => { let n = shotSchema; for (const p of fieldPath.split('.')) n = n.properties ? n.properties[p] : undefined; return n ? n.items : undefined; })()
    : (() => { let n = shotSchema; for (const p of fieldPath.split('.')) n = n.properties ? n.properties[p] : undefined; return n; })();
  const enumVals = (node && node.enum) || [];
  const outside = enumVals.filter((v) => !inSet(v, allowed));
  check(`ShotSpec.${fieldPath} ⊆ tag_vocabulary.${set}`, outside.length === 0,
    outside.length ? `outside: ${outside}` : `ok (${enumVals.length} values)`);
}

let ok = true;
console.log('\n[structural config check]');
for (const c of checks) { ok = ok && c.pass; console.log(`  ${c.pass ? 'pass' : 'FAIL'}  ${c.label}${c.detail && !c.pass ? '  -> ' + c.detail : ''}`); }
console.log(`\n=== result: ${ok ? 'ALL PASS' : 'FAILURES PRESENT'} (${checks.filter(c => c.pass).length}/${checks.length}) ===`);
process.exit(ok ? 0 : 1);
