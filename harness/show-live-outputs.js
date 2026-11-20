/**
 * show-live-outputs.js — one-shot live run for BOTH nodes, print FULL raw LLM
 * output + per-field scorecard vs OUR config expectations.
 * No media generation. Text-only smoke test: how the LLM interprets our
 * response_format=json_schema request model.
 *
 * Run (real Windows node on .js only):
 *   "C:\Program Files\nodejs\node.exe" harness/show-live-outputs.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderHumanReport } from './lib/render-human.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

// --- load .env (dev-only, gitignored) --------------------------------------
function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const h = line.trim();
    if (!h || h.startsWith('#')) continue;
    const eq = h.indexOf('=');
    if (eq < 1) continue;
    const k = h.slice(0, eq).trim();
    let v = h.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadDotEnv(path.join(root, '.env'));

const key = process.env.AGNES_API_KEY;
if (!key) { console.error('AGNES_API_KEY missing in harness/.env'); process.exit(2); }
const base = (process.env.AGNES_BASE_URL || 'https://apihub.agnes-ai.com').replace(/\/$/, '');
const modelA = process.env.AGNES_TEXT_MODEL || 'agnes-2.5-flash';
const modelB = process.env.AGNES_TEXT_MODEL || 'agnes-2.5-flash';
const url = `${base}/chat/completions`;

const reqA = read('fixtures/node_a.request.json').body;
const reqB = read('fixtures/node_b.request.json').body;
reqA.model = modelA;
reqB.model = modelB;

const call = async (body, label) => {
  const t0 = Date.now();
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 VisionMachine-Dev',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
  const ms = Date.now() - t0;
  if (!r.ok) throw new Error(`${label} HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  const pick = (o) => o.choices[0];
  const p = d.data ? d.data : d;
  const c = pick(p).message.content;
  if (typeof c !== 'string') throw new Error(`${label}: content missing`);
  let json = null, parseError = null;
  try { json = JSON.parse(c); } catch (e) { parseError = e.message; }
  // detect degenerate repetition loop (a config defect, not a network issue)
  const noaiCount = (c.match(/no AI-generated/g) || []).length;
  return { json, raw: c, parseError, repetitionLoop: noaiCount > 5, ms, usage: p.usage, finish: pick(p).finish_reason };
};

// Build a Node B request body that points at a specific live novel shot.
function buildNodeBBody(novel, filmSeed, shotCtx) {
  const body = JSON.parse(JSON.stringify(reqB));
  body.model = modelB;
  body.messages[1].content =
    `film: ${JSON.stringify(novel.film)}\n` +
    `scene.title: ${shotCtx.sceneTitle}\n` +
    `scene.prose: ${shotCtx.sceneProse}\n` +
    `shot.prose: ${shotCtx.shotProse}\n` +
    `shot.beats: ${JSON.stringify(shotCtx.beats)}\n` +
    `ratio: ${filmSeed.ratio}\n` +
    `clip_s bounds: [${filmSeed.scale.clipS[0]},${filmSeed.scale.clipS[1]}]\n` +
    `spec profile: cinema (temp 0.3, payload_target=plan, grade.saturation=neutral, transitions=[hard_cut,crossfade,dissolve,match_cut,cut_on_action])\n` +
    'Allowed enums from tag_vocabulary.yaml apply to every tag field.';
  return body;
}

async function main() {
  const filmSeed = read('golden/film_seed.json');
  const shotSchema = read('schemas/shot_spec.schema.json');

  // ---- tag vocabulary (for scorecards) ------------------------------------
  const tags = (() => {
    const txt = fs.readFileSync(path.join(root, 'config', 'tag_vocabulary.yaml'), 'utf8');
    const out = {};
    let inTags = false, cur = null, buf = '';
    const flush = () => { if (cur) { const items = buf.replace(/[[\]]/g, '').split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean); if (items.length) out[cur] = items; cur = null; buf = ''; } };
    for (const raw of txt.split(/\r?\n/)) {
      const h = raw.trim();
      if (h === 'tags:') { inTags = true; continue; }
      if (!inTags) continue;
      if (!h || h.startsWith('#')) continue;
      const m = h.match(/^([a-z_]+):\s*(.*)$/);
      if (m && !h.startsWith('- ')) { flush(); cur = m[1]; buf = m[2] || ''; }
      else if (cur) buf += ' ' + h;
    }
    flush();
    return out;
  })();

  // ---- Node A: text → visual novel -----------------------------------------
  const A = await call(reqA, 'node_a');
  const cap = (s, n) => s.length > n ? s.slice(0, n) + `\n…[TRUNCATED — repetition loop]` : s;
  const capA = A.repetitionLoop ? 800 : 3000;

  console.log('================================================================');
  console.log(`LIVE — Node A  (text → visual novel)   model=${modelA}`);
  console.log(`elapsed=${A.ms}ms  tokens=${A.usage?.total_tokens}  finish=${A.finish}`);
  if (A.parseError) console.log(`⚠ JSON PARSE FAILED: ${A.parseError}`);
  if (A.repetitionLoop) console.log('⚠ REPETITION LOOP detected (config defect)');
  console.log('================================================================');
  console.log(cap(A.raw, capA));

  if (A.parseError || !A.json) {
    console.log('\nFATAL: Node A did not produce valid JSON. Cannot proceed.');
    process.exit(1);
  }

  // ---- Node B: per-shot → ShotSpec ----------------------------------------
  const novel = A.json;
  const allShots = [];
  for (let si = 0; si < (novel.scenes || []).length; si++) {
    const scene = novel.scenes[si];
    for (let ki = 0; ki < (scene.shots || []).length; ki++) {
      allShots.push({
        si, ki,
        ctx: {
          sceneTitle: scene.title || `Scene ${si + 1}`,
          sceneProse: scene.prose || '',
          shotProse: scene.shots[ki].prose || '',
          beats: scene.shots[ki].beats || [],
        },
        label: `Scene ${si + 1} · Shot ${ki + 1}`,
      });
    }
  }

  const B_results = [];
  for (const shot of allShots) {
    const body = buildNodeBBody(novel, filmSeed, shot.ctx);
    const B = await call(body, `node_b_${shot.label}`);
    B_results.push({ shot, B });
    console.log('');
    console.log('================================================================');
    console.log(`LIVE — Node B  ${shot.label}  → ShotSpec   model=${modelB}`);
    console.log(`elapsed=${B.ms}ms  tokens=${B.usage?.total_tokens}  finish=${B.finish}`);
    if (B.parseError) console.log(`⚠ JSON PARSE FAILED: ${B.parseError}`);
    console.log('================================================================');
    console.log(cap(B.raw, B.repetitionLoop ? 800 : 3000));
  }

  // ---- Human-readable report -----------------------------------------------
  const entryText = filmSeed.input_text || filmSeed.idea;
  const genreLabel = filmSeed.genre ? `${filmSeed.genre.name} (${filmSeed.genre.style})` : '';
  const ratio = filmSeed.ratio;

  const shotsForReport = B_results
    .filter(({ B }) => B.json)
    .map(({ shot, B }) => ({
      ctx: { shotLabel: shot.label, ratio },
      spec: B.json,
    }));

  const report = renderHumanReport({
    entryText,
    genre: genreLabel,
    ratio,
    novel,
    shots: shotsForReport,
  });

  const outDir = path.join(root, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'human-report.md');
  fs.writeFileSync(outPath, report, 'utf8');

  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  HUMAN REPORT — your text → visual novel → structured shots ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(report);
  console.log('');
  console.log(`(also saved to: ${outPath})`);

  // ---- scorecards -----------------------------------------------------------
  function printScorecard(title, sc) {
    console.log('\n================================================================');
    console.log(`${title}   ${sc.pass}/${sc.total}`);
    console.log('================================================================');
    for (const [label, shown, ok] of sc.checks) {
      const s = (typeof shown === 'string' ? shown.slice(0, 70) : String(shown));
      console.log(`  ${ok ? 'PASS' : 'MISS'}  ${label}   → ${s}`);
    }
  }

  let A_sc;
  const novelJson = JSON.stringify(novel);
  const scenesJson = JSON.stringify(novel.scenes || []);
  const lastShotProse = (novel.scenes[0]?.shots[1]?.prose) || '';
  const A_checks = [
    ['A1. film.* 7/7 fields present', 'present: ' + Object.keys(novel.film || {}).length,
      ['title','logline','style','world','palette','time_of_day','weather'].every(k => k in (novel.film||{}))],
    ['A2. scenes.length == scale.scenes (' + filmSeed.scale.scenes + ')', 'got ' + novel.scenes.length,
      novel.scenes.length === filmSeed.scale.scenes],
    ['A3. shots.length == scale.shotsPerScene (' + filmSeed.scale.shotsPerScene + ')', 'got ' + novel.scenes[0].shots.length,
      novel.scenes[0].shots.length === filmSeed.scale.shotsPerScene],
    ['A4. time_of_day ∈ enum', novel.film.time_of_day,
      ['dawn','morning','midday','afternoon','evening','night'].includes(novel.film.time_of_day)],
    ['A5. weather mentions clouds', novel.film.weather,
      /cloud|overcast|drizzle|shower/i.test(novel.film.weather)],
    ['A6. palette reflects dusk/evening', novel.film.palette,
      /dusk|night|evening|indigo|teal|blue|violet/i.test(novel.film.palette)],
    ['A7. world has forest + animals', (novel.film.world||'').slice(0,60),
      /forest/i.test(novel.film.world) && /(animal|bird|deer|wild)/i.test(novelJson)],
    ['A8. grizzly/bear present', /grizzly|bear/i.test(scenesJson) ? 'found' : 'ABSENT',
      /grizzly|bear/i.test(scenesJson)],
    ['A9. calming beat in last shot', lastShotProse.slice(0,60) + '…',
      /calm|friend|soothe|peace|gentle|befriend|lowers its head|settles/i.test(lastShotProse)],
    ['A10. no on-screen text phrases', /subtitle|caption|title card/i.test(novelJson) ? 'TEXT FOUND' : 'clean',
      !/(subtitle|caption|title card)/i.test(novelJson)],
  ];
  A_sc = { pass: A_checks.filter(c => c[2]).length, total: A_checks.length, checks: A_checks };

  // aggregate Node B scorecard across all shots
  const B_checks = [];
  for (const { shot, B } of B_results) {
    if (B.parseError || !B.json) {
      B_checks.push([`B(${shot.label}). JSON parses`, `PARSE FAILED`, false]);
      continue;
    }
    const b = B.json;
    const perShot = [
      ['all 18 required fields', 'got ' + Object.keys(b).length, shotSchema.required.every(r => r in b)],
      ['size ∈ vocab', b.size, tags.size.includes(b.size)],
      ['angle ∈ vocab', b.angle, tags.angle.includes(b.angle)],
      ['framing ∈ vocab', b.framing, tags.framing.includes(b.framing)],
      ['dof ∈ vocab', b.dof, tags.dof.includes(b.dof)],
      ['lens.focal_mm valid', b.lens?.focal_mm, [14,24,35,50,85,135].includes(b.lens?.focal_mm)],
      ['zoom ∈ vocab', b.zoom, tags.zoom.includes(b.zoom)],
      ['move ∈ vocab', b.move, tags.move.includes(b.move)],
      ['speed ∈ vocab', b.speed, tags.speed.includes(b.speed)],
      ['light.key ∈ vocab', b.light?.key, ['soft','hard','low-key','high-key','backlit'].includes(b.light?.key)],
      ['color_temp_K valid', b.light?.color_temp_K,
        b.light?.color_temp_K >= 2500 && b.light?.color_temp_K <= 10000],
      ['grade.film_stock valid', b.grade?.film_stock,
        tags.film_stock ? tags.film_stock.includes(b.grade?.film_stock) : true],
      ['effects ⊆ vocab', JSON.stringify(b.effects),
        (b.effects||[]).every(e => tags.effects.includes(e))],
      ['tempo ∈ vocab', b.tempo, tags.tempo.includes(b.tempo)],
      ['transition_in ∈ vocab', b.transition_in, tags.transition.includes(b.transition_in)],
      ['transition_out ∈ vocab', b.transition_out, tags.transition.includes(b.transition_out)],
      ['clip_s within ' + filmSeed.scale.clipS.join(','), b.clip_s,
        b.clip_s >= filmSeed.scale.clipS[0] && b.clip_s <= filmSeed.scale.clipS[1]],
      ['identity-lock line', /first frame identical/i.test(b.prompts?.video||'') ? 'present' : 'MISSING',
        /first frame identical/i.test(b.prompts?.video||'')],
    ];
    for (const [label, shown, ok] of perShot) B_checks.push([`B(${shot.label}) ${label}`, shown, ok]);
  }
  const B_sc = { pass: B_checks.filter(c => c[2]).length, total: B_checks.length, checks: B_checks };

  printScorecard('SCORECARD — Node A (config expectations)', A_sc);
  printScorecard('SCORECARD — Node B (all shots, tag vocabulary)', B_sc);

  // ---- deviations (config nudge points) ------------------------------------
  const dev = [];
  if (A.repetitionLoop) dev.push('Node A repetition loop → tighten prompt + lower temp');
  if (A.parseError) dev.push('Node A JSON invalid (max_tokens truncation)');
  for (const { shot, B } of B_results) {
    if (!B.json) continue;
    if (B.json.audio?.silence === false && B.json.audio?.music_cue)
      dev.push(`${shot.label}: music_cue "${B.json.audio.music_cue}" despite ambient-only rule`);
  }
  if (dev.length) {
    console.log('\n================================================================');
    console.log('DEVIATIONS → config nudge points');
    console.log('================================================================');
    dev.forEach(d => console.log('  • ' + d));
  }

  const total = A_sc.pass + B_sc.pass, tot = A_sc.total + B_sc.total;
  console.log('\nTOTAL: ' + total + '/' + tot + ' expectations met (' + Math.round(100*total/tot) + '%)');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
