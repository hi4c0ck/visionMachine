// Compact human rendering of build state (used by the runner's live line,
// build:status and build:watch).

export function fmtMs(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtGB(mb) {
  return mb == null ? '-' : `${(mb / 1024).toFixed(1)} GB`;
}

/** One-line head, e.g. [BUILD] running · cargo · 213u · 07:41 · ram 6.3 GB · jobs 4 */
export function statusHead(s, now = Date.now()) {
  if (!s) return '[BUILD] no build recorded — start one with: npm run build:desktop';
  if (s.status === 'running') {
    const stall = s.stallWarned ? ` · ⚠ quiet ${fmtMs(now - (s.lastActivityAt || now))}` : '';
    return (
      `[BUILD] running · ${s.phase} · ${s.units ?? 0}u · ${fmtMs(now - s.startedAt)}` +
      ` · ram ${fmtGB(s.ramMB)} · jobs ${s.jobs ?? '?'}${stall}`
    );
  }
  let line = `[BUILD] ${s.status}`;
  if (s.finishedAt && s.startedAt) line += ` in ${fmtMs(s.finishedAt - s.startedAt)}`;
  if (s.status === 'done' && s.msiPath) line += ` → ${s.msiPath}`;
  if (s.failReason) line += ` (${s.failReason})`;
  return line;
}

/** Multi-line detail block for `build:status` / final reports. */
export function statusDetail(s, lastLines = []) {
  const out = [];
  if (s && s.status === 'running') {
    if (s.lastCrate) out.push(`  last:    ${s.lastCrate}`);
    if (s.logFile) out.push(`  log:     ${s.logFile}`);
    out.push('  hint:    npm run build:watch (live) · npm run build:stop');
  }
  for (const line of lastLines) out.push(`  ${line}`);
  if (s && s.status === 'done' && s.msiPath) {
    out.push(`  install: msiexec /i "${s.msiPath}"`);
  }
  return out.join('\n');
}
