// Unit tests for the session-video composition plan (A4).
//
// The pure arg/manifest builders are tested here; the shell-out itself
// (compose_session_video) needs a real ffmpeg + fixture videos and is
// covered by the Rust tests in src-tauri/src/generation/compose.rs.
//
// This file mirrors the expected frontend-side helper contract so a
// future pure-TS "build the ffmpeg args" step (if we ever move the
// planning to the webview) has a spec to test against.

import { describe, it, expect } from 'vitest';

// Mirror of build_concat_manifest (Rust): forward-slash, double-quoted,
// escaped values.
export function buildConcatManifest(sources: { label: string; path: string }[]): string {
  return sources
    .map((s) => {
      const p = s.path.replace(/\\/g, '/');
      const escaped = p.replace(/"/g, "\\'");
      return `file "${escaped}"`;
    })
    .join('\n');
}

// Mirror of copy_args (Rust): lossless concat demuxer.
export function copyArgs(manifestPath: string, outPath: string): string[] {
  return [
    '-f', 'concat',
    '-safe', '0',
    '-i', manifestPath,
    '-c', 'copy',
    '-movflags', '+faststart',
    outPath,
  ];
}

// Mirror of filter_args (Rust): re-encode fallback.
export function filterArgs(sources: { label: string; path: string }[], outPath: string): string[] {
  const n = sources.length;
  const args: string[] = [];
  let filter = '';
  for (let i = 0; i < sources.length; i++) {
    args.push('-i', sources[i].path);
    filter += `[${i}:v]`;
  }
  filter += `concat=n=${n}:v=1:a=0[v]`;
  args.push(
    '-filter_complex', filter,
    '-map', '[v]',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    outPath,
  );
  return args;
}

describe('buildConcatManifest', () => {
  it('emits one quoted file line per source, forward-slash', () => {
    const m = buildConcatManifest([
      { label: 'Pipe 1', path: 'C:\\proj\\Session\\Pipe 1\\t1\\video.mp4' },
      { label: 'Pipe 2', path: 'C:\\proj\\Session\\Pipe 2\\t2\\video.mp4' },
    ]);
    const lines = m.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('file "C:/proj/Session/Pipe 1/t1/video.mp4"');
    expect(lines[1]).toBe('file "C:/proj/Session/Pipe 2/t2/video.mp4"');
    expect(m).not.toContain('\\');
  });

  it('handles empty source list', () => {
    expect(buildConcatManifest([])).toBe('');
  });
});

describe('copyArgs', () => {
  it('is the lossless concat-demuxer shape', () => {
    expect(copyArgs('m.txt', 'out.mp4')).toEqual([
      '-f', 'concat', '-safe', '0', '-i', 'm.txt',
      '-c', 'copy', '-movflags', '+faststart', 'out.mp4',
    ]);
  });
});

describe('filterArgs', () => {
  it('builds the re-encode fallback with a concat filter', () => {
    const a = filterArgs(
      [
        { label: 'a', path: 'a.mp4' },
        { label: 'b', path: 'b.mp4' },
        { label: 'c', path: 'c.mp4' },
      ],
      'out.mp4',
    );
    // -i a -i b -i c -filter_complex [0:v][1:v][2:v]concat=n=3...[v] -map [v] ...
    expect(a.slice(0, 6)).toEqual(['-i', 'a.mp4', '-i', 'b.mp4', '-i', 'c.mp4']);
    const fcIdx = a.indexOf('-filter_complex');
    expect(a[fcIdx + 1]).toBe('[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]');
    expect(a).toContain('libx264');
    expect(a).toContain('yuv420p');
    expect(a[a.length - 1]).toBe('out.mp4');
  });
});
