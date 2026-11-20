'use strict';
/**
 * video-harness.test.js
 * First, cheap end-to-end test for the two-node visual pipeline.
 *
 *  Node A : FilmSeed  -> VisualNovel   (CreativeProfile)
 *  Node B : VisualNovel(shot) -> ShotSpec (SpecProfile)
 *
 * What runs HERE, with zero external deps (plain `node`):
 *   - both response_schemas are well-formed and internally valid
 *   - the golden Node-A VisualNovel conforms to VisualNovelSchema
 *   - the golden Node-B ShotSpec   conforms to ShotSpecSchema
 *   - structural invariants hold (counts == scale, enums in vocabulary,
 *     clip_s within scale, identity-lock line present, no on-screen text)
 *
 * What you must fill in for the REAL generation step:
 *   - callNodeA / callNodeB  (one LLM call each, response_format=json_schema)
 *
 * Run:  node harness/video-harness.test.js
 */

// ---------------------------------------------------------------------------
// 1) The three data models as response_schemas
// ---------------------------------------------------------------------------
const VisualNovelSchema = {
  type: 'object', additionalProperties: false,
  required: ['film', 'scenes'],
  properties: {
    film: {
      type: 'object', additionalProperties: false,
      required: ['title', 'logline', 'style', 'world', 'palette', 'time_of_day', 'weather'],
      properties: {
        title: { type: 'string' }, logline: { type: 'string' }, style: { type: 'string' },
        world: { type: 'string' }, palette: { type: 'string' },
        time_of_day: { enum: ['dawn', 'morning', 'midday', 'afternoon', 'evening', 'night'] },
        weather: { type: 'string' },
      },
    },
    scenes: {
      type: 'array', minItems: 1,
      items: {
        type: 'object', additionalProperties: false,
        required: ['title', 'prose', 'shots'],
        properties: {
          title: { type: 'string' }, prose: { type: 'string' },
          shots: {
            type: 'array', minItems: 1, maxItems: 5,
            items: {
              type: 'object', additionalProperties: false,
              required: ['prose', 'beats'],
              properties: {
                prose: { type: 'string' },
                beats: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      },
    },
  },
};

// Every visual tag is an ENUM from tagVocabulary => out-of-vocab impossible.
const ShotSpecSchema = {
  type: 'object', additionalProperties: false,
  required: ['size', 'camera', 'angle', 'framing', 'dof', 'lens', 'zoom', 'move',
             'speed', 'light', 'grade', 'effects', 'audio', 'tempo',
             'transition_in', 'transition_out', 'clip_s', 'prompts'],
  properties: {
    size:    { enum: ['wide', 'medium', 'close-up', 'over-the-shoulder'] },
    camera:  { type: 'string' },
    angle:   { enum: ['eye', 'low', 'high', 'dutch', 'overhead', 'worm', 'bird'] },
    framing: { enum: ['rule_of_thirds', 'centered', 'symmetrical', 'fill_frame', 'negative_space'] },
    dof:     { enum: ['shallow', 'medium', 'deep'] },
    lens: {
      type: 'object', additionalProperties: false, required: ['focal_mm'],
      properties: { focal_mm: { enum: [14, 24, 35, 50, 85, 135] }, distortion: { type: 'string' } },
    },
    zoom:    { enum: ['static', 'in', 'out', 'crash', 'rack_focus', 'push', 'pull'] },
    move:    { enum: ['static', 'pan', 'tilt', 'track', 'dolly', 'crane', 'handheld', 'steadicam', 'orbit', 'drone', 'zoom'] },
    speed:   { enum: ['slow', 'normal', 'fast', 'speed_ramp'] },
    light: {
      type: 'object', additionalProperties: false, required: ['key', 'contrast', 'color_temp_K', 'pattern'],
      properties: {
        key: { enum: ['soft', 'hard', 'low-key', 'high-key', 'backlit'] },
        contrast: { enum: ['low', 'medium', 'high'] },
        color_temp_K: { type: 'integer', minimum: 2500, maximum: 10000 },
        pattern: { type: 'string' },
      },
    },
    grade: {
      type: 'object', additionalProperties: false, required: ['palette', 'saturation', 'contrast', 'film_stock'],
      properties: {
        palette: { type: 'string' },
        saturation: { enum: ['saturated', 'desaturated', 'neutral'] },
        contrast: { enum: ['low', 'medium', 'high'] },
        film_stock: { type: 'string' },
      },
    },
    effects: {
      type: 'array',
      items: { enum: ['fog', 'rain', 'smoke', 'lens_flare', 'bokeh', 'sparks', 'dust', 'snow', 'fire', 'magic_glow', 'glitch', 'none'] },
    },
    audio: {
      type: 'object', additionalProperties: false, required: ['ambience', 'foley', 'sfx', 'music_cue', 'silence'],
      properties: {
        ambience: { type: 'string' }, foley: { type: 'string' }, sfx: { type: 'string' },
        music_cue: { type: 'string' }, silence: { type: 'boolean' },
      },
    },
    tempo:          { enum: ['slow', 'medium', 'fast', 'staccato', 'sustained'] },
    transition_in:  { enum: ['hard_cut', 'crossfade', 'dissolve', 'wipe', 'match_cut', 'jump_cut', 'whip_pan', 'l_cut', 'j_cut', 'cut_on_action'] },
    transition_out: { enum: ['hard_cut', 'crossfade', 'dissolve', 'wipe', 'match_cut', 'jump_cut', 'whip_pan', 'l_cut', 'j_cut', 'cut_on_action'] },
    clip_s:         { type: 'integer', minimum: 4, maximum: 12 },
    prompts: {
      type: 'object', additionalProperties: false, required: ['image', 'video'],
      properties: { image: { type: 'string' }, video: { type: 'string' } },
    },
  },
};

// ---------------------------------------------------------------------------
// 2) Golden test vector — tiny entry config: 1 scene, 2 shots
// ---------------------------------------------------------------------------
const FilmSeed = {
  title: 'The Last Ferry',
  idea: 'A lone ferryman waits for a boat that never comes in a foggy harbor.',
  genre: { name: 'Thriller', style: 'tense thriller, low-key lighting, cold teal tones' },
  ratio: '16:9',
  scale: { scenes: 1, shotsPerScene: 2, clipS: [8, 10] },
};

const goldenNovel = {
  film: {
    title: 'The Last Ferry',
    logline: 'A ferryman waits for a boat that never comes in a cold foggy harbor.',
    style: 'tense thriller, low-key lighting, cold teal tones',
    world: 'an isolated stone harbor at night, endless water, a single lamplight',
    palette: 'desaturated teal, black, faint amber',
    time_of_day: 'night',
    weather: 'dense fog',
  },
  scenes: [
    {
      title: 'The Harbor',
      prose: 'A lone ferryman stands at the edge of a fog-drowned harbor; low-key light carves his face, cold teal air, a single amber lamp the only warm point in the frame.',
      shots: [
        {
          prose: 'wide, slow dolly-in through fog toward the still ferry; the man small against the black water; faint lighthouse sweep in the far distance',
          beats: ['establish fog', 'reveal ferry', 'hold on man'],
        },
        {
          prose: "close-up on the man's face, shallow focus, breath fogging; he leans forward listening; a distant horn barely cuts the silence",
          beats: ['lean in', 'listen', 'horn'],
        },
      ],
    },
  ],
};

const goldenShotSpec = {
  size: 'wide', camera: 'slow dolly-in',
  angle: 'eye', framing: 'rule_of_thirds', dof: 'deep',
  lens: { focal_mm: 35 },
  zoom: 'in', move: 'dolly', speed: 'slow',
  light: { key: 'low-key', contrast: 'high', color_temp_K: 5600, pattern: 'fog diffused' },
  grade: { palette: 'teal_black_amber', saturation: 'desaturated', contrast: 'high', film_stock: 'kodak_5219' },
  effects: ['fog'],
  audio: { ambience: 'water, wind, distant horn', foley: 'rope creak', sfx: 'horn', music_cue: 'low sustained drone', silence: false },
  tempo: 'sustained',
  transition_in: 'hard_cut', transition_out: 'crossfade',
  clip_s: 10,
  prompts: {
    image: "Cinematic film still, wide shot, eye angle, rule of thirds. tense thriller, low-key lighting, cold teal tones. Setting: isolated stone harbor at night, dense fog. Action: slow dolly-in through fog toward a still ferry, lone ferryman small against black water. Lens 35mm, deep DoF. Effects: fog. Grade: desaturated teal/black/amber, high contrast, kodak_5219. No text, no watermark.",
    video: "tense thriller, low-key lighting, cold teal tones. Slow dolly-in toward the still ferry, cold fog, 35mm deep DoF, low-key diffused light. Effects: fog. Grade: desaturated, high contrast. Transition-in: hard_cut. Realistic ambient sound only, no music, no subtitles, no on-screen text. Keep the identity and visual style of the first frame identical.",
  },
};

// ---------------------------------------------------------------------------
// 3) Minimal dependency-free JSON-schema validator (the subset we use)
// ---------------------------------------------------------------------------
function validate(schema, value, path = '$') {
  const errs = [];
  const t = schema.type;
  if (t) {
    const ok = t === 'object' ? (typeof value === 'object' && value !== null && !Array.isArray(value))
      : t === 'array' ? Array.isArray(value)
      : t === 'string' ? typeof value === 'string'
      : t === 'integer' ? Number.isInteger(value)
      : t === 'number' ? typeof value === 'number'
      : t === 'boolean' ? typeof value === 'boolean'
      : true;
    if (!ok) return [`${path}: expected ${t}, got ${value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value}`];
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errs.push(`${path}: value ${JSON.stringify(value)} not in enum`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errs.push(`${path}: ${value} < minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errs.push(`${path}: ${value} > maximum ${schema.maximum}`);
  }
  if (Array.isArray(value) && schema.items) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errs.push(`${path}: fewer than ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errs.push(`${path}: more than ${schema.maxItems} items`);
    value.forEach((v, i) => errs.push(...validate(schema.items, v, `${path}[${i}]`)));
  }
  if (t === 'object' && typeof value === 'object' && value !== null) {
    for (const r of schema.required || []) if (!(r in value)) errs.push(`${path}: missing required "${r}"`);
    if (schema.additionalProperties === false) {
      for (const k of Object.keys(value)) if (!(k in (schema.properties || {}))) errs.push(`${path}: unexpected property "${k}"`);
    }
    for (const [k, sub] of Object.entries(schema.properties || {})) {
      if (k in value) errs.push(...validate(sub, value[k], `${path}.${k}`));
    }
  }
  return errs;
}

// ---------------------------------------------------------------------------
// 4) Structural golden assertions
// ---------------------------------------------------------------------------
const invariants = [];
function check(label, cond) { invariants.push({ label, pass: !!cond }); }

// Node A invariants
check('novel: scenes count == FilmSeed.scale.scenes', goldenNovel.scenes.length === FilmSeed.scale.scenes);
check('novel: shots count == FilmSeed.scale.shotsPerScene',
  goldenNovel.scenes[0].shots.length === FilmSeed.scale.shotsPerScene);
check('novel: film has saturated fields (palette/weather/time_of_day)',
  !!goldenNovel.film.palette && !!goldenNovel.film.weather && !!goldenNovel.film.time_of_day);

// Node B invariants
check('shotSpec: clip_s within scale.clipS',
  goldenShotSpec.clip_s >= FilmSeed.scale.clipS[0] && goldenShotSpec.clip_s <= FilmSeed.scale.clipS[1]);
check('shotSpec: video prompt has identity-lock line',
  /identity and visual style of the first frame identical/i.test(goldenShotSpec.prompts.video));
check('shotSpec: image prompt has no on-screen text',
  !/\b(text|watermark|caption|subtitle)\b/i.test(goldenShotSpec.prompts.image.replace(/no text|no watermark|no subtitles|no on-screen text/gi, '')));
check('shotSpec: video prompt forces ambient-only / no subtitles',
  /no subtitles/i.test(goldenShotSpec.prompts.video));

// ---------------------------------------------------------------------------
// 5) Run
// ---------------------------------------------------------------------------
const aErrs = validate(VisualNovelSchema, goldenNovel);
const bErrs = validate(ShotSpecSchema, goldenShotSpec);

let ok = true;
function line(n, label) { n ? ok = false : 0; console.log(`  ${n ? 'FAIL' : 'pass'}  ${label}`); }

console.log('\n[Node A] VisualNovel vs VisualNovelSchema');
if (aErrs.length) { aErrs.forEach(e => console.log('   - ' + e)); }
line(aErrs.length > 0, `schema-conform (${aErrs.length} error(s))`);

console.log('\n[Node B] ShotSpec vs ShotSpecSchema');
if (bErrs.length) { bErrs.forEach(e => console.log('   - ' + e)); }
line(bErrs.length > 0, `schema-conform (${bErrs.length} error(s))`);

console.log('\n[Invariants] structural golden checks');
for (const c of invariants) line(!c.pass, c.label);

// ---------------------------------------------------------------------------
// 6) The real generation step (fill in for your endpoint)
// ---------------------------------------------------------------------------
// const callNodeA = async (seed, creativeProfile) => {
//   // OpenAI-compatible; response_format = json_schema(VisualNovelSchema)
//   // system: the "You are the film director..." prompt (§10.6)
//   // user:   JSON.stringify(seed) + ' · genre style: "' + seed.genre.style + '"'
//   // temperature from creativeProfile, max_tokens generous.
//   // return the parsed JSON (retry once on parse fail, mirroring llmJSON).
//   throw new Error('callNodeA not wired');
// };
// const callNodeB = async (novel, shot, specProfile) => {
//   // OpenAI-compatible; response_format = json_schema(ShotSpecSchema)
//   // system: the "You are the DOP/mechanical writer..." prompt (§10.6)
//   // user: film context + scene prose + this shot + ratio + clip_s bounds
//   // temperature low (0.2-0.3).
//   throw new Error('callNodeB not wired');
// };
//
// async function runLive() {
//   const novel = await callNodeA(FilmSeed, creativeProfile);
//   const specs = novel.scenes[0].shots.map(s => callNodeB(novel, s, specProfile));
//   // validate each spec against ShotSpecSchema; clamp clip_s; 2-retry repair.
// }

console.log(`\n=== result: ${ok ? 'ALL PASS' : 'FAILURES PRESENT'} ===`);
process.exit(ok ? 0 : 1);
