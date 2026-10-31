/**
 * lib/tagsets.js — reads the `tags:` block of config/tag_vocabulary.yaml.
 * Tiny dependency-free reader: handles single-line `key: [a, b]` and
 * multi-line wrapped list values.
 */
import fs from 'node:fs';
import path from 'node:path';

export function readTagSets(rootDir) {
  const txt = fs.readFileSync(path.join(rootDir, 'config', 'tag_vocabulary.yaml'), 'utf8');
  const tags = {};
  let inTags = false;
  let curKey = null;
  let buf = '';
  const flush = () => {
    if (curKey) {
      const items = buf.replace(/[[\]]/g, '').split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, '').replace(/\s+#.*$/, '').trim()).filter(Boolean);
      if (items.length) tags[curKey] = items;
      curKey = null;
      buf = '';
    }
  };
  for (const raw of txt.split(/\r?\n/)) {
    const h = raw.trim();
    if (h === 'tags:') { inTags = true; continue; }
    if (!inTags) continue;
    if (!h || h.startsWith('#')) continue;
    const m = h.match(/^([a-z_]+):\s*(.*)$/);
    if (m && !h.startsWith('- ')) {
      flush();
      curKey = m[1];
      buf = m[2] || '';
    } else if (curKey) {
      buf += ' ' + h; // wrapped continuation line
    }
  }
  flush();
  return tags;
}
