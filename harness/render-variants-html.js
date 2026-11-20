/**
 * render-variants-html.js — read out/variants/*.json (from batch-variants.js)
 * and emit ONE self-contained out/variants-report.html to compare all variants:
 *   - a comparison table (genre, ratio, scale, duration, frames)
 *   - per-variant full pipeline view: S1 novel -> S2 division timeline -> S3 specs
 * No external assets; open the HTML directly in a browser.
 *
 *   "C:\Program Files\nodejs\node.exe" harness/render-variants-html.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(root, 'out', 'variants');
const out = path.join(root, 'out', 'variants-report.html');

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'manifest.json');
const data = files.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
data.sort((a, b) => (a.id || '').localeCompare(b.id || ''));

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtConcerns = (c) => {
  const rows = [];
  if (c.camera) rows.push(`camera: ${c.camera.size||'-'} / ${c.camera.angle||'-'} / ${c.camera.framing||'-'} / dof=${c.camera.dof||'-'}`);
  if (c.lens?.focal_mm) rows.push(`lens: ${c.lens.focal_mm}mm${c.lens.distortion && c.lens.distortion !== 'none' ? ' ('+c.lens.distortion+')' : ''}`);
  if (c.motion) rows.push(`motion: ${[c.motion.zoom && c.motion.zoom !== 'static' ? 'zoom='+c.motion.zoom : null, c.motion.move && c.motion.move !== 'static' ? 'move='+c.motion.move : null, c.motion.speed ? 'speed='+c.motion.speed : null].filter(Boolean).join(' ') || 'static'}`);
  if (c.lighting) rows.push(`light: ${c.lighting.key} ${c.lighting.contrast}-contrast ${c.lighting.color_temp_K}K ${c.lighting.pattern||''}`.trim());
  if (c.grade) rows.push(`grade: ${c.grade.palette} / ${c.grade.saturation} / ${c.grade.film_stock}`);
  if (c.effects?.length) rows.push(`effects: ${c.effects.join(', ')}`);
  if (c.audio) rows.push(`audio: ${[c.audio.foley && 'foley='+c.audio.foley, c.audio.sfx && 'sfx='+c.audio.sfx, c.audio.music_cue && 'music='+c.audio.music_cue, c.audio.silence ? 'SILENCE' : null].filter(Boolean).join(' · ')}`);
  return rows;
};

const variantBlock = (v) => {
  const film = v.novel?.film || {};
  const scenesNovel = (v.novel?.scenes || []).map((sc) => `
    <div class="novel-scene">
      <div class="h4">${esc(sc.title)}</div>
      <p class="prose">${esc(sc.prose)}</p>
      ${(sc.shots || []).map((sh, i) => `
        <div class="novel-shot">
          <div class="beatlabel">Shot ${i + 1}</div>
          <p class="prose">${esc(sh.prose)}</p>
          <ul>${(sh.beats || []).map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
        </div>`).join('')}
    </div>`).join('');

  const timeline = (v.timeline?.scenes || []).map((sc) => {
    let t = 0;
    const shots = (sc.shots || []).map((sh) => {
      const start = t; t += sh.clip_s;
      return `
        <div class="tl-step">
          <div class="tl-head">[${start}s → ${t}s] ${esc(sh.novel_ref)} · ${sh.clip_s}s</div>
          <div class="tl-cut">in: ${esc(sc.transition_in)} — ${esc(sc.transition_note)} · out: ${esc(sh.transition_out)} — ${esc(sh.transition_note)}</div>
        </div>`;
    }).join('');
    return `
      <div class="tl-scene">
        <div class="h4">SCENE ${esc(sc.scene_id)} · "${esc(sc.title)}" (${esc(sc.time_of_day)}${sc.weather ? ', ' + esc(sc.weather) : ''})</div>
        ${shots}
      </div>`;
  }).join('');

  const specs = Object.entries(v.specs || {}).map(([id, sp]) => {
    const concernRows = fmtConcerns(sp.concerns).map((r) => `<div class="concern-row">${esc(r)}</div>`).join('');
    const slices = (sp.sub_timeline || []).map((sl) => `
      <div class="slice">
        <div class="slice-head">[${sl.from_s}s → ${sl.to_s}s] ${esc(sl.note)}</div>
        ${(sl.changes || []).map((ch) => `<div class="delta">Δ ${esc(ch)}</div>`).join('') || '<div class="delta dim">(no concern change)</div>'}
      </div>`).join('');
    return `
      <div class="spec">
        <div class="spec-head">SHOT ${esc(id)} (${esc(sp.novel_ref)}) · ${sp.clip_s}s · in=${esc(sp.transition_in)} out=${esc(sp.transition_out)}</div>
        <div class="spec-what"><b>WHAT:</b> ${esc(sp.content?.prose)} <span class="dim">${(sp.content?.beats || []).map(esc).join(' | ')}</span></div>
        <div class="concerns">${concernRows}</div>
        <div class="subtl"><b>sub-timeline:</b>${slices}</div>
      </div>`;
  }).join('');

  return `
    <section class="variant" id="v-${esc(v.id)}">
      <div class="v-head" data-toggle>
        <span class="v-id">${esc(v.id)}</span>
        <span class="v-meta">${esc(v.seed.genre.name)} · ${esc(v.seed.ratio)} · ${v.meta.sceneParts} scene(s) · ${v.meta.shots} shots · ${v.meta.totalS}s · ${v.meta.ms}ms</span>
        <span class="v-caret">▸</span>
      </div>
      <div class="v-body">
        <div class="v-section"><div class="sec-label">S1 · NOVEL</div>
          <p class="logline">${esc(film.logline)}</p>
          <div class="film-meta">world: ${esc(film.world)} · palette: ${esc(film.palette)} · ${esc(film.time_of_day)} · ${esc(film.weather)}</div>
          ${scenesNovel}
        </div>
        <div class="v-section"><div class="sec-label">S2 · DIVISION (timeline)</div>${timeline}</div>
        <div class="v-section"><div class="sec-label">S3 · SPECS (concerns + sub-timeline)</div>${specs}</div>
      </div>
    </section>`;
  };

const tableRows = data.map((v) => `
  <tr data-link="v-${esc(v.id)}">
    <td><a href="#v-${esc(v.id)}">${esc(v.id)}</a></td>
    <td>${esc(v.seed.genre.name)}</td>
    <td>${esc(v.seed.ratio)}</td>
    <td>${v.meta.sceneParts}×</td>
    <td>${v.meta.shots}</td>
    <td>${v.meta.totalS}s</td>
    <td>${v.meta.totalS * 24}f</td>
  </tr>`).join('');

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Video-Harness Variants</title>
<style>
  :root{--bg:#0f1115;--panel:#171a21;--ink:#e6e8ee;--dim:#8a90a0;--acc:#5aa9ff;--line:#262b36;--ok:#4cc38a;}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;padding:28px}
  h1{font-size:22px;margin:0 0 4px}
  .sub{color:var(--dim);margin:0 0 22px;font-size:13px}
  table{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--line);border-radius:10px;overflow:hidden}
  th,td{padding:9px 12px;text-align:left;border-bottom:1px solid var(--line);font-size:13px}
  th{background:#1c2129;color:var(--dim);font-weight:600;text-transform:uppercase;letter-spacing:.04em;font-size:11px}
  tr:last-child td{border-bottom:none}
  tr[data-link]{cursor:pointer} tr[data-link]:hover td{background:#1d2230}
  a{color:var(--acc);text-decoration:none}
  .variant{background:var(--panel);border:1px solid var(--line);border-radius:10px;margin:14px 0;overflow:hidden}
  .v-head{display:flex;gap:14px;align-items:center;padding:13px 16px;cursor:pointer;user-select:none}
  .v-head:hover{background:#1d2230}
  .v-id{font-weight:700}
  .v-meta{color:var(--dim);font-size:12px;flex:1}
  .v-caret{color:var(--dim)}
  .variant.open .v-caret{transform:rotate(90deg)}
  .v-body{display:none;padding:4px 16px 16px;border-top:1px solid var(--line)}
  .variant.open .v-body{display:block}
  .v-section{margin-top:16px}
  .sec-label{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--acc);font-weight:700;margin-bottom:8px}
  .h4{font-weight:700;margin:10px 0 4px}
  .prose{margin:4px 0;color:var(--ink)}
  .logline{font-style:italic;color:#cfd4e0}
  .film-meta{color:var(--dim);font-size:12px}
  .novel-shot{margin:8px 0 8px 12px;padding-left:12px;border-left:2px solid var(--line)}
  .beatlabel{font-size:11px;color:var(--dim);text-transform:uppercase;letter-spacing:.05em}
  .novel-shot ul{margin:4px 0;padding-left:20px;color:var(--dim);font-size:13px}
  .tl-scene{margin:10px 0}
  .tl-step{margin:6px 0;padding:8px 10px;background:#1c2129;border-left:3px solid var(--acc);border-radius:4px}
  .tl-head{font-weight:600;font-size:13px}
  .tl-cut{color:var(--dim);font-size:12px;margin-top:3px}
  .spec{margin:10px 0;padding:10px 12px;background:#1c2129;border-radius:6px}
  .spec-head{font-weight:700;font-size:13px;margin-bottom:6px}
  .spec-what{font-size:13px;margin-bottom:6px}
  .dim{color:var(--dim)}
  .concern-row{font-size:13px;color:#cfd4e0;padding:1px 0}
  .subtl{margin-top:8px;font-size:13px}
  .slice{margin:6px 0;padding-left:10px;border-left:2px solid var(--line)}
  .slice-head{font-weight:600;font-size:12px}
  .delta{color:var(--ok);font-size:12px;font-family:ui-monospace,Consolas,monospace}
  .delta.dim{color:var(--dim)}
</style></head>
<body>
  <h1>Video-Harness · Variant Comparison</h1>
  <p class="sub">Text-only pipeline (S1 novel → S2 division → S3 spec). ${data.length} variants. Click a row or variant to expand. Generated ${esc(new Date().toISOString())}.</p>
  <table>
    <thead><tr><th>variant</th><th>genre</th><th>ratio</th><th>scenes</th><th>shots</th><th>duration</th><th>frames</th></tr></thead>
    <tbody>${tableRows}</tbody>
  </table>
  ${data.map(variantBlock).join('')}
<script>
  document.querySelectorAll('.v-head').forEach(h=>h.addEventListener('click',()=>h.parentElement.classList.toggle('open')));
  document.querySelectorAll('tr[data-link]').forEach(r=>r.addEventListener('click',()=>{const el=document.getElementById(r.dataset.link); if(el) el.classList.add('open');}));
</script>
</body></html>`;

fs.writeFileSync(out, html, 'utf8');
console.log(`Wrote ${out} (${data.length} variants). Open it in a browser to compare.`);
