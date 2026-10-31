/**
 * run-gate.js — conversational gate runner (one step at a time, state in
 * harness/out/session.json so gates span chat turns).
 *
 * Commands:
 *   node harness/run-gate.js new                     start session from golden/film_seed.json
 *   node harness/run-gate.js status                  show session + gate state
 *   node harness/run-gate.js gate G0                 show entry params (acquirable only)
 *   node harness/run-gate.js gate G1 [--edit '{...}']  show novel (+apply JSON merge into session.novel)
 *   node harness/run-gate.js gate G2                 show shot sheets
 *   node harness/run-gate.js confirm G0|G1|G2        record gate confirmation
 *   node harness/run-gate.js run node_a              live Node A (requires G0 confirmed)
 *   node harness/run-gate.js run node_b              live Node B per shot (requires G1 confirmed)
 *
 * Run with real Windows node on .js only:
 *   "C:\Program Files\nodejs\node.exe" harness/run-gate.js <cmd> [args]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderNovelDocument, renderShotSheet } from './lib/render-human.js';
import { derive, flatten, renderTimeline, renderMolecule, framesOf } from './lib/derive.js';
import { diffStates } from './lib/concern-axes.js';
import { foldStates } from './lib/concern-axes.js';

// strip JSON-schema meta keys not accepted by response_format.json_schema
function stripMeta(o) {
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    if (k.startsWith('$') || k.startsWith('_')) continue;
    out[k] = (v && typeof v === 'object' && !Array.isArray(v) && v.type)
      ? stripMeta(v)
      : Array.isArray(v)
        ? v.map((x) => (x && typeof x === 'object' ? stripMeta(x) : x))
        : v;
  }
  return out;
}

const root = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const SESSION = path.join(root, 'out', 'session.json');

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const h = line.trim();
    if (!h || h.startsWith('#')) continue;
    const eq = h.indexOf('='); if (eq < 1) continue;
    const k = h.slice(0, eq).trim();
    let v = h.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadDotEnv(path.join(root, '.env'));

const session = () => JSON.parse(fs.readFileSync(SESSION, 'utf8'));
const saveSession = (s) => fs.writeFileSync(SESSION, JSON.stringify(s, null, 2) + '\n', 'utf8');
const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const setv = (o, p, v) => { const ks = p.split('.'); const last = ks.pop(); ks.reduce((a, k) => (a[k] = a[k] || {}), o)[last] = v; };

// ---- LLM call (text-only; same wire shape as run-llm.test.js) ------------
const key = process.env.AGNES_API_KEY;
const base = (process.env.AGNES_BASE_URL || 'https://apihub.agnes-ai.com').replace(/\/$/, '');
const url = `${base}/chat/completions`;

async function call(body, label) {
  const REPAIR_MSG = '\n\nYour previous reply was not valid JSON (it was cut off or malformed). Re-send ONLY the complete JSON object that matches the schema. Do not include explanations, only the JSON.';
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    const b = JSON.parse(JSON.stringify(body));
    if (attempt > 0) { b.messages = [...b.messages]; b.messages[b.messages.length - 1].content = (b.messages[b.messages.length - 1].content || '') + REPAIR_MSG; }
    for (let sleepRound = 0; ; sleepRound++) {
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36 VisionMachine-Dev',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(b),
      });
      if (r.status === 429) {
        const wait = Math.min(30000, 4000 * 2 ** sleepRound);
        console.log(`    (429 rate-limit, ${label}: waiting ${wait}ms)`);
        await new Promise((res) => setTimeout(res, wait));
        continue; // retry the same body on 429
      }
      if (!r.ok) throw new Error(`${label} HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const d = await r.json();
      const p = d.data ? d.data : d;
      const c = p.choices[0].message.content;
      try {
        return JSON.parse(c);
      } catch (e) {
        lastErr = new Error(`${label}: bad JSON — ${e.message}`);
        break; // go to the repair retry (attempt++)
      }
    }
  }
  throw lastErr;
}

function buildNodeABody(seed, llm) {
  const reqA = read('fixtures/node_a.request.json');
  const body = JSON.parse(JSON.stringify(reqA.body));
  body.model = process.env.AGNES_TEXT_MODEL || llm.models.node_a;
  body.temperature = llm.generation.temperature.node_a;
  body.messages[1].content =
    `FilmSeed: ${JSON.stringify(seed)}\n` +
    `genre style: "${seed.genre.style}"\n` +
    `Hard counts: scenes.length == ${seed.scale.scenes}, scenes[*].shots.length == ${seed.scale.shotsPerScene}.\n` +
    `Respond with a single JSON object matching the VisualNovel schema only.`;
  return body;
}

function buildNodeBBody(novel, seed, scene, shot, llm, sceneSpec) {
  const reqB = read('fixtures/node_b.request.json');
  const body = JSON.parse(JSON.stringify(reqB.body));
  body.model = process.env.AGNES_TEXT_MODEL || llm.models.node_b;
  // molecular: response schema is now ShotMolecule (delta only), not flat ShotSpec
  body.response_format.json_schema = {
    name: 'ShotMolecule', strict: true,
    schema: stripMeta(read('schemas/shot_molecule.schema.json')),
  };
  body.messages[1].content =
    `SCENE BASE (inherit this, do NOT restate): ${JSON.stringify(sceneSpec)}\n` +
    `scene.title: ${scene.title}\nscene.prose: ${scene.prose}\n` +
    `shot.prose: ${shot.prose}\nshot.beats: ${JSON.stringify(shot.beats || [])}\n` +
    `ratio: ${seed.ratio}\nclip_s bounds: [${seed.scale.clipS[0]},${seed.scale.clipS[1]}] (goal: keep clip long enough for ≥24 frames @24fps)\n` +
    'Output ONLY the shot DELTA (ShotMolecule): subject + composition + lens + motion + effects_delta + audio(foley/sfx/music/silence) + transitions + clip_s. inherit = the scene base id. Leave prompts empty ({"image":"","video":""}) — they are filled deterministically, not by you. Every tag must be in the closed vocabulary.';
  return body;
}

// Node A′ : novel scene → SceneSpec (the stable base look, generated once per scene)
function buildSceneSpecBody(novel, scene, llm) {
  const body = {
    model: process.env.AGNES_TEXT_MODEL || llm.models.node_b,
    temperature: llm.generation.temperature.node_b,
    max_tokens: llm.generation.max_tokens.node_b,
    chat_template_kwargs: llm.generation.chat_template_kwargs,
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'SceneSpec', strict: true, schema: stripMeta(read('schemas/scene_spec.schema.json')) },
    },
    messages: [
      { role: 'system', content: 'You are the DP (director of photography). From the film block and this scene, define the STABLE LOOK of the scene (light, grade, ambience, tempo, base effects) — the base that every shot in the scene inherits. JSON only, schema fields only.' },
      { role: 'user', content:
        `film: ${JSON.stringify(novel.film)}\n` +
        `scene.title: ${scene.title}\nscene.prose: ${scene.prose}\n` +
        `scene.shots: ${JSON.stringify(scene.shots.map((s) => s.prose))}\n` +
        `genre style: ${novel.film.style}\n` +
        'Set scene_id to "scene_<n>". Pick enums from the tag vocabulary; keep light.color_temp_K within 2500–10000.' },
    ],
  };
  return body;
}

// SCENE DIVISION (the corrected single step): novel → SceneTimeline.
// One LLM call divides the whole novel into meaningful scene parts at the
// crucial transition points. Each scene carries its stable base look; each
// shot carries the meaningful change + the transition that ends it.
function buildSceneDivisionBody(novel, seed, llm) {
  return {
    model: process.env.AGNES_TEXT_MODEL || llm.models.node_b,
    temperature: llm.generation.temperature.node_b,
    max_tokens: llm.generation.max_tokens.node_b,
    chat_template_kwargs: llm.generation.chat_template_kwargs,
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'SceneTimeline', strict: true, schema: stripMeta(read('schemas/scene_timeline.schema.json')) },
    },
    messages: [
      { role: 'system', content: 'You are the editor. Divide the VisualNovel into MEANINGFUL SCENE PARTS at the crucial transition points (a transition = a real change in time of day, location, mood, character, or action). You ONLY decide structure: which novel shot goes where, how long each runs, where the cuts are, and each scene base time-of-day/weather. You do NOT add camera, lens, zoom, effects or grade — those are a later step. Rules: (1) 1-TO-1 — every novel shot appears exactly once as a timeline shot, referenced by novel_ref (e.g. scene_1.shot_2); do NOT invent shots or duplicate content. (2) A new scene part starts only at a genuine transition point; set its transition_in + transition_note (why it is new). (3) Each timeline shot sets novel_ref, clip_s (within the allowed range), transition_out + transition_note (why this cut happens). (4) First scene transition_in = hard_cut, transition_note = film opens. JSON only, schema fields only.' },
      { role: 'user', content:
        `film: ${JSON.stringify(novel.film)}\n` +
        `novel shots (each has novel_ref, prose, beats — reference by novel_ref):\n` +
        novel.scenes.map((sc, si) => sc.shots.map((sh, ki) =>
          `  scene_${si + 1} · shot_${ki + 1} (novel_ref: scene_${si + 1}.shot_${ki + 1})\n    prose: ${sh.prose}\n    beats: ${JSON.stringify(sh.beats || [])}`).join('\n')).join('\n') +
        `\nclip_s range: [${seed.scale.clipS[0]}, ${seed.scale.clipS[1]}] seconds. timeline_id = "tl_01".` },
    ],
  };
}

// S3 SPEC: one LLM call per confirmed timeline shot → concern-grouped ShotSpec
// with a sub-timeline (slices tracking dynamic changes, grounded in the novel beats).
function buildShotSpecBody(novel, seed, tlShot, llm) {
  // pull this shot's novel content (prose + beats) via novel_ref
  const m = (tlShot.novel_ref || '').match(/^scene_(\d+)\.shot_(\d+)$/);
  const nsh = m ? novel?.scenes?.[Number(m[1]) - 1]?.shots?.[Number(m[2]) - 1] : null;
  return {
    model: process.env.AGNES_TEXT_MODEL || llm.models.node_b,
    temperature: llm.generation.temperature.node_b,
    max_tokens: llm.generation.max_tokens.node_b,
    chat_template_kwargs: llm.generation.chat_template_kwargs,
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'ShotSpec', strict: true, schema: stripMeta(read('schemas/shot_spec.schema.json')) },
    },
    messages: [
      { role: 'system', content: 'You are the DOP + sound designer. Spec ONE shot by CONCERN. (1) Set "content" by COPYING the novel prose + beats exactly (the WHAT this shot shows) - the concern tags are only the HOW. (2) Group its tags by concern: camera (size/angle/framing/dof), lens (focal_mm/optics), motion (zoom/move/speed), lighting (key/contrast/color_temp_K/pattern), grade (palette/saturation/contrast/film_stock), effects, audio. Each concern holds ONLY its own tags, all clean enums from the tag vocabulary. (3) Build a sub_timeline: split the clip into up to 4 slices that track the dynamic changes. Each slice states the FULL concern state at that moment in "state" (clean enums) - a concern omitted keeps the previous value. Do NOT write deltas; the harness computes them. CRITICAL: if a slice note mentions a camera size/angle (e.g. "close-up"), set that exact value in the slice state.camera - the state is what downstream reads, the note is for humans only. Ground everything in the novel beats; do not invent changes. JSON only, schema fields only.' },
      { role: 'user', content:
        `shot: ${tlShot.shot_id} (novel_ref ${tlShot.novel_ref})\n` +
        `clip_s: ${tlShot.clip_s}s, in=${tlShot.transition_in} out=${tlShot.transition_out}\n` +
        `novel prose: ${nsh?.prose || ''}\n` +
        `novel beats: ${JSON.stringify(nsh?.beats || [])}\n` +
        `genre style: ${novel?.film?.style || ''}\n` +
        `Set shot_id to "${tlShot.shot_id}". Every tag must be a clean enum from the tag vocabulary. For each sub_timeline slice, fill "state" with the full concern groups at that moment (omit a group to keep the previous value) — do not write "changes", they are computed.` },
    ],
  };
}

// ---- commands -------------------------------------------------------------
const [, , cmd, ...rest] = process.argv;
const needGate = (g) => { const s = session(); if (!s.gates?.[g]?.confirmed) { console.log(`STOP: ${g} not confirmed yet (confirm with: run-gate.js confirm ${g})`); process.exit(1); } };

// Run the CLI only when this file is the entry point, not when imported.
const isMain = () => {
  try { return process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url; } catch { return false; }
};

if (isMain()) switch (cmd) {
  case 'new': {
    const seed = read('golden/film_seed.json');
    const s = {
      seed,
      novel: null,
      scenes: {},   // Node A′ : scene_id -> SceneSpec
      molecules: {}, // Node B : "Scene X · Shot Y" -> derived ShotMolecule (prompts filled)
      specs: {},    // legacy flat (kept for renderers)
      timeline: null, // SceneTimeline: the divided scene parts with transitions (the corrected flow)
      gates: { G0_entry: {}, G1_novel_review: {}, G2_spec_review: {} },
      log: [`new session ${new Date().toISOString()}`],
    };
    fs.mkdirSync(path.dirname(SESSION), { recursive: true });
    saveSession(s);
    console.log('session created: out/session.json');
    console.log('next: run-gate.js gate G0');
    break;
  }
  case 'status': {
    const s = session();
    console.log('seed:', s.seed.title, '| scenes', s.seed.scale.scenes, '× shots', s.seed.scale.shotsPerScene, '× clip', s.seed.scale.clipS.join('-'), 's');
    console.log('novel:', s.novel ? `${s.novel.scenes.length} scene(s) in session` : 'not generated');
    console.log('specs:', s.specs ? `${Object.keys(s.specs).length} shot spec(s)` : 'none');
    for (const [g, st] of Object.entries(s.gates)) console.log(`${g}: ${st.confirmed ? 'CONFIRMED ' + st.at : 'pending'}`);
    break;
  }
  case 'gate': {
    const g = rest[0];
    const s = session();
    const edit = rest.includes('--edit') ? JSON.parse(rest[rest.indexOf('--edit') + 1]) : null;
    if (edit) {
      // G1 edits merge into the novel before display
      Object.assign(s.novel, edit);
      saveSession(s);
      console.log('(edits applied to session.novel)');
    }
    if (g === 'G0') {
      console.log('GATE G0 — Entry parameters (acquirable)');
      const P = [
        ['input_text', s.seed.input_text || s.seed.idea],
        ['genre.name', s.seed.genre.name], ['genre.style', s.seed.genre.style],
        ['ratio', s.seed.ratio],
        ['scale.scenes', s.seed.scale.scenes],
        ['scale.shotsPerScene', s.seed.scale.shotsPerScene],
        ['scale.clipS', s.seed.scale.clipS.join('-') + ' s'],
      ];
      P.forEach(([k, v]) => console.log(`  ${k.padEnd(18)} = ${v}`));
      console.log('\nCONFIRM to proceed to Node A, or name changes (e.g. "scale.scenes=3, ratio=9:16").');
    } else if (g === 'G1') {
      if (!s.novel) { console.log('STOP: no novel yet — run "run-gate.js run node_a" first'); process.exit(1); }
      console.log(renderNovelDocument(s.novel));
      console.log('\nCONFIRM to proceed to Node B, or request edits / re-run Node A (backtrack).');
    } else if (g === 'G2') {
      // Preferred: the divided SceneTimeline (the corrected single-step flow)
      if (s.timeline) {
        printTimeline(s.timeline, s.seed, s.novel);
        if (s.specs && Object.keys(s.specs).length) { console.log(''); printSpecs(s.specs); }
        console.log('\nCONFIRM, or request a re-division ("run scene_divide") / re-spec ("run spec") / per-shot edits.');
        break;
      }
      // Fallback: legacy per-shot molecules
      const keys = Object.keys(s.molecules || {});
      if (!keys.length) { console.log('STOP: no molecules yet — run "run-gate.js run node_b" first'); process.exit(1); }
      // group molecules by their inherited scene
      const byScene = {};
      for (const [k, m] of Object.entries(s.molecules)) {
        (byScene[m.inherit] = byScene[m.inherit] || []).push({ k, m });
      }
      for (const sceneId of Object.keys(byScene)) {
        const sceneSpec = s.scenes[sceneId];
        const mols = byScene[sceneId].map(({ m }) => m);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`SCENE MOLECULE — ${sceneId} (base look)`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(JSON.stringify(sceneSpec, null, 2));
        console.log('');
        console.log(renderTimeline(sceneSpec, mols));
        console.log('');
        for (const { k, m } of byScene[sceneId]) {
          console.log(renderMolecule(sceneSpec, m));
          console.log('');
        }
      }
      console.log('CONFIRM to proceed (media stage is future), or request per-shot edits / re-run Node B.');
    }
    break;
  }
  case 'confirm': {
    const g = rest[0];
    const s = session();
    s.gates[g] = { confirmed: true, at: new Date().toISOString(), notes: rest.slice(1).join(' ') || 'ok' };
    saveSession(s);
    console.log(`${g} confirmed.`);
    break;
  }
  case 'run': {
    const step = rest[0];
    const s = session();
    if (!s.scenes) s.scenes = {};
    if (!s.molecules) s.molecules = {};
    if (!s.specs) s.specs = {};
    const llm = read('config/llm.json');
    if (step === 'node_a') {
      needGate('G0_entry');
      const t0 = Date.now();
      const novel = await call(buildNodeABody(s.seed, llm), 'node_a');
      s.novel = novel;
      s.log.push(`node_a ${Date.now() - t0}ms → ${novel.scenes.length} scene(s)`);
      saveSession(s);
      console.log(`Node A done (${Date.now() - t0}ms): ${novel.scenes.length} scene(s), ${novel.scenes.reduce((n, sc) => n + sc.shots.length, 0)} shot(s).`);
      console.log('next: run-gate.js gate G1');
    } else if (step === 'scene_a') {
      needGate('G1_novel_review');
      for (const [si, scene] of novelIdx(s.novel)) {
        const t0 = Date.now();
        const spec = await call(buildSceneSpecBody(s.novel, scene, llm), `scene_a ${scene.title}`);
        spec.scene_id = spec.scene_id || `scene_${si + 1}`;
        s.scenes[spec.scene_id] = spec;
        s.sceneIndex = s.sceneIndex || {};
        s.sceneIndex[si] = spec.scene_id;
        s.log.push(`scene_a ${spec.scene_id} ${Date.now() - t0}ms`);
      }
      saveSession(s);
      console.log(`Node A′ done: ${Object.keys(s.scenes).length} SceneSpec(s) — the stable base look per scene.`);
      console.log('next: run-gate.js run node_b');
    } else if (step === 'scene_divide') {
      needGate('G1_novel_review');
      const t0 = Date.now();
      const timeline = await call(buildSceneDivisionBody(s.novel, s.seed, llm), 'scene_divide');
      s.timeline = timeline;
      s.log.push(`scene_divide ${Date.now() - t0}ms → ${timeline.scenes.length} scene part(s), ${timeline.scenes.reduce((n, sc) => n + sc.shots.length, 0)} shot(s)`);
      saveSession(s);
      console.log(`Scene division done (${Date.now() - t0}ms): ${timeline.scenes.length} scene part(s), ${timeline.scenes.reduce((n, sc) => n + sc.shots.length, 0)} shot(s).`);
      console.log('next: run-gate.js run timeline');
    } else if (step === 'timeline') {
      needGate('G1_novel_review');
      if (!s.timeline) { console.log('STOP: run "run-gate.js run scene_divide" first'); process.exit(1); }
      printTimeline(s.timeline, s.seed, s.novel);
      // structural integrity checks (the 1-to-1 + no-duplicate-content guards)
      const refs = (s.timeline.scenes || []).flatMap((sc) => sc.shots.map((sh) => sh.novel_ref));
      const totalNovelShots = (s.novel?.scenes || []).reduce((n, sc) => n + (sc.shots?.length || 0), 0);
      const issues = [];
      if (refs.length !== totalNovelShots) issues.push(`novel has ${totalNovelShots} shots but timeline references ${refs.length}`);
      if (new Set(refs).size !== refs.length) issues.push('duplicate novel_ref (a shot used twice)');
      const known = new Set((s.novel?.scenes || []).flatMap((sc, si) => sc.shots.map((_, ki) => `scene_${si + 1}.shot_${ki + 1}`)));
      refs.forEach((r) => { if (!known.has(r)) issues.push(`unknown novel_ref "${r}"`); });
      if (issues.length) { console.log('\nSTRUCTURE WARNINGS:'); issues.forEach((x) => console.log('  • ' + x)); }
      else console.log(`\nSTRUCTURE OK: ${refs.length} novel shot(s) → 1-to-1 timeline, no duplicates, no orphans.`);
      saveSession(s);
      console.log('next: run-gate.js run spec');
    } else if (step === 'spec') {
      needGate('G1_novel_review');
      if (!s.timeline) { console.log('STOP: run "run-gate.js run scene_divide" first'); process.exit(1); }
      const specs = {};
      for (const sc of s.timeline.scenes) {
        let prevOut = null;
        for (const tlShot of sc.shots) {
          const t0 = Date.now();
          const spec = await call(buildShotSpecBody(s.novel, s.seed, tlShot, llm), `spec ${tlShot.shot_id}`);
          // carry the NOVEL content (the WHAT) into the spec so it is never lost —
          // resolved deterministically from novel_ref, not re-written by the LLM.
          const m = (tlShot.novel_ref || '').match(/^scene_(\d+)\.shot_(\d+)$/);
          const nsh = m ? s.novel?.scenes?.[Number(m[1]) - 1]?.shots?.[Number(m[2]) - 1] : null;
          spec.content = { prose: nsh?.prose || spec.content?.prose || '', beats: nsh?.beats || [] };
          // shot's entry cut: scene cut-in for the first shot, else previous shot's cut-out
          spec.transition_in = prevOut ?? sc.transition_in;
          spec.transition_out = tlShot.transition_out;
          spec.clip_s = tlShot.clip_s;
          // compute sub-timeline deltas from the per-slice concern states (never free-text).
          // foldStates carries forward omitted fields + normalizes each value to its
          // nearest clean enum, so deltas are clean (no "∅", no out-of-vocab).
          const effStates = foldStates(spec.concerns, (spec.sub_timeline || []).map((sl) => sl.state));
          (spec.sub_timeline || []).forEach((sl, i) => {
            sl.changes = diffStates(effStates[i], effStates[i + 1]);
          });
          prevOut = spec.transition_out;
          specs[tlShot.shot_id] = spec;
          s.log.push(`spec ${tlShot.shot_id} ${Date.now() - t0}ms`);
        }
      }
      s.specs = specs;
      saveSession(s);
      printSpecs(specs);
      console.log(`\nS3 spec done: ${Object.keys(specs).length} shot spec(s) with concern groups + sub-timelines.`);
      console.log('next: run-gate.js gate G2');
    } else if (step === 'node_b') {
      // legacy molecular Node B (kept for backward compat with old sessions)
      needGate('G1_novel_review');
      if (!Object.keys(s.scenes).length) { console.log('STOP: run "run-gate.js run scene_a" first'); process.exit(1); }
      let i = 0;
      for (const [si, scene] of novelIdx(s.novel)) {
        const sceneSpec = s.scenes[s.sceneIndex[si]] || s.scenes[Object.keys(s.scenes)[0]];
        for (const shot of scene.shots) {
          const label = `Scene ${si + 1} · Shot ${i + 1}`;
          const t0 = Date.now();
          const molecule = await call(buildNodeBBody(s.novel, s.seed, scene, shot, llm, sceneSpec), `node_b ${label}`);
          molecule.inherit = sceneSpec.scene_id;
          molecule.subject = shot.prose || molecule.subject || label;
          const derived = derive(sceneSpec, molecule);
          s.molecules[label] = derived;
          s.specs[label] = flatten(sceneSpec, derived);
          s.log.push(`node_b(mol) ${label} ${Date.now() - t0}ms`);
          i++;
        }
      }
      saveSession(s);
      console.log(`Node B (molecular) done: ${i} shot molecule(s).`);
      console.log('next: run-gate.js gate G2');
    } else {
      console.log('unknown step: ' + step); process.exit(1);
    }
    break;
  }
  default:
    console.log('usage: run-gate.js new | status | gate G0|G1|G2 [--edit json] | confirm G0|G1|G2 | run node_a | run scene_a | run node_b');
}

function novelIdx(novel) { return (novel.scenes || []).map((sc, i) => [i, sc]); }

// Deterministic timeline print: walk the divided scene parts, accumulate
// timecodes, mark each crucial transition point, check the frame floor.
// S2 timeline: structure + novel content only (NO camera/lens/zoom — that's S3).
// Each shot is resolved to its novel content via novel_ref.
function resolveNovelShot(novel, novelRef) {
  const m = (novelRef || '').match(/^scene_(\d+)\.shot_(\d+)$/);
  if (!m || !novel?.scenes) return null;
  const sc = novel.scenes[Number(m[1]) - 1];
  const sh = sc?.shots?.[Number(m[2]) - 1];
  return sh ? { prose: sh.prose, beats: sh.beats || [] } : null;
}
function printTimeline(tl, seed, novel) {
  const FPS = 24, MINF = 24, TARGETF = 40;
  const total = tl.scenes.reduce((a, sc) => a + sc.shots.reduce((b, s) => b + s.clip_s, 0), 0);
  console.log(`TIMELINE ${tl.timeline_id} — ${tl.scenes.length} scene part(s), ${FPS} fps, ${total}s = ${total * FPS} frames`);
  console.log(`frame floor: min ${MINF}f / target ${TARGETF}f (soft)`);
  console.log('');
  let t = 0; let step = 0;
  for (const sc of tl.scenes) {
    console.log(`── SCENE ${sc.scene_id} · "${sc.title}" (${sc.time_of_day}${sc.weather ? ', ' + sc.weather : ''}) ──`);
    if (sc.transition_in !== 'hard_cut') console.log(`   cut-IN: ${sc.transition_in} — ${sc.transition_note}`);
    else console.log(`   cut-IN: film opens — ${sc.transition_note}`);
    console.log('');
    for (const sh of sc.shots) {
      step++;
      const f = sh.clip_s * FPS;
      const flag = f < MINF ? `  [UNDER MIN: ${f}f]` : f < TARGETF ? `  [tight: ${f}f]` : '';
      const content = resolveNovelShot(novel, sh.novel_ref);
      console.log(`   [${t}s → ${t + sh.clip_s}s]  step ${step}  ·  ${sh.clip_s}s = ${f}f${flag}`);
      console.log(`      novel_ref: ${sh.novel_ref}`);
      if (content) {
        console.log(`      CONTENT: ${content.prose}`);
        content.beats.forEach((b, i) => console.log(`        beat ${i + 1}: ${b}`));
      }
      console.log(`      cut-OUT: ${sh.transition_out} — ${sh.transition_note}`);
      t += sh.clip_s;
    }
    console.log('');
  }
  console.log(`[total ${t}s = ${t * FPS} frames]`);
}

// S3 print: each shot's concern groups + its sub-timeline, step by step.
function printSpecs(specs) {
  const bar = '━'.repeat(56);
  for (const [id, sp] of Object.entries(specs)) {
    const c = sp.concerns || {};
    console.log(bar);
    console.log(`SHOT ${id} (${sp.novel_ref}) - ${sp.clip_s}s, in=${sp.transition_in} out=${sp.transition_out}`);
    console.log(bar);
    // CONTENT FIRST: what the shot is (the novel), then how it is shot.
    if (sp.content?.prose) {
      console.log('  WHAT:');
      console.log('    ' + sp.content.prose);
      (sp.content.beats || []).forEach((b, i) => console.log(`    beat ${i + 1}: ${b}`));
      console.log('');
    }
    console.log('  HOW (by concern):');
    const grp = (label, rows) => { if (rows.length) { console.log(`    ${label}:`); rows.forEach((r) => console.log(`      . ${r}`)); } };
    grp('camera', [
      c.camera?.size ? `size=${c.camera.size}` : null,
      c.camera?.angle ? `angle=${c.camera.angle}` : null,
      c.camera?.framing ? `framing=${c.camera.framing}` : null,
      c.camera?.dof ? `dof=${c.camera.dof}` : null,
    ].filter(Boolean));
    grp('lens', [c.lens?.focal_mm ? `${c.lens.focal_mm}mm${c.lens.distortion && c.lens.distortion !== 'none' ? ' (' + c.lens.distortion + ')' : ''}` : null].filter(Boolean));
    grp('motion', [
      c.motion?.zoom && c.motion.zoom !== 'static' ? `zoom=${c.motion.zoom}` : null,
      c.motion?.move && c.motion.move !== 'static' ? `move=${c.motion.move}` : null,
      c.motion?.speed ? `speed=${c.motion.speed}` : null,
    ].filter(Boolean));
    grp('lighting', [c.lighting ? `key=${c.lighting.key} ${c.lighting.contrast}-contrast ${c.lighting.color_temp_K}K ${c.lighting.pattern}` : null].filter(Boolean));
    grp('grade', [c.grade ? `${c.grade.palette} / ${c.grade.saturation} / ${c.grade.film_stock}` : null].filter(Boolean));
    grp('effects', (c.effects || []).filter((e) => e !== 'none'));
    grp('audio', [
      c.audio?.foley ? `foley=${c.audio.foley}` : null,
      c.audio?.sfx ? `sfx=${c.audio.sfx}` : null,
      c.audio?.music_cue ? `music=${c.audio.music_cue}` : null,
      c.audio?.silence ? 'SILENCE' : null,
    ].filter(Boolean));
    if (sp.sub_timeline?.length) {
      console.log('  SUB-TIMELINE (dynamic slices):');
      sp.sub_timeline.forEach((sl, i) => {
        console.log(`    [${sl.from_s}s to ${sl.to_s}s] slice ${i + 1}: ${sl.note}`);
        (sl.changes || []).forEach((ch) => console.log(`        delta: ${ch}`));
        if (!(sl.changes || []).length) console.log('        (no concern change in this slice)');
      });
    }
    console.log('');
  }
}

// ---------------------------------------------------------------------------
// Reusable pipeline helpers (used by batch-variants.js). The full text
// mutation chain: S1 novel -> S2 division -> S3 spec, no media.
// ---------------------------------------------------------------------------

// S3: spec every shot in a divided timeline (concern groups + sub-timeline
// with computed deltas + carried novel content).
async function specFromTimeline(timeline, novel, seed, llm) {
  const specs = {};
  for (const sc of timeline.scenes) {
    let prevOut = null;
    for (const tlShot of sc.shots) {
      const spec = await call(buildShotSpecBody(novel, seed, tlShot, llm), `spec ${tlShot.shot_id}`);
      const m = (tlShot.novel_ref || '').match(/^scene_(\d+)\.shot_(\d+)$/);
      const nsh = m ? novel?.scenes?.[Number(m[1]) - 1]?.shots?.[Number(m[2]) - 1] : null;
      spec.content = { prose: nsh?.prose || spec.content?.prose || '', beats: nsh?.beats || [] };
      spec.transition_in = prevOut ?? sc.transition_in;
      spec.transition_out = tlShot.transition_out;
      spec.clip_s = tlShot.clip_s;
      const effStates = foldStates(spec.concerns, (spec.sub_timeline || []).map((sl) => sl.state));
      (spec.sub_timeline || []).forEach((sl, i) => { sl.changes = diffStates(effStates[i], effStates[i + 1]); });
      prevOut = spec.transition_out;
      specs[tlShot.shot_id] = spec;
    }
  }
  return specs;
}

// Full chain on a single FilmSeed: S1 (Node A) -> S2 (scene division) -> S3 (spec).
// Returns { seed, novel, timeline, specs } — a complete text-only pipeline result.
export async function runPipeline(seed) {
  const llm = read('config/llm.json');
  const t0 = Date.now();
  const novel = await call(buildNodeABody(seed, llm), 'S1 novel');
  const timeline = await call(buildSceneDivisionBody(novel, seed, llm), 'S2 division');
  const specs = await specFromTimeline(timeline, novel, seed, llm);
  return {
    seed, novel, timeline, specs,
    ms: Date.now() - t0,
    sceneParts: timeline.scenes.length,
    shotCount: timeline.scenes.reduce((n, sc) => n + sc.shots.length, 0),
  };
}

// Also export the pieces other tools may want.
export { call, buildNodeABody, buildSceneDivisionBody, buildShotSpecBody, diffStates, foldStates };


