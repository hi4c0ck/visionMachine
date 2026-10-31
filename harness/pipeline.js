/**
 * pipeline.js — build the TEXT-ONLY pipeline manifest from out/session.json.
 *
 * Scope: we ONLY mutate text to a clean, VERIFIED state. No media, no ffmpeg,
 * no delivery. The terminal stage S5 VERIFY checks that every text artifact
 * (novel, scene, shot molecule, derived prompts) is schema-valid, tag-closed,
 * count-correct, frame-legal, and invariant-clean. That verified text state is
 * the output of the harness.
 *
 * Stages:
 *   S0 entry → S1 novel(Node A) → S2 scene base(Node A′/SceneSpec)
 *   → S3 shot molecule(Node B) → S4 derive(deterministic) → S5 VERIFY
 *
 * Run (real Windows node on .js only):
 *   "C:\Program Files\nodejs\node.exe" harness/pipeline.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { framesOf, MIN_FRAMES, TARGET_FRAMES, FRAME_RATE } from './lib/derive.js';
import { validate, stripMeta } from './lib/validator.js';
import { readTagSets } from './lib/tagsets.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const s = read('out/session.json');

const novelSchema = stripMeta(read('schemas/visual_novel.schema.json'));
const sceneSchema = stripMeta(read('schemas/scene_spec.schema.json'));
const molSchema = stripMeta(read('schemas/shot_molecule.schema.json'));
const tags = readTagSets(root);

// ordered shots
const shots = [];
for (const [si, sc] of (s.novel?.scenes || []).entries()) {
  for (const [ki, shot] of (sc.shots || []).entries()) {
    const label = `Scene ${si + 1} · Shot ${ki + 1}`;
    const mol = s.molecules?.[label];
    shots.push({ label, si, ki, mol, clip_s: mol?.clip_s ?? s.seed.scale.clipS[0] });
  }
}

// ---------------------------------------------------------------------------
// S5 VERIFY — the text-only verification that produces a "clean verified state"
// ---------------------------------------------------------------------------
const errors = [];

// V1 schema conformance
for (const id of Object.keys(s.scenes || {})) {
  const v = validate(sceneSchema, s.scenes[id]);
  v.forEach((e) => errors.push(`V1 SceneSpec ${id}: ${e}`));
}
if (s.novel) validate(novelSchema, s.novel).forEach((e) => errors.push(`V1 VisualNovel: ${e}`));
for (const x of shots) if (x.mol) {
  // verify the LLM-AUTHORED delta. `effects`+`frames` are COMPUTED by S4 derive()
  // (merged scene-base effects + frame count), so strip them before the delta schema check.
  const authored = { ...x.mol };
  delete authored.effects; delete authored.frames;
  authored.prompts = { image: authored.prompts?.image || '', video: authored.prompts?.video || '' };
  validate(molSchema, authored).forEach((e) => errors.push(`V1 ShotMolecule ${x.label}: ${e}`));
}

// V2 tag closure (every tag value in the flat specs must be in the vocabulary)
const TAG_FIELDS = {
  size: 'size', angle: 'angle', framing: 'framing', dof: 'dof',
  zoom: 'zoom', move: 'move', speed: 'speed',
};
for (const label of Object.keys(s.specs || {})) {
  const sp = s.specs[label];
  for (const [k, vocab] of Object.entries(TAG_FIELDS)) {
    if (sp[k] && tags[vocab] && !tags[vocab].includes(sp[k])) errors.push(`V2 ${label}.${k}="${sp[k]}" not in vocab`);
  }
  if (sp.lens?.focal_mm && tags.lens_focal && !tags.lens_focal.map(String).includes(String(sp.lens.focal_mm)))
    errors.push(`V2 ${label}.lens.focal_mm=${sp.lens.focal_mm} not in lens_focal`);
  if (sp.transition_in && tags.transition && !tags.transition.includes(sp.transition_in)) errors.push(`V2 ${label}.transition_in`);
  if (sp.transition_out && tags.transition && !tags.transition.includes(sp.transition_out)) errors.push(`V2 ${label}.transition_out`);
}

// V3 counts
if (s.novel?.scenes?.length !== s.seed.scale.scenes)
  errors.push(`V3 scenes=${s.novel?.scenes?.length} != scale.scenes=${s.seed.scale.scenes}`);
(s.novel?.scenes || []).forEach((sc, i) => {
  if (sc.shots?.length !== s.seed.scale.shotsPerScene)
    errors.push(`V3 scene ${i + 1} shots=${sc.shots?.length} != scale.shotsPerScene=${s.seed.scale.shotsPerScene}`);
});

// V4 frame floor (each clip must reach the soft minimum)
for (const x of shots) {
  const f = framesOf(x.clip_s);
  if (f < MIN_FRAMES) errors.push(`V4 ${x.label} ${f}f < min ${MIN_FRAMES}f (extend clip to ≥${Math.ceil(MIN_FRAMES / FRAME_RATE)}s)`);
}

// V5 invariants (identity-lock + no on-screen text in derived prompts)
for (const x of shots) {
  const img = x.mol?.prompts?.image || '';
  const vid = x.mol?.prompts?.video || '';
  if (vid && !/first frame identical/i.test(vid)) errors.push(`V5 ${x.label} video prompt missing identity-lock line`);
  if (/\b(subtitle|caption|title card)\b/i.test(img + ' ' + vid)) errors.push(`V5 ${x.label} prompt contains on-screen text phrase`);
}

const verified = errors.length === 0;
console.log(`# TEXT PIPELINE — ${s.seed.title} (text-only, to verified state)`);
console.log(`${s.seed.ratio} · ${s.seed.scale.scenes} scene(s) × ${s.seed.scale.shotsPerScene} shot(s) · ${FRAME_RATE} fps`);
console.log('');
console.log('STAGES (each: consumes ⇒ produces · tool · status)');

const stageLine = (id, status, name, cons, prod, tool, cmd) => {
  const icon = status === 'done' ? '✓' : status === 'ready' ? '»' : '◇';
  console.log(`  ${id} ${icon} ${name}`);
  console.log(`      ${cons}  ⇒  ${prod}`);
  console.log(`      via ${tool}${cmd ? ' · ' + cmd : ''}`);
  console.log('');
};

stageLine('S0', s.gates?.G0_entry?.confirmed ? 'done' : 'pending', 'Entry parameters',
  s.seed.input_text || s.seed.idea, 'FilmSeed', 'user+config', 'run-gate.js gate G0');
stageLine('S1', s.novel ? 'done' : 'pending', 'Node A — text → visual novel',
  'FilmSeed', 'VisualNovel{film,scenes,shots,beats}', 'agnes-2.5-flash', 'response_format=VisualNovel');
stageLine('S2', s.scenes && Object.keys(s.scenes).length ? 'done' : 'pending', "Node A′ — per-scene base look",
  'VisualNovel.scene', Object.keys(s.scenes || {}), 'agnes-2.5-flash', 'response_format=SceneSpec');
stageLine('S3', s.molecules && Object.keys(s.molecules).length ? 'done' : 'pending', 'Node B — shot molecule (delta)',
  'SceneSpec + VisualNovel.shot', shots.map((x) => x.label), 'agnes-2.5-flash', 'response_format=ShotMolecule');
stageLine('S4', 'done', 'derive — prompts + timeline + frames (deterministic)',
  'SceneSpec + ShotMolecule', 'prompts.image/video, timeline, frames', 'lib/derive.js', 'no LLM');

// S5 VERIFY — the terminal stage, text-only
console.log(`  S5 ${verified ? '✓' : '✗'} VERIFY — text spec to clean verified state`);
console.log(`      V1 schema (VisualNovel/SceneSpec/ShotMolecule) · V2 tag-closure · V3 counts`);
console.log(`      V4 frame floor (≥${MIN_FRAMES}f min / ${TARGET_FRAMES}f target @ ${FRAME_RATE}fps) · V5 invariants`);
console.log(`      via lib/validator + lib/tagsets  ·  ${verified ? 'ALL PASS — clean verified text state' : `${errors.length} issue(s)`}`);
console.log('');

if (errors.length) {
  console.log('VERIFY ISSUES:');
  errors.forEach((e) => console.log('  • ' + e));
} else {
  console.log('VERIFY: ALL PASS — every text artifact is schema-valid, tag-closed, count-correct, frame-legal, invariant-clean.');
  console.log('');
  console.log('TIMELINE (verified):');
  let t = 0;
  shots.forEach((x, i) => {
    const f = framesOf(x.clip_s);
    console.log(`  [${t}s → ${t + x.clip_s}s] step ${i + 1} · ${x.mol?.composition?.size}/${x.mol?.composition?.angle} · ${x.mol?.lens?.focal_mm}mm · ${f}f`);
    t += x.clip_s;
  });
  console.log(`  [total ${t}s = ${framesOf(t)} frames]`);
}

fs.mkdirSync(path.join(root, 'out'), { recursive: true });
fs.writeFileSync(path.join(root, 'out', 'pipeline.json'), JSON.stringify({ verified, errors, frames: shots.map((x) => framesOf(x.clip_s)), total_frames: framesOf(shots.reduce((a, x) => a + x.clip_s, 0)) }, null, 2) + '\n');
console.log('\n(text-only manifest + verify result saved to out/pipeline.json)');
console.log('SCOPE: S5+ media/ffmpeg/delivery are OUT — the harness stops at a verified TEXT state.');
process.exit(verified ? 0 : 1);
