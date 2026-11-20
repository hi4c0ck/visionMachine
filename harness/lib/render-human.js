/**
 * lib/render-human.js — deterministic human-readable renderers.
 * The JSON (schemas/ + ShotSpec) is the machine contract; these formatters
 * turn it into what a person reads:
 *   - their plain text  →  the visual novel (prose document)
 *   - the visual novel  →  a structured shot sheet
 * Pure functions of the JSON — no LLM, no randomness, same input → same output.
 */

const DASH = '—';

/** VisualNovel JSON → readable novel document (markdown). */
export function renderNovelDocument(novel) {
  const f = novel.film || {};
  const L = [];
  L.push(`# ${f.title || 'Untitled'}`);
  L.push('');
  if (f.logline) L.push(`> ${f.logline}`, '');
  if (f.style) L.push(`**Style:** ${f.style}`, '');

  L.push('## World', '');
  if (f.world) L.push(f.world, '');
  L.push(`- **Palette:** ${f.palette || '—'}`);
  L.push(`- **Time of day:** ${f.time_of_day || '—'}`);
  L.push(`- **Weather:** ${f.weather || '—'}`, '');

  (novel.scenes || []).forEach((scene, i) => {
    L.push(`## Scene ${i + 1} ${DASH} ${scene.title || ''}`, '');
    if (scene.prose) L.push(scene.prose, '');
    (scene.shots || []).forEach((shot, j) => {
      L.push(`### Shot ${i + 1}.${j + 1}`, '');
      if (shot.prose) L.push(shot.prose, '');
      if (shot.beats && shot.beats.length) {
        L.push('**Beats:**', '');
        shot.beats.forEach((b, k) => L.push(`${k + 1}. ${b}`));
        L.push('');
      }
    });
  });
  return L.join('\n');
}

/** ShotSpec JSON (+ context) → structured shot sheet (markdown). */
export function renderShotSheet(ctx, spec) {
  const { shotLabel, ratio } = ctx;
  const g = (v) => (v === undefined || v === null || v === '' ? '—' : v);
  const list = (a) => (Array.isArray(a) && a.length ? a.join(', ') : '—');

  const L = [];
  L.push(`## ${shotLabel} ${DASH} Shot Sheet`, '');
  L.push('| Spec | Value |', '|---|---|');
  L.push(`| Clip length | ${g(spec.clip_s)} s · ${ratio} |`);
  L.push(`| Shot size | ${g(spec.size)} · angle ${g(spec.angle)} · framing ${g(spec.framing)} · DoF ${g(spec.dof)} |`);
  L.push(`| Lens | ${g(spec.lens?.focal_mm)} mm${spec.lens?.distortion ? ' (' + spec.lens.distortion + ')' : ''} |`);
  L.push(`| Motion | move: ${g(spec.move)} · zoom: ${g(spec.zoom)} · speed: ${g(spec.speed)} · "${g(spec.camera)}" |`);
  L.push(`| Light | ${g(spec.light?.key)} key · ${g(spec.light?.contrast)} contrast · ${g(spec.light?.color_temp_K)} K · ${g(spec.light?.pattern)} |`);
  L.push(`| Grade | ${g(spec.grade?.palette)} · ${g(spec.grade?.saturation)} · ${g(spec.grade?.contrast)} · ${g(spec.grade?.film_stock)} |`);
  L.push(`| Effects | ${list(spec.effects)} |`);
  L.push(`| Audio | ambience: "${g(spec.audio?.ambience)}" · foley: "${g(spec.audio?.foley)}" · sfx: "${g(spec.audio?.sfx)}" · music: "${g(spec.audio?.music_cue)}" · silence: ${g(spec.audio?.silence)} |`);
  L.push(`| Tempo | ${g(spec.tempo)} |`);
  L.push(`| Transitions | in: ${g(spec.transition_in)} → out: ${g(spec.transition_out)} |`, '');

  if (spec.prompts?.image) {
    L.push(`**Image prompt** (feeds the image model):`, '', '> ' + spec.prompts.image, '');
  }
  if (spec.prompts?.video) {
    L.push(`**Video prompt** (feeds the video model, first frame = shot image):`, '', '> ' + spec.prompts.video, '');
  }
  return L.join('\n');
}

/** Full human report: input text → novel → shot sheet. */
export function renderHumanReport({ entryText, genre, ratio, novel, shots }) {
  const L = [];
  L.push('# Human Report', '');
  L.push('## 1. Your text (input)', '', '> ' + entryText, '');
  if (genre) L.push(`**Genre:** ${genre} · **Ratio:** ${ratio}`, '');

  L.push('## 2. The Visual Novel (what your text became)', '', renderNovelDocument(novel), '');

  // one sheet per generated spec
  shots.forEach((s) => L.push(renderShotSheet(s.ctx, s.spec), ''));
  return L.join('\n').replace(/\n{3,}/g, '\n\n');
}
