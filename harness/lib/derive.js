/**
 * lib/derive.js — deterministic shot-from-scene composition.
 *
 * A ShotMolecule is only the MEANINGFUL CHANGE from its SceneSpec.
 * derive() merges them into the final prompts the media models consume.
 * No LLM: same (scene, shot) → same prompts.
 *
 * The merge rule ("divide by molecules, by every meaningful change"):
 *   base   = scene.time_of_day · scene.light · scene.grade · scene.ambience
 *            · scene.effects_base · scene.tempo · scene.weather
 *   delta  = shot.subject · composition · lens · motion · shot.effects_delta
 *            · shot.audio (foley/sfx/music) · transitions · clip_s
 *   image_prompt = base + delta (static framing)
 *   video_prompt = base + delta + motion + "first-frame identity lock"
 */

export const FRAME_RATE = 24;
export const MIN_FRAMES = 24;   // soft goal (user: "very tight minimum", not strict)
export const TARGET_FRAMES = 40; // target floor

const D = (s) => (s == null || s === '' || s === 'none' ? '' : s);
const list = (a) => (Array.isArray(a) ? a.filter((x) => x && x !== 'none') : []);

function lightText(l) {
  if (!l) return '';
  const bits = [];
  if (l.key) bits.push(`${l.key} key light`);
  if (l.contrast) bits.push(`${l.contrast} contrast`);
  if (l.color_temp_K) bits.push(`${l.color_temp_K}K`);
  if (l.pattern) bits.push(l.pattern);
  return bits.join(', ');
}

function gradeText(g) {
  if (!g) return '';
  const bits = [];
  if (g.palette) bits.push(g.palette + ' palette');
  if (g.saturation && g.saturation !== 'neutral') bits.push(g.saturation);
  if (g.film_stock) bits.push(g.film_stock + ' film stock');
  return bits.join(', ');
}

function compositionText(c) {
  if (!c) return '';
  const bits = [];
  if (c.size) bits.push(c.size + ' shot');
  if (c.angle && c.angle !== 'eye') bits.push(c.angle + ' angle');
  if (c.framing && c.framing !== 'centered') bits.push(c.framing + ' framing');
  if (c.dof) bits.push(c.dof + ' depth of field');
  return bits.join(', ');
}

function motionText(m) {
  if (!m) return '';
  const bits = [];
  if (m.move && m.move !== 'static') bits.push(m.move);
  if (m.zoom && m.zoom !== 'static') bits.push('zoom ' + m.zoom);
  if (m.speed && m.speed !== 'normal') bits.push(m.speed + ' speed');
  if (m.camera) bits.push(m.camera);
  return bits.join(', ');
}

/**
 * @param {object} scene SceneSpec
 * @param {object} shot  ShotMolecule (prompts ignored — regenerated here)
 * @returns {object} shot with prompts.{image,video} filled deterministically
 */
export function derive(scene, shot) {
  const inherit = shot.inherit || scene.scene_id || '';
  const effects = [...list(scene.effects_base), ...list(shot.effects_delta)].filter(Boolean);

  // --- base (the scene look) ------------------------------------------------
  const base = [
    scene.time_of_day ? `${scene.time_of_day} setting` : '',
    scene.weather ? `weather: ${D(scene.weather)}` : '',
    lightText(scene.light),
    gradeText(scene.grade),
    scene.ambience ? `ambience: ${D(scene.ambience)}` : '',
    effects.length ? `effects: ${effects.join(', ')}` : '',
  ].filter(Boolean).join('; ');

  // --- delta (the shot's meaningful change) ---------------------------------
  const delta = [
    D(shot.subject),
    compositionText(shot.composition),
    shot.lens?.focal_mm ? `${shot.lens.focal_mm}mm lens` : '',
    motionText(shot.motion),
    D(shot.audio?.foley) && `foley: ${shot.audio.foley}`,
    D(shot.audio?.sfx) && `sfx: ${shot.audio.sfx}`,
    D(shot.audio?.music_cue) && `music: ${shot.audio.music_cue}`,
    shot.audio?.silence === true && 'no music, near-silence',
  ].filter(Boolean).join('; ');

  const motion = motionText(shot.motion);
  const imagePrompt = `${base}. ${delta}. ${inherit ? `Scene: ${inherit}. ` : ''}No on-screen text, no subtitles. Keep the identity and visual style of the first frame identical.`;
  const videoPrompt = `${base}. ${delta}. Motion: ${motion || 'static'}. Realistic ambient sound only. No on-screen text. ${inherit ? `Scene: ${inherit}. ` : ''}Keep the identity and visual style of the first frame identical.`;

  return {
    ...shot, inherit, effects,
    frames: framesOf(shot.clip_s),
    prompts: { image: imagePrompt, video: videoPrompt },
  };
}

/** Render the molecule pair (scene + shot) as human text. */
export function renderMolecule(scene, shot) {
  const L = [];
  L.push(`SCENE ${scene.scene_id}  (base look)`);
  L.push(`  ${[scene.time_of_day, scene.weather ? 'weather: ' + scene.weather : '', lightText(scene.light), gradeText(scene.grade), scene.ambience ? 'ambience: ' + scene.ambience : '', scene.effects_base?.length ? 'effects: ' + scene.effects_base.join(',') : ''].filter(Boolean).join(' · ')}`);
  L.push('');
  L.push(`SHOT (delta, inherit: ${shot.inherit || scene.scene_id})`);
  L.push(`  subject: ${shot.subject}`);
  L.push(`  composition: ${JSON.stringify(shot.composition)}`);
  L.push(`  lens: ${shot.lens?.focal_mm}mm   motion: ${shot.motion?.move} / zoom ${shot.motion?.zoom} / ${shot.motion?.speed}`);
  L.push(`  effects_delta: ${shot.effects_delta?.length ? shot.effects_delta.join(', ') : '—'}`);
  L.push(`  audio: foley "${D(shot.audio?.foley)}" · sfx "${D(shot.audio?.sfx)}" · music "${D(shot.audio?.music_cue)}" · silence ${shot.audio?.silence}`);
  L.push(`  transition in: ${shot.transition_in} → out: ${shot.transition_out}   clip: ${shot.clip_s}s (${framesOf(shot.clip_s)} frames)`);
  L.push('');
  L.push('--- derived image prompt ---');
  L.push(shot.prompts.image);
  L.push('--- derived video prompt ---');
  L.push(shot.prompts.video);
  return L.join('\n');
}

/**
 * Project a (scene, derived molecule) pair back to a flat ShotSpec-shaped object,
 * so existing renderers (renderShotSheet) and checkers keep working.
 */
export function flatten(scene, m) {
  return {
    size: m.composition?.size,
    camera: m.motion?.camera || m.motion?.move || 'static',
    angle: m.composition?.angle,
    framing: m.composition?.framing,
    dof: m.composition?.dof,
    lens: m.lens,
    zoom: m.motion?.zoom,
    move: m.motion?.move,
    speed: m.motion?.speed,
    light: scene.light,
    grade: scene.grade,
    effects: m.effects || [],
    audio: {
      ambience: scene.ambience || '',
      foley: m.audio?.foley, sfx: m.audio?.sfx,
      music_cue: m.audio?.music_cue, silence: m.audio?.silence,
    },
    tempo: scene.tempo,
    transition_in: m.transition_in,
    transition_out: m.transition_out,
    clip_s: m.clip_s,
    prompts: m.prompts,
  };
}

/** Frames for a clip at the pipeline frame rate. */
export function framesOf(clip_s) { return clip_s * FRAME_RATE; }

/**
 * Render the scene's SHOT TIMELINE, ahead, step by step.
 * Each step = one derived composition (shot) with timecode + frame count,
 * and a soft warning when a composition falls under MIN_FRAMES.
 */
export function renderTimeline(scene, molecules) {
  const L = [];
  L.push(`TIMELINE — ${scene.scene_id}  (${molecules.length} composition(s), ${FRAME_RATE} fps, min goal ${MIN_FRAMES}f / target ${TARGET_FRAMES}f)`);
  L.push('');
  let t = 0;
  molecules.forEach((m, i) => {
    const f = framesOf(m.clip_s);
    const low = f < MIN_FRAMES ? `  ⚠ UNDER MINIMUM (${f}f < ${MIN_FRAMES}f) — extend clip`
      : f < TARGET_FRAMES ? `  (tight: ${f}f < target ${TARGET_FRAMES}f)`
      : '';
    L.push(`[${t}s → ${t + m.clip_s}s]  step ${i + 1} · ${m.composition.size}/${m.composition.angle} · ${m.lens.focal_mm}mm · ${m.motion.move || 'static'} · ${f}f ${low}`);
    L.push(`     subject: ${D(m.subject) || '—'}`);
    L.push(`     enter: ${m.transition_in}  leave: ${m.transition_out}`);
    t += m.clip_s;
  });
  L.push(`[total ${t}s = ${framesOf(t)} frames]`);
  return L.join('\n');
}
