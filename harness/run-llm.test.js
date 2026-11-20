/**
 * run-llm.test.js — closes the LLM request/response loop for both nodes.
 *
 * MOCK mode (default, no API key needed — green in CI):
 *   1. config integrity: fixture request bodies embed the exact schema files
 *      (response_format.json_schema.schema === schemas/*.json, meta-stripped)
 *      and the exact models/temps from config/llm.json + profiles.yaml.
 *   2. fixture responses: data.choices[0].message.content parses to JSON,
 *      validates against the response schema, and deep-equals the golden
 *      vector (golden/*.json).
 *   3. tag-vocabulary: every enum in the Node B fixture schema is a subset
 *      of the closed sets in config/tag_vocabulary.yaml.
 *
 * LIVE mode (--live, requires AGNES_API_KEY):
 *   1. POSTs each fixture request body to provider.base_url + chat_path,
 *      parses content, validates against the schema,
 *   2. on validation failure: retry loop (llm.json's retry.attempts)
 *      appending the errors into the system prompt (2-retry repair,
 *      mirroring the source repo's llmJSON).
 *
 * Run (real Windows node on .js only — never .node wrappers):
 *   "C:\Program Files\nodejs\node.exe" harness/run-llm.test.js            # mock
 *   AGNES_API_KEY=... "C:\Program Files\nodejs\node.exe" harness/run-llm.test.js --live
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate, deepEqual, stripMeta } from './lib/validator.js';
import { readTagSets } from './lib/tagsets.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const LIVE = process.argv.includes('--live');

// --- minimal .env loader (dev-only; gitignored) ----------------------------
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
if (LIVE) loadDotEnv(path.join(root, '.env'));

// tag-field mapping: ShotSpec field -> tag_vocabulary.yaml set
const TAGMAP = {
  'concerns.camera.size': 'size',
  'concerns.camera.angle': 'angle',
  'concerns.camera.framing': 'framing',
  'concerns.camera.dof': 'dof',
  'concerns.lens.focal_mm': 'lens_focal',
  'concerns.motion.zoom': 'zoom',
  'concerns.motion.move': 'move',
  'concerns.motion.speed': 'speed',
  'concerns.lighting.key': 'light_key',
  'concerns.grade.film_stock': 'film_stock',
  'concerns.effects': 'effects',
  'transition_in': 'transition',
  'transition_out': 'transition',
};
const enumAt = (schema, p) => {
  let node = schema;
  for (const part of p.split('.')) {
    node = (node && node.properties ? node.properties[part] : undefined) || (node && node.items ? node.items[part] : undefined);
  }
  return node;
};

const results = [];
function check(label, cond, detail) {
  results.push({ label, pass: !!cond, detail: detail || '' });
  console.log(`  ${cond ? 'pass' : 'FAIL'}  ${label}${!cond && detail ? '  -> ' + detail : ''}`);
}

// ---------------------------------------------------------------------------
// 1) config integrity: fixtures embed the standalone schema files exactly
// ---------------------------------------------------------------------------
console.log('\n[config integrity] fixture request bodies vs standalone files');
const filmSeed = read('golden/film_seed.json');
const goldenNovel = read('golden/visual_novel.json');
const goldenShot = read('golden/shot_spec.json');
const llm = read('config/llm.json');
const visualNovelSchema = read('schemas/visual_novel.schema.json');
const shotSpecSchema = read('schemas/shot_spec.schema.json');

const reqA = read('fixtures/node_a.request.json');
const reqB = read('fixtures/node_b.request.json');
const resA = read('fixtures/node_a.response.json');
const resB = read('fixtures/node_b.response.json');

// schema embedded in request A === schemas/visual_novel.schema.json
const embA = stripMeta(reqA.body.response_format.json_schema.schema);
const refA = stripMeta(visualNovelSchema);
check('node_a.request embeds schemas/visual_novel.schema.json', deepEqual(embA, refA));
check('node_a.request response_format name', reqA.body.response_format.json_schema.name === 'VisualNovel');
check('node_a.request model == llm.json models.node_a', reqA.body.model === llm.models.node_a, `${reqA.body.model}`);
check('node_a.request temperature == llm.json generation.temperature.node_a',
  reqA.body.temperature === llm.generation.temperature.node_a, `${reqA.body.temperature}`);
check('node_a.request user content carries golden FilmSeed',
  reqA.body.messages[1].content.includes(JSON.stringify(filmSeed).slice(1, -1)) ||
  reqA.body.messages[1].content.includes(filmSeed.title));

// schema embedded in request B === schemas/shot_spec.schema.json
const embB = stripMeta(reqB.body.response_format.json_schema.schema);
const refB = stripMeta(shotSpecSchema);
check('node_b.request embeds schemas/shot_spec.schema.json', deepEqual(embB, refB));
check('node_b.request response_format name', reqB.body.response_format.json_schema.name === 'ShotSpec');
check('node_b.request model == llm.json models.node_b', reqB.body.model === llm.models.node_b, `${reqB.body.model}`);
check('node_b.request temperature == llm.json generation.temperature.node_b',
  reqB.body.temperature === llm.generation.temperature.node_b, `${reqB.body.temperature}`);

// tag_vocabulary coverage against the embedded Node B schema
const tags = readTagSets(root);
for (const [field, set] of Object.entries(TAGMAP)) {
  const allowed = tags[set].map(String);
  if (!allowed.length) { check(`tag_vocabulary.${set} present`, false, 'missing set'); continue; }
  const node = enumAt(embB, field);
  const enumVals = field === 'concerns.effects' ? (node && node.items && node.items.enum) || [] : node && node.enum || [];
  const outside = enumVals.filter((v) => !allowed.includes(String(v)));
  check(`node_b schema .${field} ⊆ tag_vocabulary.${set}`, outside.length === 0,
    outside.length ? `outside: ${outside}` : `ok (${enumVals.length})`);
}
// clip_s bounds match film_seed scale in the fixture
check('node_b fixture clip_s bounds [8,10] stated in user content',
  reqB.body.messages[1].content.includes('[8,10]'));

// ---------------------------------------------------------------------------
// 2) fixture responses parse + validate + match golden vectors
// ---------------------------------------------------------------------------
console.log('\n[response contract] fixture responses vs schema + golden');
const contentOf = (r) => r.data.choices[0].message.content;
const parseA = JSON.parse(contentOf(resA));
const parseB = JSON.parse(contentOf(resB));
check('node_a.response content parses to JSON object', typeof parseA === 'object' && !Array.isArray(parseA));
check('node_b.response content parses to JSON object', typeof parseB === 'object' && !Array.isArray(parseB));

const aErrs = validate(visualNovelSchema, parseA);
check('node_a.response conforms to VisualNovel schema', aErrs.length === 0, aErrs.join(' | '));
const bErrs = validate(shotSpecSchema, parseB);
check('node_b.response conforms to ShotSpec schema', bErrs.length === 0, bErrs.join(' | '));

check('node_a.response deep-equals golden/visual_novel.json', deepEqual(parseA, goldenNovel));
check('node_b.response deep-equals golden/shot_spec.json', deepEqual(parseB, goldenShot));

// cross-file invariants on the wire payload
check('response scenes count == FilmSeed.scale.scenes',
  parseA.scenes.length === filmSeed.scale.scenes);
check('response shots count == FilmSeed.scale.shotsPerScene',
  parseA.scenes[0].shots.length === filmSeed.scale.shotsPerScene);
check('response clip_s within FilmSeed.scale.clipS',
  parseB.clip_s >= filmSeed.scale.clipS[0] && parseB.clip_s <= filmSeed.scale.clipS[1]);
check('response has concern groups + sub-timeline + content',
  parseB.concerns && parseB.concerns.camera && Array.isArray(parseB.sub_timeline) && parseB.content && parseB.content.prose);

// ---------------------------------------------------------------------------
// 3) LIVE mode: real request with 2-retry repair
// ---------------------------------------------------------------------------
if (LIVE) {
  console.log('\n[live] real LLM calls');
  const key = process.env[llm.provider.auth.key_env];
  if (!key) {
    console.log(`  SKIP: ${llm.provider.auth.key_env} not set (harness/.env missing or env var empty) — run mock only, or set the key and re-run with --live`);
  } else {
    // Dev overrides: allow harness/.env to point the live test at the app profile's settings
    // (VisionMachine profile_settings.providers). Fall back to llm.json defaults.
    const base = process.env.AGNES_BASE_URL || llm.provider.base_url;
    const modelA = process.env.AGNES_TEXT_MODEL || llm.models.node_a;
    const modelB = process.env.AGNES_TEXT_MODEL || llm.models.node_b;
    const b = base.replace(/\/$/, '');
    const url = `${b}${llm.provider.chat_path}`; // preserve /v1 → .../v1/chat/completions
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      // Cloudflare-facing headers matching how the source repo's browser client called this API.
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 VisionMachine-Dev',
      Referer: base.replace(/\/v1\/?$/, '/'),
      Origin: base.replace(/\/v1\/?$/, ''),
      [llm.provider.auth.header]: `${llm.provider.auth.scheme} ${key}`,
    };
    const content = async (body) => {
      const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!r.ok) {
        const txt = await r.text();
        const cf = /cloudflare|attention required|cf-error-details|cf-wrapper/i.test(txt);
        const ray = (txt.match(/Ray ID:\s*<strong>([a-f0-9]+)</i) || [])[1] || '';
        if (cf || [403, 503].includes(r.status)) {
          throw new Error(`CF-blocked (HTTP ${r.status}${ray ? ', Ray ' + ray : ''}) — egress IP flagged by Cloudflare; not a key failure`);
        }
        throw new Error(`HTTP ${r.status}: ${txt.slice(0, 200)}`);
      }
      const d = await r.json();
      const c = d.data ? d.data.choices[0].message.content : d.choices[0].message.content;
      if (typeof c !== 'string') throw new Error('content missing (non-string response)');
      return JSON.parse(c);
    };
    const runNode = async (reqFixture, schema, label, model) => {
      const body = JSON.parse(JSON.stringify(reqFixture.body));
      body.model = model;
      for (let attempt = 0; attempt <= llm.retry.attempts; attempt++) {
        try {
          const parsed = await content(body);
          const errs = validate(schema, parsed);
          if (errs.length === 0) {
            check(`${label}: live response valid`, true);
            // SHOW the LLM's interpretation of OUR request model (the smoke signal):
            console.log(`  --- live ${label} LLM output (how it read our request model) ---`);
            const pretty = JSON.stringify(parsed, null, 2);
            console.log(pretty.length > 1600 ? pretty.slice(0, 1600) + '\n  …[truncated]' : pretty);
            console.log('  ---');
            return parsed;
          }
          body.messages[0].content += `\n\nPrevious attempt failed schema validation:\n${errs.join('\n')}\nFix and retry.`;
        } catch (e) {
          check(`${label}: live attempt ${attempt + 1} errored`, false, e.message);
          if (/CF-blocked|egress IP/i.test(e.message)) {
            // Same IP on next attempt → same block; stop retrying.
            console.log(`  (no point retrying: Cloudflare egress block is IP-level)`);
            return null;
          }
        }
      }
      check(`${label}: live retries exhausted`, false);
      return null;
    };
    await runNode(reqA, visualNovelSchema, 'node_a', modelA);
    await runNode(reqB, shotSpecSchema, 'node_b', modelB);
  }
}

// ---------------------------------------------------------------------------
const failed = results.filter((r) => !r.pass);
console.log(`\n=== ${LIVE ? 'LIVE' : 'MOCK'} result: ${failed.length ? 'FAILURES' : 'ALL PASS'} (${results.length - failed.length}/${results.length}) ===`);
process.exit(failed.length ? 1 : 0);
