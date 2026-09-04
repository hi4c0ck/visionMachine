// Element Service Implementation
// Handles global style and timeline elements

import type { ElementService, ServiceResult } from './interfaces';
import type { SessionData, PipeRow, GlobalElement, TimelineElement } from '$types';
import { snapTo8 } from '$lib/frameMath';

export class ElementServiceImpl implements ElementService {
  private session: SessionData;

  constructor(session: SessionData) {
    this.session = session;
  }

  async addGlobal(_sessionId: string, pipeId: string, frameStart: number, frameEnd: number): Promise<ServiceResult> {
    const pipe = this.getPipe(pipeId);
    if (!pipe) return { errors: ['Pipe not found'] };

    const snappedStart = snapTo8(frameStart);
    const snappedEnd = Math.min(snapTo8(frameEnd), pipe.lengthFrames - 1);
    if (snappedEnd <= snappedStart) return { errors: ['Invalid range'] };

    const global: GlobalElement = {
      id: crypto.randomUUID(),
      tag: 'global_style',
      frameStart: snappedStart,
      frameEnd: snappedEnd,
      enabled: true,
    };
    pipe.elements.push(global);
    return { errors: [] };
  }

  async updateGlobalRange(_sessionId: string, pipeId: string, globalId: string, frameStart: number, frameEnd: number): Promise<ServiceResult> {
    const pipe = this.getPipe(pipeId);
    if (!pipe) return { errors: ['Pipe not found'] };

    const global = pipe.elements.find(
      e => 'tag' in e && e.tag === 'global_style' && e.id === globalId,
    ) as GlobalElement | undefined;
    if (!global) return { errors: ['Global element not found'] };

    const maxEnd = pipe.lengthFrames - 1;
    const snappedStart = snapTo8(Math.max(0, frameStart));
    const snappedEnd = snapTo8(Math.min(maxEnd, frameEnd));
    if (snappedEnd <= snappedStart) return { errors: ['Range must be at least 8 frames'] };

    global.frameStart = snappedStart;
    global.frameEnd = snappedEnd;
    return { errors: [] };
  }

  async toggleGlobal(_sessionId: string, pipeId: string, globalId: string): Promise<ServiceResult> {
    const pipe = this.getPipe(pipeId);
    if (!pipe) return { errors: ['Pipe not found'] };

    const global = this.getGlobalElement(pipe);
    if (global && global.id === globalId) {
      global.enabled = !global.enabled;
    }
    return { errors: [] };
  }

  async removeGlobal(_sessionId: string, pipeId: string, globalId: string): Promise<ServiceResult> {
    const pipe = this.getPipe(pipeId);
    if (!pipe) return { errors: ['Pipe not found'] };

    pipe.elements = pipe.elements.filter(
      e => !('tag' in e) || e.id !== globalId,
    );
    return { errors: [] };
  }

  async addTimeline(_sessionId: string, pipeId: string): Promise<ServiceResult> {
    const pipe = this.getPipe(pipeId);
    if (!pipe) return { errors: ['Pipe not found'] };

    const hasTimeline = pipe.elements.some(e => 'tag' in e && e.tag === 'timeline');
    if (!hasTimeline) {
      const timeline: TimelineElement = {
        id: crypto.randomUUID(),
        tag: 'timeline',
        segments: [],
      };
      pipe.elements.push(timeline);
    }
    return { errors: [] };
  }

  getPipe(pipeId: string): PipeRow | undefined {
    return this.session.pipes.find(p => p.id === pipeId);
  }

  getTimelineElement(pipe: PipeRow): TimelineElement | undefined {
    return pipe.elements.find(e => 'tag' in e && e.tag === 'timeline') as TimelineElement | undefined;
  }

  getGlobalElement(pipe: PipeRow): GlobalElement | undefined {
    return pipe.elements.find(e => 'tag' in e && e.tag === 'global_style') as GlobalElement | undefined;
  }
}
