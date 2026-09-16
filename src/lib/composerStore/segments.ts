// Segment Service Implementation
// Handles timeline segment CRUD

import type { SegmentService, ServiceResult } from './interfaces';
import type { SessionData, PipeRow, Segment, TimelineElement } from '$types';
import { snapTo8, rangesOverlapStrict, getNextAvailableRange, validateSegments, minZoneSpan } from '$lib/frameMath';
import { MIN_SPAN } from '$lib/frameGeometry';

export class SegmentServiceImpl implements SegmentService {
  private session: SessionData;
  private getPipe: (pipeId: string) => PipeRow | undefined;

  constructor(session: SessionData, getPipe: (pipeId: string) => PipeRow | undefined) {
    this.session = session;
    this.getPipe = getPipe;
  }

  async add(_sessionId: string, pipeId: string, frameStart: number, frameEnd: number): Promise<ServiceResult> {
    const pipe = this.getPipe(pipeId);
    if (!pipe) return { errors: ['Pipe not found'] };

    const maxSegmentEnd = pipe.lengthFrames - 1;

    // Snap frames to multiples of 8
    let snappedStart = snapTo8(frameStart);
    let snappedEnd = snapTo8(frameEnd);

    // Ensure valid bounds
    if (snappedStart < 0) snappedStart = 0;
    if (snappedEnd > maxSegmentEnd) snappedEnd = maxSegmentEnd;

    // Ensure the creation floor (≈1s at session fps, snapped to the 8-grid).
    // A tight pipe that can't host the floor still accepts the 8-frame
    // engine floor as a last resort — sub-1s zones are a "hack" path, not
    // a one-click creation (docs/composer-timeline-sla.md).
    const minSpan = minZoneSpan(this.session.fps);
    if (snappedEnd - snappedStart < minSpan) {
      const extended = Math.min(snappedStart + minSpan, maxSegmentEnd);
      if (extended - snappedStart >= MIN_SPAN) {
        snappedEnd = extended;
      } else {
        return {
          errors: [`Zone needs at least ${minSpan} frames (≈1s at ${this.session.fps} fps) — the pipe has no room for it`],
        };
      }
    }

    // Auto-create timeline if missing
    let timeline = this.getTimeline(pipe);
    if (!timeline) {
      timeline = {
        id: crypto.randomUUID(),
        tag: 'timeline',
        segments: [],
      };
      pipe.elements.push(timeline);
    }

    // Check for overlaps with existing segments
    const existingSegments = timeline.segments;

    for (const seg of existingSegments) {
      if (rangesOverlapStrict(seg.frameStart, seg.frameEnd, snappedStart, snappedEnd)) {
        return { errors: [`Segment overlaps with existing segment at frames ${seg.frameStart}-${seg.frameEnd}`] };
      }
    }

    const segment: Segment = {
      id: crypto.randomUUID(),
      frameStart: snappedStart,
      frameEnd: snappedEnd,
      tags: [],
    };
    timeline.segments.push(segment);

    return { errors: [] };
  }

  async remove(_sessionId: string, pipeId: string, segmentId: string): Promise<ServiceResult> {
    const pipe = this.getPipe(pipeId);
    if (!pipe) return { errors: ['Pipe not found'] };

    const timeline = this.getTimeline(pipe);
    if (!timeline) return { errors: ['Timeline not found'] };

    timeline.segments = timeline.segments.filter(s => s.id !== segmentId);
    return { errors: [] };
  }

  async resize(_sessionId: string, pipeId: string, segmentId: string, newStart: number, newEnd: number): Promise<ServiceResult> {
    const pipe = this.getPipe(pipeId);
    if (!pipe) return { errors: ['Pipe not found'] };

    const timeline = this.getTimeline(pipe);
    if (!timeline) return { errors: ['Timeline not found'] };

    const segment = timeline.segments.find(s => s.id === segmentId);
    if (!segment) return { errors: ['Segment not found'] };

    const maxSegmentEnd = pipe.lengthFrames - 1;
    
    // Snap frames
    let snappedStart = snapTo8(newStart);
    let snappedEnd = snapTo8(newEnd);
    
    // Clamp to bounds
    if (snappedStart < 0) snappedStart = 0;
    if (snappedEnd > maxSegmentEnd) snappedEnd = maxSegmentEnd;
    
    // Ensure minimum span
    if (snappedEnd <= snappedStart) {
      snappedEnd = Math.min(snappedStart + 8, maxSegmentEnd);
    }

    // Check for overlaps with OTHER segments (not itself)
    const otherSegments = timeline.segments.filter(s => s.id !== segmentId);
    for (const other of otherSegments) {
      if (rangesOverlapStrict(other.frameStart, other.frameEnd, snappedStart, snappedEnd)) {
        return { errors: [`Segment overlaps with segment at frames ${other.frameStart}-${other.frameEnd}`] };
      }
    }

    segment.frameStart = snappedStart;
    segment.frameEnd = snappedEnd;

    // Resize tags that exceed new bounds
    for (const tag of segment.tags) {
      if (tag.frameEnd > snappedEnd) {
        tag.frameEnd = Math.min(tag.frameEnd, snappedEnd);
      }
      if (tag.frameStart < snappedStart) {
        tag.frameStart = Math.max(tag.frameStart, snappedStart);
      }
    }

    return { errors: [] };
  }

  // Find next available range for a new segment
  getNextRange(): { start: number; end: number } | null {
    // This will be called from the UI layer with session context
    return null;
  }

  private getTimeline(pipe: PipeRow): TimelineElement | undefined {
    return pipe.elements.find(e => 'tag' in e && e.tag === 'timeline') as TimelineElement | undefined;
  }
}
