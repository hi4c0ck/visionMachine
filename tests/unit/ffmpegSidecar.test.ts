/**
 * Packaging tests for the full-variant ffmpeg sidecar staging
 * (scripts/build/fetch-ffmpeg.mjs): the bundled-ffmpeg ship MUST stage BOTH
 * `ffmpeg` and `ffprobe` sidecars (composition prefers a real ffprobe over
 * the ffmpeg-stderr metadata fallback), each verified against a pinned
 * per-executable SHA-256.
 *
 * The script is loaded by absolute file path via createRequire so the real
 * shipped .mjs (not a bundler-transformed copy) is asserted on.
 */
// @vitest-environment node
import { beforeAll, describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const scriptPath = fileURLToPath(
  new URL('../../scripts/build/fetch-ffmpeg.mjs', import.meta.url),
);

let internal: typeof import('../../scripts/build/fetch-ffmpeg.mjs')._internal;

beforeAll(() => {
  const m = require(scriptPath);
  internal = m._internal;
});

describe('ffmpeg sidecar names (full variant)', () => {
  it('windows target stages BOTH ffmpeg and ffprobe with .exe + target suffix', () => {
    const names = internal.sidecarNames('x86_64-pc-windows-msvc');
    expect(names).toEqual([
      'ffmpeg-x86_64-pc-windows-msvc.exe',
      'ffprobe-x86_64-pc-windows-msvc.exe',
    ]);
    expect(internal.sidecarName('x86_64-pc-windows-msvc')).toBe(
      'ffmpeg-x86_64-pc-windows-msvc.exe',
    );
  });

  it('linux target stages both names without .exe', () => {
    const names = internal.sidecarNames('x86_64-unknown-linux-gnu');
    expect(names).toEqual(['ffmpeg-x86_64-unknown-linux-gnu', 'ffprobe-x86_64-unknown-linux-gnu']);
  });

  it('destPaths yields one path per sidecar (ffmpeg, ffprobe)', () => {
    const paths = internal.destPaths('x86_64-pc-windows-msvc');
    expect(paths).toHaveLength(2);
    expect(path.basename(paths[0])).toBe('ffmpeg-x86_64-pc-windows-msvc.exe');
    expect(path.basename(paths[1])).toBe('ffprobe-x86_64-pc-windows-msvc.exe');
    // destPath is the ffmpeg side only (back-compat).
    expect(internal.destPath('x86_64-pc-windows-msvc')).toBe(paths[0]);
  });
});

describe('per-executable SHA-256 pins', () => {
  it('has pinned hashes for BOTH executables of the win64 asset', () => {
    const win64Key = (tool: string) =>
      `autobuild-2026-09-23-14-55/ffmpeg-N-126782-gdc52424419-win64-gpl.zip/${tool}`;
    const ffmpeg = internal.PinnedExecutableSha256[win64Key('ffmpeg')];
    const ffprobe = internal.PinnedExecutableSha256[win64Key('ffprobe')];
    expect(ffmpeg).toMatch(/^[0-9a-f]{64}$/);
    expect(ffprobe).toMatch(/^[0-9a-f]{64}$/);
    expect(ffmpeg).not.toBe(ffprobe);
  });

  it('archive-level pins still cover the asset download', () => {
    expect(
      internal.PinnedAssetSha256['ffmpeg-N-126782-gdc52424419-win64-gpl.zip'],
    ).toMatch(/^[0-9a-f]{64}$/);
  });
});
