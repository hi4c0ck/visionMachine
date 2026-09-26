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
  // All four shipped asset platforms must have executable-level pins —
  // a missing entry used to mean "stage without verification", which is
  // exactly how a stale local Gyan binary slipped past CI (win64 pins were
  // derived from local files, not the pinned archive).
  const assets = [
    'ffmpeg-N-126782-gdc52424419-win64-gpl.zip',
    'ffmpeg-N-126782-gdc52424419-winarm64-gpl.zip',
    'ffmpeg-N-126782-gdc52424419-linux64-gpl.tar.xz',
    'ffmpeg-N-126782-gdc52424419-linuxarm64-gpl.tar.xz',
  ];

  it.each(assets)('pins BOTH executables of %s', (asset) => {
    const key = (tool: string) =>
      `autobuild-2026-09-23-14-55/${asset}/${tool}`;
    const ffmpeg = internal.PinnedExecutableSha256[key('ffmpeg')];
    const ffprobe = internal.PinnedExecutableSha256[key('ffprobe')];
    expect(ffmpeg).toMatch(/^[0-9a-f]{64}$/);
    expect(ffprobe).toMatch(/^[0-9a-f]{64}$/);
    expect(ffmpeg).not.toBe(ffprobe);
  });

  it('win64 executable pins match the actual pinned archive contents', () => {
    // Pinned against the real BtbN asset bin/ffmpeg.exe / bin/ffprobe.exe
    // (the 09948d4c…/a6618e99… values were derived from stale local Gyan
    // binaries — that is how the CI win-x64 installer job started failing).
    const key = (tool: string) =>
      `autobuild-2026-09-23-14-55/ffmpeg-N-126782-gdc52424419-win64-gpl.zip/${tool}`;
    expect(internal.PinnedExecutableSha256[key('ffmpeg')]).toBe(
      'af7913b7ddc324bf02b8af72fe8612b1471455ef8d9e04e45466510742abcff9',
    );
    expect(internal.PinnedExecutableSha256[key('ffprobe')]).toBe(
      'f9cb4d449a08c9f7189caabddbb2d5fe19415020d5599f42c12a62396a8292c3',
    );
  });

  it('archive-level pins still cover the asset download', () => {
    expect(
      internal.PinnedAssetSha256['ffmpeg-N-126782-gdc52424419-win64-gpl.zip'],
    ).toMatch(/^[0-9a-f]{64}$/);
  });
});
