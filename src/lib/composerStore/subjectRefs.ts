// Subject Reference Service Implementation
// Handles subject reference CRUD within pipes

import type { SubjectReferenceService, ServiceResult } from './interfaces';
import type { SessionData, PipeRow, SubjectReference, KeyframeType } from '$types';
import { snapTo8 } from '$lib/frameMath';

/** Per-type preset rules — subjects follow the same rules as keyframes:
 *  url → imageUrl, txt2img → prompt, img2img → imageUrl (reference) + prompt. */
export function validateSubjectPreset(
  type: KeyframeType,
  imageUrl: string,
  prompt: string,
): string[] {
  const url = imageUrl.trim();
  const p = prompt.trim();
  switch (type) {
    case 'txt2img':
      return p ? [] : ['txt2img subject requires a prompt'];
    case 'img2img':
      if (!url) return ['img2img subject requires a reference image URL'];
      return p ? [] : ['img2img subject requires a prompt'];
    default: // url
      return url ? [] : ['Image URL must not be empty'];
  }
}

export class SubjectReferenceServiceImpl implements SubjectReferenceService {
  private session: SessionData;

  constructor(session: SessionData) {
    this.session = session;
  }

  async add(
    _sessionId: string,
    pipeId: string,
    imageUrl: string,
    useFrames: boolean,
    frameStart?: number,
    frameEnd?: number,
    type?: KeyframeType,
    prompt?: string,
  ): Promise<ServiceResult> {
    const pipe = this.getPipe(pipeId);
    if (!pipe) return { errors: ['Pipe not found'] };
    if (pipe.subjectReferences.length >= 5) return { errors: ['Maximum 5 subject references per pipe'] };

    const presetType = type ?? 'url';
    const errors = validateSubjectPreset(presetType, imageUrl, prompt ?? '');
    if (errors.length > 0) return { errors };

    const ref: SubjectReference = {
      id: crypto.randomUUID(),
      imageUrl: presetType === 'url' ? imageUrl.trim() : imageUrl.trim(),
      type: presetType,
      ...(prompt !== undefined ? { prompt } : {}),
      status: 'pending',
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

  /**
   * Atomic full update of a subject reference. Validates the image URL and
   * clamps the frame range to the pipe's own space, applies the temporal range
   * only when useFrames is true (dropping it otherwise), and returns a single
   * aggregated ServiceResult. Exactly one mutation; the caller triggers a
   * single notifyUpdate().
   */
  async update(
    _sessionId: string,
    pipeId: string,
    refId: string,
    update: {
      imageUrl: string;
      useFrames: boolean;
      frameStart?: number;
      frameEnd?: number;
      type?: KeyframeType;
      prompt?: string;
    },
  ): Promise<ServiceResult> {
    const pipe = this.getPipe(pipeId);
    if (!pipe) return { errors: ['Pipe not found'] };
    const ref = pipe.subjectReferences.find(r => r.id === refId);
    if (!ref) return { errors: ['Subject reference not found'] };

    const presetType: KeyframeType = update.type ?? ref.type ?? 'url';
    const errors = validateSubjectPreset(presetType, update.imageUrl ?? '', update.prompt ?? ref.prompt ?? '');

    let start: number | undefined;
    let end: number | undefined;
    if (update.useFrames) {
      const maxEnd = pipe.lengthFrames - 1;
      if (update.frameStart === undefined || update.frameEnd === undefined) {
        errors.push('Frame range requires both start and end frames');
      } else {
        start = snapTo8(Math.max(0, update.frameStart));
        end = snapTo8(Math.min(maxEnd, update.frameEnd));
        if (start > end) {
          errors.push('Frame start cannot exceed frame end');
        }
      }
    }

    // Apply as one logical mutation only when everything validates, so a
    // failure never leaves a partial update behind.
    if (errors.length === 0) {
      ref.type = presetType;
      ref.imageUrl = (update.imageUrl ?? '').trim();
      // Keep the prompt across a mode switch (e.g. txt2img → url) so the
      // user's text survives — it's inert metadata for `url` pieces (the
      // engine only reads it for txt2img/img2img), and switching back to a
      // prompt mode instantly restores the work. Never delete it here.
      if (update.prompt !== undefined) ref.prompt = update.prompt;
      // edited input ⇒ image not generated yet
      ref.status = 'pending';
      ref.useFrames = update.useFrames;
      if (update.useFrames) {
        ref.frameStart = start;
        ref.frameEnd = end;
      } else {
        delete ref.frameStart;
        delete ref.frameEnd;
      }
    }

    return { errors };
  }

  private getPipe(pipeId: string): PipeRow | undefined {
    return this.session.pipes.find(p => p.id === pipeId);
  }
}
