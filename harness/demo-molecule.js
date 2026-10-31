/**
 * demo-molecule.js — one-shot, NO LLM: read out/session.json and show the
 * molecular view (scene base + shot deltas) with the timeline ahead.
 *
 * Adapts to the CURRENT session shape (S2 division timeline + S3 concern-grouped
 * specs). If the session is missing, prints a clear message and exits 0.
 *
 *   "C:\Program Files\nodejs\node.exe" harness/demo-molecule.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { derive, renderMolecule, renderTimeline, framesOf, MIN_FRAMES, TARGET_FRAMES, FRAME_RATE } from './lib/derive.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(root, 'out', 'session.json');

if (!fs.existsSync(file)) {
  console.log('No session yet. Start one first:  run-gate.js new ... run spec');
  process.exit(0);
}
const s = JSON.parse(fs.readFileSync(file, 'utf8'));
const specs = s.specs && Object.values(s.specs).filter(Boolean);

if (!specs?.length) {
  console.log('Session has no S3 specs. Run the gate flow up to "run spec" first.');
  process.exit(0);
}

// --- build the Scene molecule (base look) from the division + first spec's concerns ---
const sc0 = s.timeline?.scenes?.[0];
const first = specs[0];
const c0 = first.concerns || {};
const scene = {
  scene_id: sc0?.scene_id || `scene_1_${String(s.novel?.film?.title || s.novel?.logline || 'untitled').replace(/\s+/g, '_').toLowerCase()}`,
  time_of_day: sc0?.time_of_day || s.novel?.film?.time_of_day || '',
  weather: sc0?.weather || s.novel?.film?.weather || '',
  light: c0.lighting || {},
  grade: c0.grade || {},
  ambience: c0.audio?.foley || c0.audio?.music_cue || '',
  tempo: 'slow',
  effects_base: c0.effects?.length ? c0.effects.filter((e) => e !== 'none') : [],
};

// --- build a ShotMolecule (the DELTA) per spec, from the concern groups ---
function toMolecule(spec) {
  const c = spec.concerns || {};
  return {
    inherit: scene.scene_id,
    subject: spec.content?.prose || spec.novel_ref || spec.shot_id,
    composition: { size: c.camera?.size, angle: c.camera?.angle, framing: c.camera?.framing, dof: c.camera?.dof },
    lens: { focal_mm: c.lens?.focal_mm, distortion: c.lens?.distortion },
    motion: { zoom: c.motion?.zoom, move: c.motion?.move, speed: c.motion?.speed, camera: '' },
    effects_delta: (c.effects || []).filter((e) => e !== 'none'),
    audio: { foley: c.audio?.foley, sfx: c.audio?.sfx, music_cue: c.audio?.music_cue, silence: c.audio?.silence },
    transition_in: spec.transition_in,
    transition_out: spec.transition_out,
    clip_s: spec.clip_s,
    prompts: { image: '', video: '' },
  };
}

console.log('=== SCENE MOLECULE (base look) ===');
console.log(JSON.stringify(scene, null, 2));
console.log('');

const molecules = specs.map((sp) => toMolecule(sp));
const derived = molecules.map((m) => derive(scene, m));

console.log('=== TIMELINE — ' + scene.scene_id + ', ahead, step by step ===');
console.log(renderTimeline(scene, derived));
console.log('');

console.log('=== PER-SHOT MOLECULES + DERIVED PROMPTS ===');
for (const d of derived) {
  console.log(renderMolecule(scene, d));
  console.log('\n' + '='.repeat(60) + '\n');
}

// --- frame goal check (soft, 720P cap: max ~241f → clip_s <= 10s = 240f) ---
const short = derived.filter((d) => d.frames < MIN_FRAMES);
console.log('FRAME GOAL (' + FRAME_RATE + ' fps, min ' + MIN_FRAMES + 'f / target ' + TARGET_FRAMES + 'f, 720P cap ~241f):');
if (short.length) {
  short.forEach((d) => console.log(`  \u26A0 ${d.inherit} · ${d.subject}: ${d.clip_s}s = ${d.frames}f — extend to \u2265${MIN_FRAMES}f (${(MIN_FRAMES / FRAME_RATE).toFixed(1)}s)`));
} else {
  const over = derived.filter((d) => d.frames > 240);
  console.log(`  \u2713 all ${derived.length} composition(s) \u2265 ${MIN_FRAMES}f${over.length ? `  (\u26A0 ${over.length} over 240f cap: ${over.map((d) => d.clip_s + 's').join(', ')})` : ''}`);
}
