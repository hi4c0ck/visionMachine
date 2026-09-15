// Tag Service Implementation
// Handles tag element CRUD within segments

import type { TagService, ServiceResult } from './interfaces';
import type { SessionData, PipeRow, TagElement, TimelineElement, Segment, TagType } from '$types';
import { TAG_SPECIFICATIONS } from '$types';
import { snapTo8, isRangeContained, rangesOverlapStrict, placeTagInZone, evenSplitZone } from '$lib/frameMath';
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
    // Option (c): a new tag spans the whole zone unless tags of this SAME
    // type already occupy part of it — then it falls into the first free
    // slot so same-type tags never overlap. No free slot → reject, don't
    // stack a duplicate.
    const sameTypeRanges = segment.tags
      .filter((t) => t.tag === tagType)
      .map((t) => ({ frameStart: t.frameStart, frameEnd: t.frameEnd }));
    const slot = placeTagInZone(
      { frameStart: segment.frameStart, frameEnd: segment.frameEnd },
      sameTypeRanges,
      8,
    );
    if (!slot) {
      // The zone is full for this type. Instead of dead-ending, redistribute:
      // same-type tags share the zone evenly (rule: multiple same-type tags
      // per zone are allowed, they just never overlap). Existing tags keep
      // their prompts/values and move to their even slot; the new tag takes
      // the last slot. Only a zone too small for (n+1) min-span parts fails.
      const zone = { frameStart: segment.frameStart, frameEnd: segment.frameEnd };
      const parts = evenSplitZone(zone, sameTypeRanges.length + 1, 8);
      if (parts) {
        const existing = segment.tags
          .filter((t) => t.tag === tagType)
          .sort((a, b) => a.frameStart - b.frameStart);
        parts.forEach((part, i) => {
          if (i < existing.length) {
            existing[i].frameStart = part.start;
            existing[i].frameEnd = part.end;
          } else {
            segment.tags.push({
              id: crypto.randomUUID(),
              tag: tagType,
              frameStart: part.start,
              frameEnd: part.end,
              value: spec.min || 0,
              spec,
            });
          }
        });
        return { errors: [], warnings: [`Zone resplit evenly for ${parts.length} ${spec.name} tags`] };
      }
      return {
        errors:
          [`Zone is too small for another ${spec.name} tag (needs ${8 * (sameTypeRanges.length + 1)}+ frames) — extend the zone first`],
      };
    }

    const tag: TagElement = {
      id: crypto.randomUUID(),
      tag: tagType,
      frameStart: slot.start,
      frameEnd: slot.end,
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
    const { snapped: [snappedStart, snappedEnd], errors, valid } = validateTagFrames(
      newStart,
      newEnd,
      segment.frameStart,
      segment.frameEnd,
      maxSegmentEnd,
    );

    if (valid) {
      const tag = segment.tags.find(t => t.id === tagId);
      if (tag) {
        tag.frameStart = snappedStart;
        tag.frameEnd = snappedEnd;
      }
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
