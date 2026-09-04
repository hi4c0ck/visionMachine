// Tag Service Implementation
// Handles tag element CRUD within segments

import type { TagService, ServiceResult } from './interfaces';
import type { SessionData, PipeRow, TagElement, TimelineElement, Segment, TagType } from '$types';
import { TAG_SPECIFICATIONS } from '$types';
import { snapTo8, isRangeContained, rangesOverlapStrict } from '$lib/frameMath';
import { validateTagFrames } from './validators';

export class TagServiceImpl implements TagService {
  private session: SessionData;
  private getPipe: (pipeId: string) => PipeRow | undefined;

  constructor(session: SessionData, getPipe: (pipeId: string) => PipeRow | undefined) {
    this.session = session;
    this.getPipe = getPipe;
  }

  async add(_sessionId: string, pipeId: string, segmentId: string, tagType: TagType): Promise<ServiceResult> {
    const pipe = this.getPipe(pipeId);
    if (!pipe) return { errors: ['Pipe not found'] };

    const timeline = this.getTimeline(pipe);
    if (!timeline) return { errors: ['Timeline not found'] };

    const segment = this.getSegment(timeline, segmentId);
    if (!segment) return { errors: ['Segment not found'] };

    const spec = TAG_SPECIFICATIONS[tagType];
    const tag: TagElement = {
      id: crypto.randomUUID(),
      tag: tagType,
      frameStart: segment.frameStart,
      frameEnd: segment.frameEnd,
      value: spec.min || 0,
      spec,
    };
    segment.tags.push(tag);

    return { errors: [] };
  }

  async remove(_sessionId: string, pipeId: string, _segmentId: string, tagId: string): Promise<ServiceResult> {
    const pipe = this.getPipe(pipeId);
    if (!pipe) return { errors: ['Pipe not found'] };

    const timeline = this.getTimeline(pipe);
    if (!timeline) return { errors: ['Timeline not found'] };

    for (const seg of timeline.segments) {
      seg.tags = seg.tags.filter(t => t.id !== tagId);
    }
    return { errors: [] };
  }

  async resize(_sessionId: string, pipeId: string, segmentId: string, tagId: string, newStart: number, newEnd: number): Promise<ServiceResult> {
    const pipe = this.getPipe(pipeId);
    if (!pipe) return { errors: ['Pipe not found'] };

    const timeline = this.getTimeline(pipe);
    if (!timeline) return { errors: ['Timeline not found'] };

    const segment = this.getSegment(timeline, segmentId);
    if (!segment) return { errors: ['Segment not found'] };

    const maxSegmentEnd = pipe.lengthFrames - 1;
    const { snapped: [snappedStart, snappedEnd], errors } = validateTagFrames(
      newStart,
      newEnd,
      segment.frameStart,
      segment.frameEnd,
      maxSegmentEnd,
    );

    const tag = segment.tags.find(t => t.id === tagId);
    if (tag) {
      tag.frameStart = snappedStart;
      tag.frameEnd = snappedEnd;
    }

    return { errors };
  }

  async updateValue(_sessionId: string, pipeId: string, segmentId: string, tagId: string, value: number): Promise<ServiceResult> {
    const pipe = this.getPipe(pipeId);
    if (!pipe) return { errors: ['Pipe not found'] };

    const timeline = this.getTimeline(pipe);
    if (!timeline) return { errors: ['Timeline not found'] };

    const segment = this.getSegment(timeline, segmentId);
    if (!segment) return { errors: ['Segment not found'] };

    const tag = segment.tags.find(t => t.id === tagId);
    if (tag) {
      tag.value = value;
    }

    return { errors: [] };
  }

  async updatePrompt(_sessionId: string, pipeId: string, segmentId: string, tagId: string, prompt: string): Promise<ServiceResult> {
    const pipe = this.getPipe(pipeId);
    if (!pipe) return { errors: ['Pipe not found'] };

    const timeline = this.getTimeline(pipe);
    if (!timeline) return { errors: ['Timeline not found'] };

    const segment = this.getSegment(timeline, segmentId);
    if (!segment) return { errors: ['Segment not found'] };

    const tag = segment.tags.find(t => t.id === tagId);
    if (tag) {
      tag.prompt = prompt;
    }

    return { errors: [] };
  }

  private getTimeline(pipe: PipeRow): TimelineElement | undefined {
    return pipe.elements.find(e => 'tag' in e && e.tag === 'timeline') as TimelineElement | undefined;
  }

  private getSegment(timeline: TimelineElement, segmentId: string): Segment | undefined {
    return timeline.segments.find(s => s.id === segmentId);
  }
}
