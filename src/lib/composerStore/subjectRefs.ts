// Subject Reference Service Implementation
// Handles subject reference CRUD within pipes

import type { SubjectReferenceService, ServiceResult } from './interfaces';
import type { SessionData, PipeRow, SubjectReference } from '$types';
import { snapTo8 } from '$lib/frameMath';

export class SubjectReferenceServiceImpl implements SubjectReferenceService {
  private session: SessionData;

  constructor(session: SessionData) {
    this.session = session;
  }

  async add(_sessionId: string, pipeId: string, imageUrl: string, useFrames: boolean, frameStart?: number, frameEnd?: number): Promise<ServiceResult> {
    const pipe = this.getPipe(pipeId);
    if (!pipe) return { errors: ['Pipe not found'] };
    if (pipe.subjectReferences.length >= 5) return { errors: ['Maximum 5 subject references per pipe'] };

    const ref: SubjectReference = {
      id: crypto.randomUUID(),
      imageUrl,
      useFrames,
      visible: true,
      ...(useFrames && frameStart !== undefined && frameEnd !== undefined ? {
        frameStart: snapTo8(frameStart),
        frameEnd: Math.min(snapTo8(frameEnd), pipe.lengthFrames - 1),
      } : {}),
    };
    pipe.subjectReferences.push(ref);
    return { errors: [] };
  }

  async remove(_sessionId: string, pipeId: string, refId: string): Promise<ServiceResult> {
    const pipe = this.getPipe(pipeId);
    if (!pipe) return { errors: ['Pipe not found'] };
    pipe.subjectReferences = pipe.subjectReferences.filter(r => r.id !== refId);
    return { errors: [] };
  }

  async toggle(_sessionId: string, pipeId: string, refId: string): Promise<ServiceResult> {
    const pipe = this.getPipe(pipeId);
    if (!pipe) return { errors: ['Pipe not found'] };
    const ref = pipe.subjectReferences.find(r => r.id === refId);
    if (ref) ref.visible = !ref.visible;
    return { errors: [] };
  }

  async updateRange(_sessionId: string, pipeId: string, refId: string, frameStart: number, frameEnd: number): Promise<ServiceResult> {
    const pipe = this.getPipe(pipeId);
    if (!pipe) return { errors: ['Pipe not found'] };
    const ref = pipe.subjectReferences.find(r => r.id === refId);
    if (!ref) return { errors: ['Subject reference not found'] };

    const maxEnd = pipe.lengthFrames - 1;
    ref.frameStart = snapTo8(Math.max(0, frameStart));
    ref.frameEnd = snapTo8(Math.min(maxEnd, frameEnd));
    return { errors: [] };
  }

  async updateImageUrl(_sessionId: string, pipeId: string, refId: string, imageUrl: string): Promise<ServiceResult> {
    const pipe = this.getPipe(pipeId);
    if (!pipe) return { errors: ['Pipe not found'] };
    const ref = pipe.subjectReferences.find(r => r.id === refId);
    if (!ref) return { errors: ['Subject reference not found'] };
    ref.imageUrl = imageUrl;
    return { errors: [] };
  }

  async updateUseFrames(_sessionId: string, pipeId: string, refId: string, useFrames: boolean): Promise<ServiceResult> {
    const pipe = this.getPipe(pipeId);
    if (!pipe) return { errors: ['Pipe not found'] };
    const ref = pipe.subjectReferences.find(r => r.id === refId);
    if (!ref) return { errors: ['Subject reference not found'] };
    ref.useFrames = useFrames;
    if (!useFrames) {
      delete ref.frameStart;
      delete ref.frameEnd;
    }
    return { errors: [] };
  }

  private getPipe(pipeId: string): PipeRow | undefined {
    return this.session.pipes.find(p => p.id === pipeId);
  }
}
