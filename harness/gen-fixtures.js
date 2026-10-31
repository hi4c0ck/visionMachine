/**
 * gen-fixtures.js — regenerate fixtures/*.json from golden/*.json + schemas.
 * Guarantees:
 *   - request bodies embed the EXACT standalone response schemas (meta-stripped)
 *   - response content === JSON.stringify(golden)  (so live/mock deep-equal holds)
 * Run (real Windows node on .js only):
 *   "C:\Program Files\nodejs\node.exe" harness/gen-fixtures.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripMeta } from './lib/validator.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const write = (p, o) => fs.writeFileSync(path.join(root, p), JSON.stringify(o, null, 2) + '\n', 'utf8');

const filmSeed = read('golden/film_seed.json');
const novel = read('golden/visual_novel.json');
const shot = read('golden/shot_spec.json');
const visualNovelSchema = read('schemas/visual_novel.schema.json');
const shotSpecSchema = read('schemas/shot_spec.schema.json');
const llm = read('config/llm.json');

// ---------------- Node A ----------------
const aUser =
  `FilmSeed: ${JSON.stringify(filmSeed)}\n` +
  `genre style: "${filmSeed.genre.style}"\n` +
  `creative profile: cinema (temp 0.7, detail medium, sensory axes: light,color,motion,sound,texture,weather)\n` +
  `Hard counts: scenes.length == ${filmSeed.scale.scenes}, scenes[*].shots.length == ${filmSeed.scale.shotsPerScene}.\n` +
  `Respond with a single JSON object matching the VisualNovel schema only.`;

const nodeARequest = {
  _comment: 'EXACT request body Node A sends to POST {base_url}/chat/completions (provider=openai-compatible). Generated from config/llm.json + schemas/visual_novel.schema.json + golden/film_seed.json.',
  url: llm.provider.base_url.replace(/\/$/, '') + llm.provider.chat_path,
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ${AGNES_API_KEY}' },
  body: {
    model: llm.models.node_a,
    temperature: llm.generation.temperature.node_a,
    max_tokens: llm.generation.max_tokens.node_a,
    chat_template_kwargs: llm.generation.chat_template_kwargs,
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'VisualNovel', strict: true, schema: stripMeta(visualNovelSchema) },
    },
    messages: [
      { role: 'system', content: 'You are the film director. From the FilmSeed, write a saturated VISUAL NOVEL: the film\'s world/palette/time_of_day/weather, then each scene and each shot as dense, sensory visual prose (light, texture, sound, motion, color, weather, emotion). Rules:\n- Output ONE JSON object. Only the schema fields, nothing else.\n- Keep every string under 300 characters. No repeated phrases. Do not list exclusions or negations — just describe what IS present.\n- Each shot\'s `beats` must be 2–4 CINEMATIC MICRO-CUES, each written as `<shot-size>: <subject> <motion> — <light/sound detail>`, concrete and sensory (e.g. `close-up: a chick wobbles on a mossy rail, dawn light on its down; medium: the girl\'s hand reaches toward it; wide: birds scatter from the branches, she turns slowly`). No generic filler like "girl walks".' },
      { role: 'user', content: aUser },
    ],
  },
};

const nodeAResponse = {
  _comment: 'EXACT response envelope Node A receives. data.choices[0].message.content parses to VisualNovel (== golden/visual_novel.json).',
  model: llm.models.node_a,
  object: 'chat.completion',
  usage: { prompt_tokens: 412, completion_tokens: 867, total_tokens: 1279 },
  data: { choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(novel) } }] },
};

// ---------------- Node B ----------------
const bUser =
  `film: ${JSON.stringify(novel.film)}\n` +
  `scene.title: ${novel.scenes[0].title}\n` +
  `scene.prose: ${novel.scenes[0].prose}\n` +
  `shot.prose: ${novel.scenes[0].shots[0].prose}\n` +
  `shot.beats: ${JSON.stringify(novel.scenes[0].shots[0].beats)}\n` +
  `ratio: ${filmSeed.ratio}\n` +
  `clip_s bounds: [${filmSeed.scale.clipS[0]},${filmSeed.scale.clipS[1]}]\n` +
  `spec profile: cinema (temp 0.3, payload_target=plan, grade.saturation=neutral, transitions=[hard_cut,crossfade,dissolve,match_cut,cut_on_action])\n` +
  'Allowed enums from tag_vocabulary.yaml apply to every tag field.';

const nodeBRequest = {
  _comment: 'EXACT request body Node B sends to POST {base_url}/chat/completions (provider=openai-compatible). Generated from config/llm.json + schemas/shot_spec.schema.json + golden visual_novel shot[0].',
  url: llm.provider.base_url.replace(/\/$/, '') + llm.provider.chat_path,
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ${AGNES_API_KEY}' },
  body: {
    model: llm.models.node_b,
    temperature: llm.generation.temperature.node_b,
    max_tokens: llm.generation.max_tokens.node_b,
    chat_template_kwargs: llm.generation.chat_template_kwargs,
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'ShotSpec', strict: true, schema: stripMeta(shotSpecSchema) },
    },
    messages: [
      { role: 'system', content: 'You are the DOP / mechanical writer. Convert ONE VisualNovel shot into a strict ShotSpec. Use ONLY values from the allowed enums in the active tagVocabulary. Bake in-clip tags (lens, zoom, move, DoF, light, grade, effects, transition_in) into both prompt strings. The video prompt MUST end with: "Keep the identity and visual style of the first frame identical." Never put on-screen text into prompts. clip_s MUST be within seed.scale.clipS.' },
      { role: 'user', content: bUser },
    ],
  },
};

const nodeBResponse = {
  _comment: 'EXACT response envelope Node B receives. data.choices[0].message.content parses to ShotSpec (== golden/shot_spec.json).',
  model: llm.models.node_b,
  object: 'chat.completion',
  usage: { prompt_tokens: 540, completion_tokens: 720, total_tokens: 1260 },
  data: { choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(shot) } }] },
};

write('fixtures/node_a.request.json', nodeARequest);
write('fixtures/node_a.response.json', nodeAResponse);
write('fixtures/node_b.request.json', nodeBRequest);
write('fixtures/node_b.response.json', nodeBResponse);
console.log('regenerated 4 fixtures from golden + schemas; entry =', filmSeed.idea.slice(0, 40) + '…');
