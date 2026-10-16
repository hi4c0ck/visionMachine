// Keyframe Service Implementation
// Handles keyframe CRUD operations

import type { KeyframeService, ServiceResult } from './interfaces';
import type { SessionData, PipeRow, PipeKeyframe } from '$types';
import { snapTo8 } from '$lib/frameMath';

export class KeyframeServiceImpl implements KeyframeService {
  private session: SessionData;
  private getPipe: (pipeId: string) => PipeRow | undefined;

  constructor(session: SessionData, getPipe: (pipeId: string) => PipeRow | undefined) {
    this.session = session;
    this.getPipe = getPipe;
  }

  async add(
    _sessionId: string,
    pipeId: string,
    slotIndex: number,
    frame: number,
    type: 'url' | 'txt2img' | 'img2img',
    value: string,
    referenceUrl?: string,
    id?: string,
    previewLocalPath?: string,
    previewRemoteUrl?: string,
    imageOverride?: { size?: string | null; ratio?: string | null },
  ): Promise<ServiceResult> {
    const pipe = this.getPipe(pipeId);
    if (!pipe) return { errors: ['Pipe not found'] };

    const snappedFrame = snapTo8(frame);

    // img2img = referenceUrl + prompt. Both are required; reject an incomplete
    // keyframe rather than silently storing a half-formed record.
    if (type === 'img2img' && !(referenceUrl ?? '').trim()) {
      return { errors: ['img2img keyframe requires a reference image URL'] };
    }
    if (type !== 'url' && !value.trim()) {
      return { errors: ['Keyframe prompt must not be empty'] };
    }

    // A standalone "Generate" in the modal may have produced an artifact BEFORE
    // the piece was saved. Carry its preview pair onto the record so the chip
    // shows a thumbnail + the video stage carries the right source.
    const preview: Partial<PipeKeyframe> = {};
    if (previewLocalPath?.trim()) preview.previewLocalPath = previewLocalPath;
    if (previewRemoteUrl?.trim()) preview.previewRemoteUrl = previewRemoteUrl;

    // Upsert: editing an existing slot replaces that keyframe instead of
    // stacking a duplicate entry in the same slot. Existing ID preserved.
    const existing = pipe.keyframes.find((k) => k.slotIndex === slotIndex);
    if (existing) {
      // Split fields per type (active data); keep the SIBLING fields of a
      // previous mode on an unused basis — the user's text must not vanish
      // when switching modes (url ⇄ txt2img ⇄ img2img), and switching
      // back instantly restores the work.
      if (type === 'url') {
        existing.imageSrc = value;
      } else {
        existing.prompt = value;
      }
      if (type === 'img2img') existing.referenceUrl = referenceUrl ?? undefined;
      // Shared edit fields always apply (not mode-dependent).
      existing.type = type;
      existing.frame = snappedFrame;
      existing.status = 'pending';
      Object.assign(existing, preview);
      // 0012 Phase 4: explicit size/ratio override for this piece (undefined
      // = keep the session default = null).
      if (imageOverride) {
        existing.imageSize = imageOverride.size ?? null;
        existing.imageRatio = imageOverride.ratio ?? null;
      }
    } else {
      const override: Partial<PipeKeyframe> = {};
      if (imageOverride) {
        override.imageSize = imageOverride.size ?? null;
        override.imageRatio = imageOverride.ratio ?? null;
      }
      pipe.keyframes.push({
        id: id ?? crypto.randomUUID(),
        slotIndex,
        frame: snappedFrame,
        type,
        imageSrc: type === 'url' ? value : undefined,
        prompt: type !== 'url' ? value : undefined,
        referenceUrl: type === 'img2img' ? (referenceUrl ?? undefined) : undefined,
        status: 'pending',
        ...preview,
        ...override,
      });
    }

    return { errors: [] };
  }

  async remove(_sessionId: string, pipeId: string, keyframeId: string): Promise<ServiceResult> {
    const pipe = this.getPipe(pipeId);
    if (!pipe) return { errors: ['Pipe not found'] };

    pipe.keyframes = pipe.keyframes.filter(k => k.id !== keyframeId);
    return { errors: [] };
  }

  async move(_sessionId: string, pipeId: string, keyframeId: string, newFrame: number): Promise<ServiceResult> {
    const pipe = this.getPipe(pipeId);
    if (!pipe) return { errors: ['Pipe not found'] };

    const kf = pipe.keyframes.find(k => k.id === keyframeId);
    if (kf) {
      kf.frame = snapTo8(newFrame);
    }
    return { errors: [] };
  }
}
