/**
 * gates.check.js — read-only structural check of harness/config/gates.yaml.
 * No LLM, no network. Asserts:
 *   1. gates.yaml parses (mini YAML subset parser, no deps)
 *   2. all 5 gates exist with required fields
 *   3. position/backtrack reference known step names
 *   4. every acquirable field path is a real path in the matching schema:
 *        G0 → FilmSeed (+ creative_profile/spec_profile keys from profiles.yaml)
 *        G1 → VisualNovel (+ scale.* overrides)
 *        G2 → ShotSpec
 *   5. batch_mode present with auto_confirm
 * Run: "C:\Program Files\nodejs\node.exe" harness/gates.check.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

// ---------------------------------------------------------------------------
// minimal YAML subset parser (nested maps, "- " lists, scalars, flow lists)
// ---------------------------------------------------------------------------
function parseMiniYaml(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() && !l.trim().startsWith('#'));
  let i = 0;
  function parseBlock(indent) {
    // decide map vs list by first significant line
    const first = lines[i];
    if (!first) return null;
    const ind = first.length - first.trimStart().length;
    if (ind < indent) return null;
    const isList = first.trimStart().startsWith('- ');
    if (isList) {
      const arr = [];
      while (i < lines.length) {
        const l = lines[i];
        const cInd = l.length - l.trimStart().length;
        if (cInd !== ind || !l.trimStart().startsWith('- ') && !l.trimStart().startsWith('-')) break;
        const rest = l.trimStart().replace(/^- /, '');
        i++;
        if (rest.includes(':')) arr.push(parseEntry(rest, ind + 2));
        else arr.push(parseScalar(rest));
      }
      return arr;
    }
    const obj = {};
    while (i < lines.length) {
      const l = lines[i];
      const cInd = l.length - l.trimStart().length;
      if (cInd < indent) break;
      if (cInd > indent) { i++; continue; } // deeper lines handled by recursion
      const m = l.trim().match(/^([^\s:]+):\s*(.*)$/);
      if (!m) { i++; continue; }
      const key = m[1], val = m[2].trim();
      i++;
      if (val === '') {
        const sub = parseBlock(indent + 2);
        obj[key] = sub === null ? '' : sub;
      } else {
        obj[key] = parseScalar(val);
      }
    }
    return obj;
  }
  function parseEntry(inline, childIndent) {
    const m = inline.match(/^([^\s:]+):\s*(.*)$/);
    if (!m) return parseScalar(inline);
    const obj = {};
    obj[m[1]] = m[2].trim() === '' ? '' : parseScalar(m[2]);
    // inline map continuation: "re_run: node_a      # ..."
    if (i < lines.length) {
      const cInd = lines[i].length - lines[i].trimStart().length;
      if (cInd >= childIndent) {
        const sub = parseBlock(childIndent);
        if (sub && typeof sub === 'object' && !Array.isArray(sub)) Object.assign(obj, sub);
      }
    }
    return obj;
  }
  function parseScalar(s) {
    s = s.replace(/#.*$/, '').trim();
    if (s === '') return '';
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (/^\[.*\]$/.test(s)) return s.slice(1, -1).split(',').map((x) => parseScalar(x));
    if (/^-?\d+$/.test(s)) return Number(s);
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
    return s;
  }
  return parseBlock(0);
}

// ---------------------------------------------------------------------------
// field-path validation against a JSON schema
//   "genre.name"            → properties.genre.properties.name
//   "scenes[].shots[].beats" → properties.scenes.items.properties.shots.items.properties.beats
// ---------------------------------------------------------------------------
function pathInSchema(schema, p) {
  let node = schema;
  for (let raw of p.split('.')) {
    const t = raw.trim();
    if (t === '[]' || t === '') { node = node && node.items; if (!node) return false; continue; }
    const arr = t.endsWith('[]');
    const key = arr ? t.slice(0, -2) : t;
    if (!node || !node.properties || !(key in node.properties)) return false;
    node = node.properties[key];
    if (arr) { node = node && node.items; if (!node) return false; }
  }
  return true;
}
// preset-selector keys (G0): value is a preset name from profiles.yaml, not a schema field
const PROFILE_SELECTORS = new Set(['creative_profile', 'spec_profile']);

// ---------------------------------------------------------------------------
const filmSeed = read('schemas/film_seed.schema.json');
const novel = read('schemas/visual_novel.schema.json');
const shot = read('schemas/shot_spec.schema.json');
const profiles = fs.readFileSync(path.join(root, 'config', 'profiles.yaml'), 'utf8');

const STEPS = ['node_a', 'node_b', 'media_generation', 'assembly'];
const results = [];
const check = (label, ok, shown) => results.push({ label, ok, shown });

const gatesRaw = fs.readFileSync(path.join(root, 'config', 'gates.yaml'), 'utf8');
const gates = parseMiniYaml(gatesRaw);

// 1. top level
check('gates.yaml parsed (gates section present)', gates && gates.gates, '');
const g = (gates && gates.gates) || {};
const ids = Object.keys(g);

// 2. required gates
for (const id of ['G0_entry', 'G1_novel_review', 'G2_spec_review', 'G3_clip_review', 'G4_final_review']) {
  check(`gate ${id} exists`, ids.includes(id), ids.join(', '));
}

// 3. per-gate field integrity
for (const id of ids) {
  const G = g[id];
  if (!G || typeof G !== 'object') { check(`${id}: object`, false, String(G)); continue; }
  const pos = G.position || '';
  const posM = String(pos).match(/(before|after):\s*([\w_]+)/);
  check(`${id}.position is before/after <step>`, !!posM && STEPS.includes(posM[2]), pos);
  check(`${id}.show is string`, typeof G.show === 'string' && G.show.length > 0, G.show);
  const acq = G.acquirable;
  check(`${id}.acquirable is non-empty list`, Array.isArray(acq) && acq.length > 0, Array.isArray(acq) ? acq.length : typeof acq);
  check(`${id}.confirm is string`, typeof G.confirm === 'string' && G.confirm.length > 0, G.confirm);
  check(`${id}.backtrack is list`, Array.isArray(G.backtrack), Array.isArray(G.backtrack) ? G.backtrack.length : typeof G.backtrack);
  check(`${id}.auto is bool`, typeof G.auto === 'boolean', G.auto);
  if (Array.isArray(G.backtrack)) for (const bt of G.backtrack) {
    const step = bt && bt.re_run;
    if (step) check(`${id}.backtrack step valid`, STEPS.includes(step), String(step));
  }
}

// 4. acquirable field paths vs schemas
function acqPaths(id) {
  const a = g[id] && g[id].acquirable;
  return Array.isArray(a) ? a.map((x) => String(x).replace(/^"|"$/g, '')) : [];
}
// G0 → FilmSeed paths, or preset selectors (creative_profile/spec_profile)
for (const p of acqPaths('G0_entry')) {
  let ok, note;
  if (PROFILE_SELECTORS.has(p)) {
    ok = true; note = 'preset selector (value ∈ profiles.yaml presets)';
  } else {
    ok = pathInSchema(filmSeed, p);
    note = ok ? 'FilmSeed' : 'NOT FOUND in FilmSeed';
  }
  check(`G0 acquirable "${p}" valid`, ok, note);
}
// G1 → VisualNovel paths (scale.* allowed as entry overrides)
for (const p of acqPaths('G1_novel_review')) {
  const ok = p.startsWith('scale.') ? pathInSchema(filmSeed, p) : pathInSchema(novel, p);
  check(`G1 acquirable "${p}" valid`, ok, ok ? (p.startsWith('scale.') ? 'FilmSeed.scale' : 'VisualNovel') : 'NOT FOUND');
}
// G2 → ShotSpec paths (strip leading "shots[].")
for (const p of acqPaths('G2_spec_review')) {
  const inner = p.replace(/^shots\[\]\./, '');
  const ok = p === 'shots[].re_roll' ? true : pathInSchema(shot, inner);
  check(`G2 acquirable "${p}" valid`, ok, ok ? 'ShotSpec.' + inner : 'NOT FOUND in ShotSpec');
}

// 5. batch_mode
const bm = gates.batch_mode || {};
check('batch_mode.auto_confirm is bool', typeof bm.auto_confirm === 'boolean', bm.auto_confirm);
check('batch_mode.skip_gates is list', Array.isArray(bm.skip_gates), bm.skip_gates);
check('batch_mode.log_decisions is bool', typeof bm.log_decisions === 'boolean', bm.log_decisions);

// report
const failed = results.filter((r) => !r.ok);
console.log('gates.check.js — structural validation of config/gates.yaml');
for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'MISS'}  ${r.label}${r.shown ? `   → ${String(r.shown).slice(0, 60)}` : ''}`);
console.log(`\n=== ${failed.length ? 'FAILURES' : 'ALL PASS'} (${results.length - failed.length}/${results.length}) ===`);
process.exit(failed.length ? 1 : 0);
