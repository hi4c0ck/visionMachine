// Pipe Service Implementation
// Handles pipe CRUD operations

import type { PipeService, ServiceResult } from './interfaces';
import type { SessionData, PipeRow } from '$types';
import {
  validatePipeLength,
  validateQValue,
  validateCValue,
  generatePipeName,
  reindexPipes,
} from './validators';

export class PipeServiceImpl implements PipeService {
  private session: SessionData;

  constructor(session: SessionData) {
    this.session = session;
  }

  async add(_sessionId: string): Promise<ServiceResult> {
    const pipe: PipeRow = {
      id: crypto.randomUUID(),
      name: generatePipeName(this.session.pipes.length),
      lengthFrames: validatePipeLength(
        this.session.pipes[0]?.lengthFrames ?? 121,
        this.session.resolution,
      ),
      qValue: 18,
      cValue: 7,
      keyframes: [],
      subjectReferences: [],
      elements: [],
      orderIndex: this.session.pipes.length,
    };

    this.session.pipes.push(pipe);
    reindexPipes(this.session.pipes);
    return { errors: [] };
  }

  async remove(_sessionId: string, pipeId: string): Promise<ServiceResult> {
    const idx = this.session.pipes.findIndex(p => p.id === pipeId);
    if (idx >= 0) {
      this.session.pipes.splice(idx, 1);
      reindexPipes(this.session.pipes);
    }
    return { errors: [] };
  }

  async move(_sessionId: string, pipeId: string, newOrderIndex: number): Promise<ServiceResult> {
    const from = this.session.pipes.findIndex(p => p.id === pipeId);
    if (from < 0) return { errors: ['Pipe not found'] };
    const to = Math.max(0, Math.min(newOrderIndex, this.session.pipes.length - 1));
    const [pipe] = this.session.pipes.splice(from, 1);
    this.session.pipes.splice(to, 0, pipe);
    reindexPipes(this.session.pipes);
    return { errors: [] };
  }

  async duplicate(_sessionId: string, pipeId: string): Promise<ServiceResult> {
    const pipe = this.getPipe(this.session, pipeId);
    if (pipe) {
      const newPipe: PipeRow = {
        ...pipe,
        id: crypto.randomUUID(),
        name: `${pipe.name} (copy)`,
        orderIndex: this.session.pipes.length,
      };
      this.session.pipes.push(newPipe);
      reindexPipes(this.session.pipes);
    }
    return { errors: [] };
  }

  async updateQ(_sessionId: string, pipeId: string, qValue: number): Promise<ServiceResult> {
    const pipe = this.getPipe(this.session, pipeId);
    if (pipe) {
      pipe.qValue = validateQValue(qValue);
    }
    return { errors: [] };
  }

  async updateC(_sessionId: string, pipeId: string, cValue: number): Promise<ServiceResult> {
    const pipe = this.getPipe(this.session, pipeId);
    if (pipe) {
      pipe.cValue = validateCValue(cValue);
    }
    return { errors: [] };
  }

  async setLength(_sessionId: string, pipeId: string, frames: number): Promise<ServiceResult> {
    const pipe = this.getPipe(this.session, pipeId);
    if (!pipe) return { errors: ['Pipe not found'] };

    const newLength = validatePipeLength(frames, this.session.resolution);
    pipe.lengthFrames = newLength;
    this.rescaleElements(pipe);
    return { errors: [] };
  }

  /**
   * Recalculate every element's frame range to fit the pipe's new length.
   * Growing is a no-op; shrinking trims/adjusts: global ranges, segments
   * (zones) and their tags, keyframe positions and subject-ref ranges are
   * clamped into [0, newLength - 1] so the ruler/segments/tags stay valid
   * and the timeline re-renders against the new frame space. Items that
   * fall completely outside the new range (or would collapse to below the
   * minimum span) are removed, matching the trim warning the UI previewed.
   * Runs on every length commit (store's setPipeLength → notifyUpdate →
   * UI re-sync).
   */
  rescaleElements(pipe: PipeRow): void {
    const maxEnd = pipe.lengthFrames - 1;
    const MIN_SPAN = 8;

    for (const el of pipe.elements as any[]) {
      if (el.tag === 'global_style') {
        if (Number.isFinite(el.frameStart)) el.frameStart = Math.min(el.frameStart, maxEnd);
        if (Number.isFinite(el.frameEnd)) el.frameEnd = Math.min(el.frameEnd, maxEnd);
        if (el.frameEnd <= el.frameStart) el.frameEnd = Math.min(el.frameStart + MIN_SPAN, maxEnd);
      } else if (el.tag === 'timeline') {
        // Drop segments that start past the new end (fully out of range).
        el.segments = (el.segments ?? []).filter((seg: any) => seg.frameStart <= maxEnd);
        for (const seg of el.segments as any[]) {
          if (Number.isFinite(seg.frameEnd)) seg.frameEnd = Math.min(seg.frameEnd, maxEnd);
          if (seg.frameEnd <= seg.frameStart) seg.frameEnd = Math.min(seg.frameStart + MIN_SPAN, maxEnd);
          // Drop tags that start past the (possibly clamped) segment end.
          seg.tags = (seg.tags ?? []).filter((tag: any) => tag.frameStart <= seg.frameEnd);
          for (const tag of seg.tags as any[]) {
            if (Number.isFinite(tag.frameEnd)) tag.frameEnd = Math.min(tag.frameEnd, seg.frameEnd);
            if (tag.frameEnd <= tag.frameStart) tag.frameEnd = Math.min(tag.frameStart + MIN_SPAN, seg.frameEnd);
          }
        }
      }
    }

    for (const kf of pipe.keyframes) {
      if (Number.isFinite(kf.frame)) kf.frame = Math.min(kf.frame, maxEnd);
    }

    for (const ref of pipe.subjectReferences) {
      if (ref.useFrames && Number.isFinite(ref.frameEnd ?? Number.NaN)) {
        const clampedEnd = Math.min(ref.frameEnd!, maxEnd);
        ref.frameEnd = clampedEnd;
        if (clampedEnd < (ref.frameStart ?? 0)) ref.frameEnd = ref.frameStart ?? 0;
      }
    }
  }

  getPipe(session: SessionData, pipeId: string): PipeRow | undefined {
    return session.pipes.find(p => p.id === pipeId);
  }
}
