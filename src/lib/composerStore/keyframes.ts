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

    const fields: Omit<PipeKeyframe, 'id' | 'slotIndex'> = {
      frame: snappedFrame,
      type,
      imageSrc: type === 'url' ? value : undefined,
      prompt: type !== 'url' ? value : undefined,
      referenceUrl: type === 'img2img' ? (referenceUrl ?? undefined) : undefined,
      status: 'pending',
    };

    // Upsert: editing an existing slot replaces that keyframe instead of
    // stacking a duplicate entry in the same slot. Existing ID preserved.
    const existing = pipe.keyframes.find((k) => k.slotIndex === slotIndex);
    if (existing) {
      Object.assign(existing, fields, { id: existing.id });
    } else {
      pipe.keyframes.push({
        id: crypto.randomUUID(),
        slotIndex,
        ...fields,
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
