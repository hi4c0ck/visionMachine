/**
 * `toMediaUrl` contract for degraded downloads (2026-11-11).
 *
 * The video stage's L2 degrade path stores the provider's REMOTE url as
 * `last_generation.videoPath` when the CDN egress gate blocks the local
 * download. The WebView must load that url directly — it must never be
 * wrapped in the local `media://`/`http://media.localhost` scheme or have a
 * `.proxy` sibling derived from it (the old behavior produced
 * `media://localhost/https%3A%2F%2F…proxy.mp4` → 404, and the play-outside /
 * attach commands rejected it against the media-root guard).
 */
import { describe, it, expect, vi } from 'vitest';

const mockInvoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => true,
  invoke: mockInvoke,
}));

import { toMediaUrl, isLocalPath } from '../../src/lib/mediaUrl';

describe('toMediaUrl degraded-remote passthrough', () => {
  it('passes a remote https url through verbatim (no local scheme, no proxy sibling)', async () => {
    const url =
      'https://platform-outputs.agnes-ai.space/videos/agnes-video-2.5/task_ABC.mp4';
    expect(await toMediaUrl(url)).toBe(url);
    // Even the preview variant must not derive a `.proxy` sibling from a url.
    expect(await toMediaUrl(url, { variant: 'preview' })).toBe(url);
  });

  it('passes an http url through verbatim', async () => {
    const url = 'http://cdn.example.com/clip.mp4';
    expect(await toMediaUrl(url)).toBe(url);
  });

  it('passes a data: URI through verbatim (in-memory, not a media-tree path)', async () => {
    const uri = 'data:video/mp4;base64,AAAA';
    expect(await toMediaUrl(uri)).toBe(uri);
  });

  it('still prefixes LOCAL media-tree paths with the local scheme', async () => {
    const local = '/home/u/media/session/pipe/task/video.mp4';
    const out = await toMediaUrl(local);
    // A local path gets a WebView scheme prefix (media:// or the WebView2
    // http://media.localhost form) — so the result is longer than and
    // distinct from the raw path, and no longer looks like a bare local
    // path (isLocalPath would be true for `local` itself).
    expect(out).not.toBeNull();
    expect(out!.length).toBeGreaterThan(local.length);
    expect(out).not.toBe(local);
  });

  it('still derives the proxy sibling for LOCAL video paths only', async () => {
    const local = 'C:\\VM\\media\\session\\pipe\\task\\video.mp4';
    const out = await toMediaUrl(local, { variant: 'preview' });
    expect(out).toContain('video.proxy.mp4');
  });

  it('returns null for empty / undefined input', async () => {
    expect(await toMediaUrl(null)).toBeNull();
    expect(await toMediaUrl('')).toBeNull();
    expect(await toMediaUrl(undefined)).toBeNull();
  });

  it('isLocalPath classifies urls + data uris as non-local', () => {
    expect(isLocalPath('https://x.y/z.mp4')).toBe(false);
    expect(isLocalPath('http://x.y/z.mp4')).toBe(false);
    expect(isLocalPath('data:video/mp4;base64,AA')).toBe(false);
    expect(isLocalPath('C:\\media\\clip.mp4')).toBe(true);
  });
});
