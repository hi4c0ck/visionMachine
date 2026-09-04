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
  ): Promise<ServiceResult> {
    const pipe = this.getPipe(pipeId);
    if (!pipe) return { errors: ['Pipe not found'] };

    const snappedFrame = snapTo8(frame);

    const kf: PipeKeyframe = {
      id: crypto.randomUUID(),
      frame: snappedFrame,
      slotIndex,
      type,
      imageSrc: type === 'url' ? value : undefined,
      prompt: type !== 'url' ? value : undefined,
      referenceUrl: type === 'img2img' ? value : undefined,
      status: 'pending',
    };
    pipe.keyframes.push(kf);

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
