/**
 * lib/concern-axes.js — the vectorized concern substrate.
 *
 * One table, three uses:
 *   1. ENCODING  : concern state  → vector (per-axis position)  [learning substrate]
 *   2. DECODING  : vector → nearest clean enum per axis         [render boundary]
 *   3. DIFFING   : two concern states → "concern.key: a -> b"   [computed sub-timeline deltas]
 *
 * The LLM writes clean enum states per sub-timeline slice; deltas are
 * COMPUTED by diffStates, never written as free text — this kills the
 * out-of-vocab / typo defect class at the root.
 */

// ---------------------------------------------------------------------------
// The axes table. axis types:
//   categorical : discrete named values (one-hot position)
//   ordinal      : ordered discrete (position = index)
//   numeric      : continuous in [min,max] (normalized position)
//   multi        : set-membership (boolean per item)
//   text         : NOT vectorized (carried alongside; the semantic content)
// ---------------------------------------------------------------------------
export const AXES = {
  camera: {
    size:      { type: 'categorical', values: ['wide', 'medium', 'close-up', 'over-the-shoulder'] },
    angle:     { type: 'categorical', values: ['eye', 'low', 'high', 'dutch', 'overhead', 'worm', 'bird'] },
    framing:   { type: 'categorical', values: ['rule_of_thirds', 'centered', 'symmetrical', 'fill_frame', 'negative_space'] },
    dof:       { type: 'ordinal',     values: ['shallow', 'medium', 'deep'] },
  },
  lens: {
    focal_mm:  { type: 'ordinal',     values: [14, 24, 35, 50, 85, 135] },
    distortion:{ type: 'text' },
  },
  motion: {
    zoom:      { type: 'categorical', values: ['static', 'in', 'out', 'crash', 'rack_focus', 'push', 'pull'] },
    move:      { type: 'categorical', values: ['static', 'pan', 'tilt', 'track', 'dolly', 'crane', 'handheld', 'steadicam', 'orbit', 'drone', 'zoom'] },
    speed:     { type: 'ordinal',     values: ['slow', 'normal', 'fast', 'speed_ramp'] },
  },
  lighting: {
    key:         { type: 'categorical', values: ['soft', 'hard', 'low-key', 'high-key', 'backlit'] },
    contrast:    { type: 'ordinal',     values: ['low', 'medium', 'high'] },
    color_temp_K:{ type: 'numeric', min: 2500, max: 10000 },
    pattern:     { type: 'text' },
  },
  grade: {
    palette:    { type: 'text' },
    saturation: { type: 'ordinal',     values: ['saturated', 'desaturated', 'neutral'] },
    contrast:   { type: 'ordinal',     values: ['low', 'medium', 'high'] },
    film_stock: { type: 'categorical', values: ['kodak_250d','kodak_5219','kodak_5207','fuji_super_35','fuji_velvia','cine_organic','neutral','custom'] },
  },
  effects: {
    effects:    { type: 'multi', values: ['fog','rain','smoke','lens_flare','bokeh','sparks','dust','snow','fire','magic_glow','glitch'] },
  },
  audio: {
    foley:     { type: 'text' },
    sfx:       { type: 'text' },
    music_cue: { type: 'text' },
    silence:   { type: 'ordinal', values: [false, true] },
  },
};

// ---------------------------------------------------------------------------
// encode: concern state → flat vector of numbers (positions).
// categorical: index into values (0-based)
// ordinal:     index
// numeric:     (v - min) / (max - min)
// multi:       0/1 per item
// text:        skipped (carried alongside, NOT in the vector)
// ---------------------------------------------------------------------------
export function encodeVector(concerns) {
  const vec = {};
  for (const [concern, fields] of Object.entries(AXES)) {
    const c = concerns?.[concern] || {};
    for (const [field, axis] of Object.entries(fields)) {
      if (axis.type === 'text') continue;
      const v = c[field];
      switch (axis.type) {
        case 'categorical':
        case 'ordinal':
          vec[`${concern}.${field}`] = axis.values.indexOf(v ?? axis.values[0]);
          break;
        case 'numeric':
          vec[`${concern}.${field}`] = (v - axis.min) / (axis.max - axis.min);
          break;
        case 'multi':
          vec[`${concern}.${field}`] = axis.values.map((item) => (Array.isArray(v) ? v.includes(item) : 0));
          break;
      }
    }
  }
  return vec;
}

// ---------------------------------------------------------------------------
// decode: vector positions → clean enum values (nearest).
// Rounds numeric positions back to [min,max]; multi maps to the member list.
// ---------------------------------------------------------------------------
export function decodeVector(vec, concerns = {}) {
  const out = JSON.parse(JSON.stringify(concerns || {}));
  for (const [concern, fields] of Object.entries(AXES)) {
    out[concern] = out[concern] || {};
    for (const [field, axis] of Object.entries(fields)) {
      if (axis.type === 'text') continue;
      const pos = vec[`${concern}.${field}`];
      if (pos == null) continue;
      switch (axis.type) {
        case 'categorical':
        case 'ordinal': {
          // clamp so out-of-vocab / missing values snap to the nearest edge value
          const lo = 0, hi = axis.values.length - 1;
          const p = Math.max(lo, Math.min(hi, Math.round(pos)));
          out[concern][field] = axis.values[p];
          break;
        }
        case 'numeric': {
          const p = Math.max(0, Math.min(1, pos));
          out[concern][field] = Math.round(axis.min + p * (axis.max - axis.min));
          break;
        }
        case 'multi':
          out[concern][field] = axis.values.filter((_, i) => pos[i]);
          break;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// diff: two concern states → ["concern.key: a -> b", ...] in CLEAN ENUM notation.
// Used by run-gate.js to compute sub-timeline deltas between consecutive slices.
// ---------------------------------------------------------------------------
export function diffStates(a, b) {
  const changes = [];
  for (const [concern, fields] of Object.entries(AXES)) {
    const ca = a?.[concern] || {};
    const cb = b?.[concern] || {};
    for (const field of Object.keys(fields)) {
      const va = ca[field];
      const vb = cb[field];
      if (va === undefined && vb === undefined) continue;
      if (JSON.stringify(va) === JSON.stringify(vb)) continue;
      changes.push(`${concern}.${field}: ${fmt(va)} -> ${fmt(vb)}`);
    }
  }
  return changes;
}

function fmt(v) {
  if (v === undefined || v === null) return '∅';
  if (Array.isArray(v)) return v.length ? `[${v.join(', ')}]` : '[]';
  return String(v);
}

// ---------------------------------------------------------------------------
// foldStates: carry-forward + normalize a sequence of (possibly sparse,
// possibly out-of-enum) slice states into fully-populated CLEAN-ENUM effective
// states. effStates[0] = normalized base; effStates[i] = after slice i.
// This is what makes sub-timeline deltas clean: no "∅", no out-of-vocab values.
// ---------------------------------------------------------------------------
export function mergeConcerns(prev, next) {
  const out = {};
  for (const concern of Object.keys(AXES)) {
    out[concern] = { ...(prev?.[concern] || {}), ...(next?.[concern] || {}) };
  }
  return out;
}
export function normalizeConcerns(concerns) {
  const v = encodeVector(concerns || {});
  return decodeVector(v, concerns || {}); // encode->decode snaps each axis to its nearest clean value
}
export function foldStates(base, sliceStates) {
  const effStates = [normalizeConcerns(base)];
  for (const st of sliceStates || []) {
    effStates.push(normalizeConcerns(mergeConcerns(effStates[effStates.length - 1], st)));
  }
  return effStates;
}

// ---------------------------------------------------------------------------
// text fields that stay alongside the vector (the semantic content).
// Returned so callers can carry them without vectorizing them.
// ---------------------------------------------------------------------------
export function textFields(concerns = {}) {
  const out = {};
  for (const [concern, fields] of Object.entries(AXES)) {
    for (const [field, axis] of Object.entries(fields)) {
      if (axis.type === 'text' && concerns?.[concern]?.[field] != null) {
        out[`${concern}.${field}`] = concerns[concern][field];
      }
    }
  }
  return out;
}
