/**
 * Wan2GP I2V local-copy slice (TS/UI lane). Pure unit coverage only:
 *  - the preview-pair rule keeps the ORIGINAL remote and adds the local copy,
 *  - a failed download never blocks confirm,
 *  - the catalog's mcp.upload descriptor is byte-for-byte the locked wire
 *    contract the Rust lane consumes.
 * No GPU / server / browser work here: Rust command parsing lives in Rust tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
  isTauri: () => false,
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));

import {
  bestEffortLocalCopy,
  downloadRemoteImage,
  isHttpUrl,
  withRemoteLocalCopy,
} from '../../src/lib/localImage';
import { WAN2GP_PRESET } from '../../src/lib/settings/catalog';

const REMOTE = 'https://cdn.example.com/frame.png';
const REMOTE_2 = 'https://cdn.example.com/updated.png';
const LOCAL = 'C:/media/pipes/p1/user-images/frame.png';

describe('preview pair: preserve remote, add local', () => {
  it('seeds the original remote and adds the downloaded local copy', () => {
    expect(withRemoteLocalCopy(REMOTE, LOCAL, {})).toEqual({
      previewRemoteUrl: REMOTE,
      previewLocalPath: LOCAL,
    });
  });

  it('never overwrites or clears an existing remote, even when the source changes', () => {
    const out = withRemoteLocalCopy(REMOTE_2, LOCAL, {
      previewRemoteUrl: REMOTE,
      previewLocalPath: 'C:/media/old.png',
    });
    expect(out.previewRemoteUrl).toBe(REMOTE);
    expect(out.previewLocalPath).toBe(LOCAL);
  });

  it('does not download or mutate a pair for a non-http source', () => {
    expect(isHttpUrl('data:image/png;base64,AAA')).toBe(false);
    expect(isHttpUrl('C:/media/frame.png')).toBe(false);
    expect(isHttpUrl(REMOTE)).toBe(true);
    const current = { previewRemoteUrl: REMOTE, previewLocalPath: LOCAL };
    expect(withRemoteLocalCopy('', undefined, current)).toEqual(current);
  });
});

describe('download failure does not block confirm', () => {
  beforeEach(() => invokeMock.mockReset());

  it('returns undefined instead of throwing when the fetcher rejects', async () => {
    const local = await bestEffortLocalCopy(REMOTE, async () => {
      throw new Error('CDN 404');
    });
    expect(local).toBeUndefined();
    // Confirm still saves: the URL is preserved, no local path is invented.
    expect(withRemoteLocalCopy(REMOTE, local, { previewRemoteUrl: REMOTE })).toEqual({
      previewRemoteUrl: REMOTE,
    });
  });

  it('returns the local path on success and passes the exact command input', async () => {
    invokeMock.mockResolvedValueOnce({ localPath: LOCAL, remoteUrl: REMOTE, mimeType: 'image/png' });
    const local = await bestEffortLocalCopy(REMOTE, async () => {
      const res = await downloadRemoteImage('s1', 'p1', 'kf-slot1', REMOTE);
      return res.localPath;
    });
    expect(local).toBe(LOCAL);
    expect(invokeMock).toHaveBeenCalledWith('download_remote_image', {
      input: { sessionId: 's1', pipeId: 'p1', refId: 'kf-slot1', remoteUrl: REMOTE },
    });
  });
});

describe('catalog mcp.upload matches the locked wire contract', () => {
  it('is exactly the locked descriptor (no pathArg, no extras)', () => {
    // The real McpUploadSlot is wired through the type now — no cast needed.
    const upload = WAN2GP_PRESET.mcp!.actions!.upload!;
    expect(upload).toEqual({
      action: 'create_file_upload',
      filenameArg: 'filename',
      sizeArg: 'size_bytes',
      tokenPaths: ['token'],
      chunkAction: 'upload_chunk',
      finishAction: 'finish_upload',
      refPaths: ['path', 'media_id'],
    });
    expect(Object.keys(upload).sort()).toEqual([
      'action', 'chunkAction', 'filenameArg', 'finishAction',
      'refPaths', 'sizeArg', 'tokenPaths',
    ]);
  });

  it('leaves the model row, pricing and pending flag untouched', () => {
    expect(WAN2GP_PRESET.models).toHaveLength(1);
    const model = WAN2GP_PRESET.models[0];
    expect(model.id).toBe('ti2v_2_2');
    expect(model.pending).toBe(true);
    expect(model.pricing?.unit).toBe('free-local');
  });
});
