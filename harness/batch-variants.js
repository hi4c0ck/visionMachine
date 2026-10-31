/**
 * batch-variants.js — strategic test: run several plain-text video IDEAS through
 * the full text pipeline (S1 novel -> S2 division -> S3 spec), save each result
 * to out/variants/<id>.json, then hand off to render-variants-html.js.
 *
 * Text-only. No media. Runs sequentially (rate-limit friendly).
 *
 *   "C:\Program Files\nodejs\node.exe" harness/batch-variants.js [id...]
 *   (optional: pass specific variant ids to run only those)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPipeline } from './run-gate.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(root, 'out', 'variants');
fs.mkdirSync(outDir, { recursive: true });

// Five structurally different plain-text entries.
const VARIANTS = [
  {
    id: 'v1_lighthouse_doc',
    genre: { name: 'Documentary', style: 'natural light, patient observational, muted coastal tones, available sound' },
    ratio: '16:9',
    scale: { scenes: 2, shotsPerScene: 2, clipS: [8, 10] },
    idea: 'An old lighthouse keeper tends the lamp on a foggy coast. A ship is in danger in the fog, he signals it to safety, then the dawn comes clear and calm.',
  },
  {
    id: 'v2_astronaut_signal',
    genre: { name: 'Sci-Fi', style: 'cold sterile interior, teal and magenta glow, high contrast, ambient synth, practical detail' },
    ratio: '2.39:1',
    scale: { scenes: 2, shotsPerScene: 2, clipS: [8, 10] },
    idea: 'A lone astronaut floats in a dim ship module. A strange signal flickers on a screen, she follows it through the corridors to a hatch, and opens it to find green alien light spilling in.',
  },
  {
    id: 'v3_rainy_chase',
    genre: { name: 'Action', style: 'wet night city, sodium and blue neon, fast kinetic cuts, rain-slick reflections, gritty handheld' },
    ratio: '2.39:1',
    scale: { scenes: 2, shotsPerScene: 3, clipS: [6, 9] },
    idea: 'A courier is chased through a rain-soaked city at night. He dodges around corners, leaps a gap, and loses the pursuers into the crowd, then stops and realizes his bag is gone.',
  },
  {
    id: 'v4_house_horror',
    genre: { name: 'Horror', style: 'low-key candle and moonlight, deep shadows, desaturated cold grade, silence and stings, slow dread' },
    ratio: '4:3',
    scale: { scenes: 2, shotsPerScene: 2, clipS: [8, 10] },
    idea: 'A child stays up alone in a dark house. A door creaks on its own, she goes down the hall with a flashlight, and the light at the end of the hall is breathing.',
  },
  {
    id: 'v5_cat_office',
    genre: { name: 'Comedy', style: 'bright office daylight, saturated and clean, punchy comedic timing, deadpan, slapstick physical' },
    ratio: '1:1',
    scale: { scenes: 2, shotsPerScene: 2, clipS: [6, 9] },
    idea: 'A fat office cat knocks a coffee cup off a desk. It rolls across the floor, crashes into a keyboard during an important presentation, and the whole room panics while the cat naps on the mess.',
  },
];

function pick() {
  const args = process.argv.slice(2);
  if (args.length) return VARIANTS.filter((v) => args.includes(v.id));
  return VARIANTS;
}

const chosen = pick();
const manifest = [];
console.log(`Running ${chosen.length} variant(s) through the text pipeline (S1 -> S2 -> S3)...\n`);

for (const v of chosen) {
  const seed = {
    title: v.id.replace(/^v\d+_/g, '').replace(/_/g, ' '),
    input_text: v.idea,
    idea: v.idea,
    genre: v.genre,
    ratio: v.ratio,
    scale: v.scale,
  };
  console.log(`\n=== ${v.id} ===`);
  try {
    const t0 = Date.now();
    const r = await runPipeline(seed);
    const rec = {
      id: v.id,
      seed,
      novel: r.novel,
      timeline: r.timeline,
      specs: r.specs,
      meta: {
        sceneParts: r.sceneParts,
        shots: r.shotCount,
        totalS: r.timeline.scenes.reduce((a, sc) => a + sc.shots.reduce((b, s) => b + s.clip_s, 0), 0),
        ms: Date.now() - t0,
        at: new Date().toISOString(),
      },
    };
    fs.writeFileSync(path.join(outDir, `${v.id}.json`), JSON.stringify(rec, null, 2) + '\n', 'utf8');
    manifest.push({ id: v.id, status: 'ok', scenes: r.sceneParts, shots: r.shotCount, totalS: rec.meta.totalS, ms: rec.meta.ms });
    console.log(`  ok: ${r.sceneParts} scene part(s), ${r.shotCount} shot(s), ${rec.meta.totalS}s total, ${rec.meta.ms}ms`);
  } catch (e) {
    manifest.push({ id: v.id, status: 'error', error: String(e && e.message || e) });
    console.log(`  ERROR: ${e && e.message || e}`);
  }
}

fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify({ at: new Date().toISOString(), variants: manifest }, null, 2) + '\n', 'utf8');
const ok = manifest.filter((m) => m.status === 'ok').length;
console.log(`\nDone: ${ok}/${manifest.length} ok. Saved to out/variants/.`);
console.log('next: "C:\\Program Files\\nodejs\\node.exe" harness/render-variants-html.js');
