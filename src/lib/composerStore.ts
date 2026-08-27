// Composer reactive store for VisionMachine
// Manages nested pipe structure with Global/Timeline elements and segments with tags

import { snapTo8nPlus1, snapTo8, validateSegments, validateKeyframe, clampLength, getMaxFrames } from './frameMath.ts';
import { invoke } from '@tauri-apps/api/core';
import { TAG_SPECIFICATIONS, migratePipeToTwoLayer, validateTagElements, validateTimelineSegments } from '$types';
import type { 
  SessionData, 
  PipeRow, 
  TagType, 
  PipeKeyframe,
  GlobalElement,
  TimelineElement,
  Segment,
  TagElement,
  PipeElement 
} from '$types';

// ── Store State ───────────────────────────────────────────────────────────────

let sessions = new Map<string, SessionData>();
let unsynced = new Set<string>();

// ── Helpers ───────────────────────────────────────────────────────────────────

function migratePipe(pipe: PipeRow): PipeRow {
  // If already has elements, no migration needed
  if (pipe.elements && pipe.elements.length > 0) {
    // Ensure each element has a tag
    const migratedElements = pipe.elements.map(e => ({
      ...e,
      tag: e.tag || (e.tag === 'timeline' ? 'timeline' : e.tag === 'global_style' ? 'global_style' : 'timeline'),
    }));
    return { ...pipe, elements: migratedElements };
  }
  
  // Migrate from old structure
  const elements: PipeElement[] = [];
  
  // Add global node if exists
  if (pipe.globalNodes && pipe.globalNodes.length > 0) {
    for (const node of pipe.globalNodes) {
      if (node.tag === 'global_style') {
        elements.push({
          id: node.id,
          tag: 'global_style',
          value: node.value || '',
          enabled: node.enabled !== false,
        });
      } else {
        elements.push({
          id: node.id,
          tag: 'global_style',
          value: node.value || '',
          enabled: node.enabled !== false,
        });
      }
    }
  }
  
  // Add timeline element with segments
  if (pipe.segments && pipe.segments.length > 0) {
    elements.push({
      id: crypto.randomUUID(),
      tag: 'timeline',
      segments: pipe.segments.map(s => ({
        id: s.id,
        frameStart: s.frameStart,
        frameEnd: s.frameEnd,
        tags: s.tags || [],
      })),
    });
  }
  
  return { ...pipe, elements };
}

function getPipe(session: SessionData, pipeId: string): PipeRow | undefined {
  return session.pipes.find(p => p.id === pipeId);
}

function ensureTimelineElement(pipe: PipeRow): TimelineElement {
  // Find or create timeline element
  let timeline = pipe.elements.find(e => e.tag === 'timeline') as TimelineElement | undefined;
  if (!timeline) {
    timeline = {
      id: crypto.randomUUID(),
      tag: 'timeline',
      segments: [],
    };
    return { ...pipe, elements: [...pipe.elements, timeline] }.elements.find(e => e.tag === 'timeline') as TimelineElement;
  }
  return timeline;
}

function ensureGlobalElement(pipe: PipeRow): GlobalElement | undefined {
  return pipe.elements.find(e => e.tag === 'global_style') as GlobalElement | undefined;
}

// ── Actions ───────────────────────────────────────────────────────────────────

export async function addPipe(sessionId: string): Promise<{ errors: string[] }> {
  const session = sessions.get(sessionId);
  if (!session) return { errors: ['Session not found'] };
  
  const maxFrames = getMaxFrames(session.resolution);
  const defaultPipe: PipeRow = {
    id: crypto.randomUUID(),
    lengthFrames: maxFrames,
    keyframes: [],
    qValue: 18,
    cValue: 7,
    elements: [],
  };
  
  sessions.set(sessionId, {
    ...session,
    pipes: [...session.pipes, defaultPipe],
    updatedAt: Date.now(),
  });
  
  await persistToBackend(sessionId);
}

export async function removePipe(sessionId: string, pipeId: string): Promise<{ errors: string[] }> {
  const session = sessions.get(sessionId);
  if (!session || session.pipes.length <= 1) return { errors: ['Session not found'] };
  
  sessions.set(sessionId, {
    ...session,
    pipes: session.pipes.filter(p => p.id !== pipeId),
    updatedAt: Date.now(),
  });
  
  await persistToBackend(sessionId);
}

export async function movePipe(sessionId: string, pipeId: string, direction: 'up' | 'down'): Promise<{ errors: string[] }> {
  const session = sessions.get(sessionId);
  if (!session) return { errors: ['Session not found'] };
  
  const idx = session.pipes.findIndex(p => p.id === pipeId);
  if (idx < 0) return { errors: ['Session not found'] };
  
  const newPipes = [...session.pipes];
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  
  if (swapIdx < 0 || swapIdx >= newPipes.length) return { errors: ['Pipe not found'] };
  
  [newPipes[idx], newPipes[swapIdx]] = [newPipes[swapIdx], newPipes[idx]];
  
  sessions.set(sessionId, {
    ...session,
    pipes: newPipes,
    updatedAt: Date.now(),
  });
  
  await persistToBackend(sessionId);
}

export async function duplicatePipe(sessionId: string, pipeId: string): Promise<{ errors: string[] }> {
  const session = sessions.get(sessionId);
  if (!session) return { errors: ['Session not found'] };
  
  const pipe = session.pipes.find(p => p.id === pipeId);
  if (!pipe) return { errors: ['Pipe not found'] };
  
  const copy: PipeRow = {
    ...pipe,
    id: crypto.randomUUID(),
    keyframes: pipe.keyframes.map(k => ({ ...k, id: crypto.randomUUID() })),
    elements: pipe.elements.map(e => ({
      ...e,
      id: crypto.randomUUID(),
      ...(e.tag === 'timeline' ? {
        segments: e.segments.map(s => ({
          ...s,
          id: crypto.randomUUID(),
          tags: s.tags.map(t => ({ ...t, id: crypto.randomUUID() })),
        })),
      } : {}),
    })),
  };
  
  const idx = session.pipes.findIndex(p => p.id === pipeId);
  const newPipes = [...session.pipes.slice(0, idx + 1), copy, ...session.pipes.slice(idx + 1)];
  
  sessions.set(sessionId, {
    ...session,
    pipes: newPipes,
    updatedAt: Date.now(),
  });
  
  await persistToBackend(sessionId);
}

export async function updateQ(sessionId: string, pipeId: string, value: number): Promise<{ errors: string[] }> {
  const session = sessions.get(sessionId);
  if (!session) return { errors: ['Session not found'] };
  
  const newPipes = session.pipes.map(p =>
    p.id === pipeId ? { ...p, qValue: Math.min(30, Math.max(5, value)) } : p
  );
  
  sessions.set(sessionId, {
    ...session,
    pipes: newPipes,
    updatedAt: Date.now(),
  });
  
  await persistToBackend(sessionId);
}

export async function updateC(sessionId: string, pipeId: string, value: number): Promise<{ errors: string[] }> {
  const session = sessions.get(sessionId);
  if (!session) return { errors: ['Session not found'] };
  
  const newPipes = session.pipes.map(p =>
    p.id === pipeId ? { ...p, cValue: Math.min(15, Math.max(0.5, value)) } : p
  );
  
  sessions.set(sessionId, {
    ...session,
    pipes: newPipes,
    updatedAt: Date.now(),
  });
  
  await persistToBackend(sessionId);
}

export async function setPipeLength(sessionId: string, pipeId: string, length: number): Promise<{ errors: string[] }> {
  const session = sessions.get(sessionId);
  if (!session) return { errors: ['Session not found'] };
  
  const pipe = session.pipes.find(p => p.id === pipeId);
  if (!pipe) return { errors: ['Pipe not found'] };
  
  const maxFrames = getMaxFrames(session.resolution);
  const snapped = clampLength(length, maxFrames);
  
  // Update elements to respect new length
  const newElements = pipe.elements.map(e => {
    if (e.tag !== 'timeline') return e;
    const timeline = e as TimelineElement;
    const updatedSegments = timeline.segments
      .map(s => ({
        ...s,
        frameStart: Math.min(s.frameStart, snapped),
        frameEnd: Math.min(s.frameEnd, snapped),
      }))
      .filter(s => s.frameEnd > s.frameStart);
    
    return { ...timeline, segments: updatedSegments };
  });
  
  sessions.set(sessionId, {
    ...session,
    pipes: session.pipes.map(p =>
      p.id === pipeId ? { ...p, lengthFrames: snapped, elements: newElements } : p
    ),
    updatedAt: Date.now(),
  });
  
  await persistToBackend(sessionId);
  return { errors: [] };
}

// ── Global Element Actions ────────────────────────────────────────────────────

export async function addGlobalElement(sessionId: string, pipeId: string, value: string): Promise<{ errors: string[] }> {
  const session = sessions.get(sessionId);
  if (!session) return { errors: ['Session not found'] };

  const pipe = session.pipes.find(p => p.id === pipeId);
  if (!pipe) return { errors: ['Pipe not found'] };

  // Check if global already exists
  const existingGlobal = pipe.elements.find(e => e.tag === 'global_style');
  if (existingGlobal) {
    return { errors: ['Global element already exists in this pipe'] };
  }

  const newElement: GlobalElement = {
    id: crypto.randomUUID(),
    tag: 'global_style',
    value,
    enabled: true,
  };

  const newPipes = session.pipes.map(p =>
    p.id === pipeId ? { ...p, elements: [...p.elements, newElement] } : p
  );

  sessions.set(sessionId, {
    ...session,
    pipes: newPipes,
    updatedAt: Date.now(),
  });

  await persistToBackend(sessionId);
  return { errors: [] };
}

export async function updateGlobalElement(sessionId: string, pipeId: string, nodeId: string, value: string): Promise<{ errors: string[] }> {
  const session = sessions.get(sessionId);
  if (!session) return { errors: ['Session not found'] };
  
  const pipe = session.pipes.find(p => p.id === pipeId);
  if (!pipe) return { errors: ['Pipe not found'] };
  
  const newElements = pipe.elements.map(e => {
    if (e.tag !== 'global_style' || e.id !== nodeId) return e;
    return { ...e, value };
  });
  
  const newPipes = session.pipes.map(p =>
    p.id === pipeId ? { ...p, elements: newElements } : p
  );
  
  sessions.set(sessionId, {
    ...session,
    pipes: newPipes,
    updatedAt: Date.now(),
  });
  
  await persistToBackend(sessionId);
  return { errors: [] };
}

export async function toggleGlobalElement(sessionId: string, pipeId: string, nodeId: string): Promise<{ errors: string[] }> {
  const session = sessions.get(sessionId);
  if (!session) return { errors: ['Session not found'] };
  
  const pipe = session.pipes.find(p => p.id === pipeId);
  if (!pipe) return { errors: ['Pipe not found'] };
  
  const newElements = pipe.elements.map(e => {
    if (e.tag !== 'global_style' || e.id !== nodeId) return e;
    return { ...e, enabled: !e.enabled };
  });
  
  const newPipes = session.pipes.map(p =>
    p.id === pipeId ? { ...p, elements: newElements } : p
  );
  
  sessions.set(sessionId, {
    ...session,
    pipes: newPipes,
    updatedAt: Date.now(),
  });
  
  await persistToBackend(sessionId);
  return { errors: [] };
}

export async function removeGlobalElement(sessionId: string, pipeId: string, nodeId: string): Promise<{ errors: string[] }> {
  const session = sessions.get(sessionId);
  if (!session) return { errors: ['Session not found'] };
  
  const pipe = session.pipes.find(p => p.id === pipeId);
  if (!pipe) return { errors: ['Pipe not found'] };
  
  const newElements = pipe.elements.filter(e => !(e.tag === 'global_style' && e.id === nodeId));
  
  const newPipes = session.pipes.map(p =>
    p.id === pipeId ? { ...p, elements: newElements } : p
  );
  
  sessions.set(sessionId, {
    ...session,
    pipes: newPipes,
    updatedAt: Date.now(),
  });
  
  await persistToBackend(sessionId);
  return { errors: [] };
}

// ── Timeline & Segment Actions ────────────────────────────────────────────────

export async function addTimelineElement(sessionId: string, pipeId: string): Promise<{ errors: string[] }> {
  const session = sessions.get(sessionId);
  if (!session) return { errors: ['Session not found'] };
  
  const pipe = session.pipes.find(p => p.id === pipeId);
  if (!pipe) return { errors: ['Pipe not found'] };
  
  // Check if timeline already exists
  if (pipe.elements.some(e => e.tag === 'timeline')) {
    return { errors: ['Timeline element already exists in this pipe'] };
  }
  
  const newElement: TimelineElement = {
    id: crypto.randomUUID(),
    segments: [],
  };
  
  const newPipes = session.pipes.map(p =>
    p.id === pipeId ? { ...p, elements: [...p.elements, newElement] } : p
  );
  
  sessions.set(sessionId, {
    ...session,
    pipes: newPipes,
    updatedAt: Date.now(),
  });
  
  await persistToBackend(sessionId);
  return { errors: [] };
}

export async function addSegment(
  sessionId: string, 
  pipeId: string, 
  frameStart: number, 
  frameEnd: number
): Promise<{ errors: string[] }> {
  const session = sessions.get(sessionId);
  if (!session) return { errors: ['Session not found'] };
  
  const pipe = session.pipes.find(p => p.id === pipeId);
  if (!pipe) return { errors: ['Pipe not found'] };
  
  // Ensure timeline exists
  let timeline = pipe.elements.find(e => e.tag === 'timeline') as TimelineElement | undefined;
  if (!timeline) {
    timeline = { id: crypto.randomUUID(), tag: 'timeline', segments: [] };
    // Add new timeline to pipe elements
    const newPipe: PipeRow = { ...pipe, elements: [...pipe.elements, timeline] };
    const newPipes = session.pipes.map(p => p.id === pipeId ? newPipe : p);
    sessions.set(sessionId, { ...session, pipes: newPipes, updatedAt: Date.now() });
    await persistToBackend(sessionId);
    return { errors: [] };
  }
  
  // Snap frames
  const snappedStart = snapTo8(frameStart);
  const snappedEnd = snapTo8(frameEnd);
  
  if (snappedEnd - snappedStart < 8) {
    return { errors: ['Minimum segment span is 8 frames'] };
  }
  
  if (snappedStart < 0 || snappedEnd > pipe.lengthFrames) {
    return { errors: ['Segment out of bounds'] };
  }
  
  // Check for overlaps with existing segments
  const overlappingSegments = timeline.segments.filter(s => 
    snappedStart < s.frameEnd && snappedEnd > s.frameStart
  );
  
  if (overlappingSegments.length > 0) {
    return { errors: ['Segment overlaps with existing segment'] };
  }
  
  const newSegment: Segment = {
    id: crypto.randomUUID(),
    frameStart: snappedStart,
    frameEnd: snappedEnd,
    tags: [],
  };
  
  const newSegments = [...timeline.segments, newSegment];
  const newTimeline = { ...timeline, segments: newSegments };
  const newElements = pipe.elements.map(e => e.tag === 'timeline' ? newTimeline : e);
  
  const newPipes = session.pipes.map(p =>
    p.id === pipeId ? { ...p, elements: newElements } : p
  );
  
  sessions.set(sessionId, {
    ...session,
    pipes: newPipes,
    updatedAt: Date.now(),
  });
  
  await persistToBackend(sessionId);
  return { errors: [] };
}

export async function removeSegment(sessionId: string, pipeId: string, segmentId: string): Promise<{ errors: string[] }> {
  const session = sessions.get(sessionId);
  if (!session) return { errors: ['Session not found'] };
  
  const pipe = session.pipes.find(p => p.id === pipeId);
  if (!pipe) return { errors: ['Pipe not found'] };
  
  const timeline = pipe.elements.find(e => e.tag === 'timeline') as TimelineElement | undefined;
  if (!timeline) return { errors: ['Timeline not found'] };
  
  const newSegments = timeline.segments.filter(s => s.id !== segmentId);
  const newTimeline = { ...timeline, segments: newSegments };
  const newElements = pipe.elements.map(e => e.tag === 'timeline' ? newTimeline : e);
  
  const newPipes = session.pipes.map(p =>
    p.id === pipeId ? { ...p, elements: newElements } : p
  );
  
  sessions.set(sessionId, {
    ...session,
    pipes: newPipes,
    updatedAt: Date.now(),
  });
  
  await persistToBackend(sessionId);
  return { errors: [] };
}

export async function resizeSegment(
  sessionId: string, 
  pipeId: string, 
  segmentId: string, 
  frameStart: number, 
  frameEnd: number
): Promise<{ errors: string[] }> {
  const session = sessions.get(sessionId);
  if (!session) return { errors: ['Session not found'] };
  
  const pipe = session.pipes.find(p => p.id === pipeId);
  if (!pipe) return { errors: ['Pipe not found'] };
  
  const timeline = pipe.elements.find(e => e.tag === 'timeline') as TimelineElement | undefined;
  if (!timeline) return { errors: ['Timeline not found'] };
  
  // Snap frames
  const snappedStart = snapTo8(frameStart);
  const snappedEnd = snapTo8(frameEnd);
  
  if (snappedEnd - snappedStart < 8) {
    return { errors: ['Minimum segment span is 8 frames'] };
  }
  
  if (snappedStart < 0 || snappedEnd > pipe.lengthFrames) {
    return { errors: ['Segment out of bounds'] };
  }
  
  // Check for overlaps
  const otherSegments = timeline.segments.filter(s => s.id !== segmentId);
  const overlapping = otherSegments.some(s => 
    snappedStart < s.frameEnd && snappedEnd > s.frameStart
  );
  
  if (overlapping) {
    return { errors: ['Segment overlaps with existing segment'] };
  }
  
  const newSegments = timeline.segments.map(s =>
    s.id === segmentId ? { ...s, frameStart: snappedStart, frameEnd: snappedEnd } : s
  );
  
  const newTimeline = { ...timeline, segments: newSegments };
  const newElements = pipe.elements.map(e => e.tag === 'timeline' ? newTimeline : e);
  
  const newPipes = session.pipes.map(p =>
    p.id === pipeId ? { ...p, elements: newElements } : p
  );
  
  sessions.set(sessionId, {
    ...session,
    pipes: newPipes,
    updatedAt: Date.now(),
  });
  
  await persistToBackend(sessionId);
  return { errors: [] };
}

// ── Tag Element Actions ───────────────────────────────────────────────────────

export async function addTagElement(
  sessionId: string, 
  pipeId: string, 
  segmentId: string, 
  tagType: TagType,
  frameStart: number,
  frameEnd: number
): Promise<{ errors: string[] }> {
  const session = sessions.get(sessionId);
  if (!session) return { errors: ['Session not found'] };
  
  const pipe = session.pipes.find(p => p.id === pipeId);
  if (!pipe) return { errors: ['Pipe not found'] };
  
  const timeline = pipe.elements.find(e => e.tag === 'timeline') as TimelineElement | undefined;
  if (!timeline) return { errors: ['Timeline not found'] };
  
  const segment = timeline.segments.find(s => s.id === segmentId);
  if (!segment) return { errors: ['Segment not found'] };
  
  const spec = TAG_SPECIFICATIONS[tagType];
  if (!spec) return { errors: ['Invalid tag type'] };
  
  // Snap frames to segment bounds
  const snappedStart = Math.max(snapTo8(frameStart), segment.frameStart);
  const snappedEnd = Math.min(snapTo8(frameEnd), segment.frameEnd);
  
  if (snappedEnd - snappedStart < 8) {
    return { errors: ['Minimum tag span is 8 frames'] };
  }
  
  if (snappedStart < segment.frameStart || snappedEnd > segment.frameEnd) {
    return { errors: ['Tag must be within segment bounds'] };
  }
  
  // Check for same-tag overlap within segment
  const sameTagOverlaps = segment.tags.filter(t => 
    t.tag === tagType && snappedStart < t.frameEnd && snappedEnd > t.frameStart
  );
  
  if (sameTagOverlaps.length > 0) {
    return { errors: ['Tag overlaps with existing tag of same type'] };
  }
  
  const newTag: TagElement = {
    id: crypto.randomUUID(),
    tag: tagType,
    frameStart: snappedStart,
    frameEnd: snappedEnd,
    value: spec.min ?? 0,
    prompt: '',
    spec,
  };
  
  const newTags = [...segment.tags, newTag];
  const newSegment = { ...segment, tags: newTags };
  const newSegments = timeline.segments.map(s => s.id === segmentId ? newSegment : s);
  const newTimeline = { ...timeline, segments: newSegments };
  const newElements = pipe.elements.map(e => e.tag === 'timeline' ? newTimeline : e);
  
  const newPipes = session.pipes.map(p =>
    p.id === pipeId ? { ...p, elements: newElements } : p
  );
  
  sessions.set(sessionId, {
    ...session,
    pipes: newPipes,
    updatedAt: Date.now(),
  });
  
  await persistToBackend(sessionId);
  return { errors: [] };
}

export async function removeTagElement(
  sessionId: string, 
  pipeId: string, 
  segmentId: string, 
  tagId: string
): Promise<{ errors: string[] }> {
  const session = sessions.get(sessionId);
  if (!session) return { errors: ['Session not found'] };
  
  const pipe = session.pipes.find(p => p.id === pipeId);
  if (!pipe) return { errors: ['Pipe not found'] };
  
  const timeline = pipe.elements.find(e => e.tag === 'timeline') as TimelineElement | undefined;
  if (!timeline) return { errors: ['Timeline not found'] };
  
  const segment = timeline.segments.find(s => s.id === segmentId);
  if (!segment) return { errors: ['Segment not found'] };
  
  const newTags = segment.tags.filter(t => t.id !== tagId);
  const newSegment = { ...segment, tags: newTags };
  const newSegments = timeline.segments.map(s => s.id === segmentId ? newSegment : s);
  const newTimeline = { ...timeline, segments: newSegments };
  const newElements = pipe.elements.map(e => e.tag === 'timeline' ? newTimeline : e);
  
  const newPipes = session.pipes.map(p =>
    p.id === pipeId ? { ...p, elements: newElements } : p
  );
  
  sessions.set(sessionId, {
    ...session,
    pipes: newPipes,
    updatedAt: Date.now(),
  });
  
  await persistToBackend(sessionId);
  return { errors: [] };
}

export async function resizeTagElement(
  sessionId: string, 
  pipeId: string, 
  segmentId: string, 
  tagId: string,
  frameStart: number,
  frameEnd: number
): Promise<{ errors: string[] }> {
  const session = sessions.get(sessionId);
  if (!session) return { errors: ['Session not found'] };
  
  const pipe = session.pipes.find(p => p.id === pipeId);
  if (!pipe) return { errors: ['Pipe not found'] };
  
  const timeline = pipe.elements.find(e => e.tag === 'timeline') as TimelineElement | undefined;
  if (!timeline) return { errors: ['Timeline not found'] };
  
  const segment = timeline.segments.find(s => s.id === segmentId);
  if (!segment) return { errors: ['Segment not found'] };
  
  // Snap frames
  const snappedStart = snapTo8(frameStart);
  const snappedEnd = snapTo8(frameEnd);
  
  // Must stay within segment bounds
  if (snappedStart < segment.frameStart || snappedEnd > segment.frameEnd) {
    return { errors: ['Tag must remain within segment bounds'] };
  }
  
  if (snappedEnd - snappedStart < 8) {
    return { errors: ['Minimum tag span is 8 frames'] };
  }
  
  // Check for same-tag overlap
  const otherTags = segment.tags.filter(t => t.id !== tagId);
  const overlapping = otherTags.some(t => 
    t.tag === segment.tags.find(t => t.id === tagId)?.tag &&
    snappedStart < t.frameEnd && snappedEnd > t.frameStart
  );
  
  if (overlapping) {
    return { errors: ['Tag overlaps with existing tag of same type'] };
  }
  
  const newTags = segment.tags.map(t =>
    t.id === tagId ? { ...t, frameStart: snappedStart, frameEnd: snappedEnd } : t
  );
  
  const newSegment = { ...segment, tags: newTags };
  const newSegments = timeline.segments.map(s => s.id === segmentId ? newSegment : s);
  const newTimeline = { ...timeline, segments: newSegments };
  const newElements = pipe.elements.map(e => e.tag === 'timeline' ? newTimeline : e);
  
  const newPipes = session.pipes.map(p =>
    p.id === pipeId ? { ...p, elements: newElements } : p
  );
  
  sessions.set(sessionId, {
    ...session,
    pipes: newPipes,
    updatedAt: Date.now(),
  });
  
  await persistToBackend(sessionId);
  return { errors: [] };
}

export async function updateTagValue(
  sessionId: string, 
  pipeId: string, 
  segmentId: string, 
  tagId: string,
  value: number
): Promise<{ errors: string[] }> {
  const session = sessions.get(sessionId);
  if (!session) return { errors: ['Session not found'] };
  
  const pipe = session.pipes.find(p => p.id === pipeId);
  if (!pipe) return { errors: ['Pipe not found'] };
  
  const timeline = pipe.elements.find(e => e.tag === 'timeline') as TimelineElement | undefined;
  if (!timeline) return { errors: ['Timeline not found'] };
  
  const segment = timeline.segments.find(s => s.id === segmentId);
  if (!segment) return { errors: ['Segment not found'] };
  
  const newTags = segment.tags.map(t =>
    t.id === tagId ? { ...t, value } : t
  );
  
  const newSegment = { ...segment, tags: newTags };
  const newSegments = timeline.segments.map(s => s.id === segmentId ? newSegment : s);
  const newTimeline = { ...timeline, segments: newSegments };
  const newElements = pipe.elements.map(e => e.tag === 'timeline' ? newTimeline : e);
  
  const newPipes = session.pipes.map(p =>
    p.id === pipeId ? { ...p, elements: newElements } : p
  );
  
  sessions.set(sessionId, {
    ...session,
    pipes: newPipes,
    updatedAt: Date.now(),
  });
  
  await persistToBackend(sessionId);
  return { errors: [] };
}

export async function updateTagPrompt(
  sessionId: string, 
  pipeId: string, 
  segmentId: string, 
  tagId: string,
  prompt: string
): Promise<{ errors: string[] }> {
  const session = sessions.get(sessionId);
  if (!session) return { errors: ['Session not found'] };
  
  const pipe = session.pipes.find(p => p.id === pipeId);
  if (!pipe) return { errors: ['Pipe not found'] };
  
  const timeline = pipe.elements.find(e => e.tag === 'timeline') as TimelineElement | undefined;
  if (!timeline) return { errors: ['Timeline not found'] };
  
  const segment = timeline.segments.find(s => s.id === segmentId);
  if (!segment) return { errors: ['Segment not found'] };
  
  const newTags = segment.tags.map(t =>
    t.id === tagId ? { ...t, prompt } : t
  );
  
  const newSegment = { ...segment, tags: newTags };
  const newSegments = timeline.segments.map(s => s.id === segmentId ? newSegment : s);
  const newTimeline = { ...timeline, segments: newSegments };
  const newElements = pipe.elements.map(e => e.tag === 'timeline' ? newTimeline : e);
  
  const newPipes = session.pipes.map(p =>
    p.id === pipeId ? { ...p, elements: newElements } : p
  );
  
  sessions.set(sessionId, {
    ...session,
    pipes: newPipes,
    updatedAt: Date.now(),
  });
  
  await persistToBackend(sessionId);
  return { errors: [] };
}

// ── Keyframe Actions ──────────────────────────────────────────────────────────

export async function addKeyframe(sessionId: string, pipeId: string, type: 'url' | 'txt2img' | 'img2img', data: Partial<PipeKeyframe>): Promise<{ errors: string[] }> {
  const session = sessions.get(sessionId);
  if (!session) return { errors: ['Session not found'] };
  
  const pipe = session.pipes.find(p => p.id === pipeId);
  if (!pipe) return { errors: ['Pipe not found'] };
  
  if (pipe.keyframes.length >= 3) {
    return { errors: ['Maximum 3 keyframes per pipe'] };
  }
  
  // Calculate base frame
  let baseFrame = 0;
  if (pipe.keyframes.length > 0) {
    const lastFrame = Math.max(...pipe.keyframes.map(k => k.frame));
    baseFrame = snapTo8nPlus1(lastFrame + 60);
    if (baseFrame >= pipe.lengthFrames) {
      return { errors: ['No space for additional keyframe'] };
    }
  }
  
  const newKf: PipeKeyframe = {
    id: crypto.randomUUID(),
    frame: baseFrame,
    type,
    imageSrc: type === 'url' ? (data.imageSrc || undefined) : undefined,
    prompt: type === 'txt2img' ? (data.prompt || undefined) : undefined,
    referenceUrl: type === 'img2img' ? (data.referenceUrl || undefined) : undefined,
    status: 'pending',
  };
  
  // Validate keyframe source
  const validation = validateKeyframe(newKf);
  if (!validation.valid) {
    return { errors: validation.errors };
  }
  
  const newPipes = session.pipes.map(p =>
    p.id === pipeId ? { ...p, keyframes: [...p.keyframes, newKf] } : p
  );
  
  sessions.set(sessionId, {
    ...session,
    pipes: newPipes,
    updatedAt: Date.now(),
  });
  
  await persistToBackend(sessionId);
  return { errors: [] };
}

export async function removeKeyframe(sessionId: string, pipeId: string, keyframeId: string): Promise<{ errors: string[] }> {
  const session = sessions.get(sessionId);
  if (!session) return { errors: ['Session not found'] };
  
  const pipe = session.pipes.find(p => p.id === pipeId);
  if (!pipe) return { errors: ['Pipe not found'] };
  
  const newPipes = session.pipes.map(p =>
    p.id === pipeId ? { ...p, keyframes: p.keyframes.filter(k => k.id !== keyframeId) } : p
  );
  
  sessions.set(sessionId, {
    ...session,
    pipes: newPipes,
    updatedAt: Date.now(),
  });
  
  await persistToBackend(sessionId);
  return { errors: [] };
}

export async function moveKeyframe(sessionId: string, pipeId: string, keyframeId: string, delta: number): Promise<{ errors: string[] }> {
  const session = sessions.get(sessionId);
  if (!session) return { errors: ['Session not found'] };
  
  const pipe = session.pipes.find(p => p.id === pipeId);
  if (!pipe) return { errors: ['Pipe not found'] };
  
  const kf = pipe.keyframes.find(k => k.id === keyframeId);
  if (!kf) return { errors: ['Keyframe not found'] };

  // Keyframe positions are multiples of 8, NOT 8n+1
  const newFrame = snapTo8(kf.frame + delta);

  if (newFrame < 0 || newFrame >= pipe.lengthFrames) {
    return { errors: ['Keyframe moved out of bounds'] };
  }
  
  const newPipes = session.pipes.map(p =>
    p.id === pipeId ? {
      ...p,
      keyframes: p.keyframes.map(k =>
        k.id === keyframeId ? { ...k, frame: newFrame } : k
      )
    } : p
  );
  
  sessions.set(sessionId, {
    ...session,
    pipes: newPipes,
    updatedAt: Date.now(),
  });
  
  await persistToBackend(sessionId);
  return { errors: [] };
}

// ── Legacy Actions (for backward compatibility) ──────────────────────────────

export async function setGlobalPrompt(sessionId: string, pipeId: string, text: string): Promise<{ errors: string[] }> {
  const session = sessions.get(sessionId);
  if (!session) return { errors: ['Session not found'] };
  
  const pipe = session.pipes.find(p => p.id === pipeId);
  if (!pipe) return { errors: ['Pipe not found'] };
  
  // Create or update global element
  const existingGlobal = pipe.elements.find(e => e.tag === 'global_style') as GlobalElement | undefined;
  
  let newElements: PipeElement[];
  if (existingGlobal) {
    newElements = pipe.elements.map(e => 
      e.tag === 'global_style' ? { ...e, value: text } : e
    );
  } else {
    newElements = [...pipe.elements, {
      id: crypto.randomUUID(),
      tag: 'global_style',
      value: text,
      enabled: true,
    }];
  }
  
  const newPipes = session.pipes.map(p =>
    p.id === pipeId ? { ...p, elements: newElements } : p
  );
  
  sessions.set(sessionId, {
    ...session,
    pipes: newPipes,
    updatedAt: Date.now(),
  });
  
  await persistToBackend(sessionId);
  return { errors: [] };
}

export async function updateFPS(sessionId: string, fps: number): Promise<{ errors: string[] }> {
  const session = sessions.get(sessionId);
  if (!session) return { errors: [] };
  
  sessions.set(sessionId, {
    ...session,
    fps,
    updatedAt: Date.now(),
  });
  
  await persistToBackend(sessionId);
  return { errors: [] };
}

export async function updateResolution(sessionId: string, resolution: '480p' | '720p' | '1080p'): Promise<{ errors: string[] }> {
  const session = sessions.get(sessionId);
  if (!session) return { errors: [] };
  
  const maxFrames = getMaxFrames(resolution);
  
  // Clamp all pipe lengths
  const newPipes = session.pipes.map(p => ({
    ...p,
    lengthFrames: Math.min(p.lengthFrames, maxFrames),
  }));
  
  sessions.set(sessionId, {
    ...session,
    resolution,
    pipes: newPipes,
    updatedAt: Date.now(),
  });
  
  await persistToBackend(sessionId);
  return { errors: [] };
}

// ── Persistence ───────────────────────────────────────────────────────────────

async function persistToBackend(sessionId: string): Promise<void> {
  try {
    const session = sessions.get(sessionId);
    if (!session) return;
    
    await invoke('save_composer', { sessionId, sessionData: session });
    unsynced.delete(sessionId);
  } catch (e) {
    console.error('[ComposerStore] Failed to persist:', e);
    unsynced.add(sessionId);
  }
}

export async function loadSession(sessionId: string): Promise<{ errors: string[] }> {
  try {
    const result = await invoke('get_composer', { sessionId });
    // Backend returns pipes with prompt_nodes, not elements
    // Convert to our nested structure
    const backendPipes = (result as any).pipes || [];
    const migratedPipes = backendPipes.map((pipe: any) => convertBackendPipe(pipe));
    
    sessions.set(sessionId, {
      id: (result as any).id,
      name: (result as any).name,
      pipes: migratedPipes,
      fps: (result as any).settings?.fps || 24,
      resolution: (result as any).settings?.resolution || '720p',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      directoryPath: '',
      orientation: 'horizontal',
      totalGeneratedFrames: 0,
    });
    unsynced.delete(sessionId);
    return { errors: [] };
  } catch (e) {
    console.error('[ComposerStore] Failed to load session:', e);
    return { errors: ['Failed to load session'] };
  }
}

/**
 * Convert backend pipe format to frontend nested structure
 */
function convertBackendPipe(backendPipe: any): PipeRow {
  // Convert prompt_nodes to elements structure
  const elements: PipeElement[] = [];
  
  // Separate global and timeline nodes
  const globalNodes = backendPipe.prompt_nodes?.filter((n: any) => n.tag === 'GlobalStyle') || [];
  const timelineNodes = backendPipe.prompt_nodes?.filter((n: any) => n.tag !== 'GlobalStyle') || [];
  
  // Add global element if exists
  if (globalNodes.length > 0) {
    elements.push({
      id: crypto.randomUUID(),
      tag: 'global_style',
      value: globalNodes[0]?.value || '',
      enabled: true,
    });
  }
  
  // Group timeline nodes by segment (frame range)
  const segmentMap = new Map<string, any[]>();
  for (const node of timelineNodes) {
    const segmentKey = node.frame_start != null ? `${node.frame_start}-${node.frame_end}` : 'untimed';
    if (!segmentMap.has(segmentKey)) {
      segmentMap.set(segmentKey, []);
    }
    segmentMap.get(segmentKey)!.push(node);
  }
  
  // Create timeline element with segments
  const segments: Segment[] = [];
  for (const [key, nodes] of segmentMap) {
    if (key === 'untimed') continue;
    const [start, end] = key.split('-').map(Number);
    segments.push({
      id: crypto.randomUUID(),
      frameStart: start,
      frameEnd: end,
      tags: nodes.map(n => ({
        id: crypto.randomUUID(),
        tag: mapTagType(n.tag),
        frameStart: n.frame_start,
        frameEnd: n.frame_end,
        value: n.value ? parseInt(n.value) || 0 : 0,
        prompt: n.value && isNaN(parseInt(n.value)) ? n.value : undefined,
        spec: TAG_SPECIFICATIONS[mapTagType(n.tag)] || TAG_SPECIFICATIONS.scene,
      })),
    });
  }
  
  if (segments.length > 0) {
    elements.push({
      id: crypto.randomUUID(),
      tag: 'timeline',
      segments,
    });
  }
  
  // Convert keyframes
  const keyframes: PipeKeyframe[] = (backendPipe.keyframes || []).map((kf: any, idx: number) => ({
    id: crypto.randomUUID(),
    slotIndex: kf.slot_index,
    frame: idx * 40 + 1, // Approximate frame position
    imageSrc: kf.source_value,
    prompt: kf.description,
    type: kf.source_type as KeyframeType,
  }));
  
  return {
    id: backendPipe.id,
    lengthFrames: backendPipe.target_frames || 121,
    keyframes,
    qValue: backendPipe.num_inference_steps || 18,
    cValue: backendPipe.cfg_scale || 7,
    elements,
  };
}

function mapTagType(tag: string): TagType {
  const map: Record<string, TagType> = {
    'segment': 'scene',
    'movement': 'camera',
    'rotation': 'rotation',
    'focal_point': 'effect',
    'lighting': 'lighting',
    'exposure': 'effect',
    'lens_effect': 'effect',
    'global_style': 'scene',
  };
  return map[tag.toLowerCase()] || 'scene';
}

export function hydrateSessions(sessionsList: SessionData[]): void {
  for (const session of sessionsList) {
    // Migrate legacy structure if needed
    const migratedPipes = session.pipes.map(p => migratePipeToTwoLayer(p));
    sessions.set(session.id, { ...session, pipes: migratedPipes });
  }
  unsynced.clear();
}

export function isUnsynced(sessionId: string): boolean {
  return unsynced.has(sessionId);
}
