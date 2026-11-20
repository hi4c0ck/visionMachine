/**
 * lib/validator.js — shared minimal JSON-schema validator + deep-equal.
 * Covers the draft-07 subset used by harness/schemas/*.json:
 * type, required, additionalProperties:false, enum, minimum/maximum,
 * minItems/maxItems, items, properties.
 */

export function validate(schema, value, p = '$') {
  const errs = [];
  const t = schema.type;
  if (t) {
    const ok =
      t === 'object' ? typeof value === 'object' && value !== null && !Array.isArray(value)
      : t === 'array' ? Array.isArray(value)
      : t === 'string' ? typeof value === 'string'
      : t === 'integer' ? Number.isInteger(value)
      : t === 'number' ? typeof value === 'number'
      : t === 'boolean' ? typeof value === 'boolean'
      : true;
    if (!ok) return [`${p}: expected ${t}, got ${value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value}`];
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errs.push(`${p}: ${JSON.stringify(value)} not in enum`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errs.push(`${p}: ${value} < minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errs.push(`${p}: ${value} > maximum ${schema.maximum}`);
  }
  if (Array.isArray(value) && schema.items) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errs.push(`${p}: fewer than ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errs.push(`${p}: more than ${schema.maxItems} items`);
    value.forEach((v, i) => errs.push(...validate(schema.items, v, `${p}[${i}]`)));
  }
  if (t === 'object' && typeof value === 'object' && value !== null) {
    for (const r of schema.required || []) if (!(r in value)) errs.push(`${p}: missing required "${r}"`);
    if (schema.additionalProperties === false) {
      for (const k of Object.keys(value)) if (!(k in (schema.properties || {}))) errs.push(`${p}: unexpected property "${k}"`);
    }
    for (const [k, sub] of Object.entries(schema.properties || {})) {
      if (k in value) errs.push(...validate(sub, value[k], `${p}.${k}`));
    }
  }
  return errs;
}

export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual(a[k], b[k]));
}

/** Remove JSON-schema meta keys ($schema/$id/...) + top-level title/description. */
export function stripMeta(obj) {
  const clean = (o, top) => {
    if (Array.isArray(o)) return o.map((x) => clean(x, false));
    if (o && typeof o === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(o)) {
        if (k.startsWith('$')) continue;
        if (top && (k === 'title' || k === 'description')) continue;
        out[k] = clean(v, false);
      }
      return out;
    }
    return o;
  };
  return clean(obj, true);
}
