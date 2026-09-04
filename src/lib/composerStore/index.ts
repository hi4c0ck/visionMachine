// Composer Store - Thin Orchestrator
// Holds shared state, wires services together, exposes public API

import { invoke } from '@tauri-apps/api/core';
import type {
  ComposerStore,
  ServiceResult,
  PipeService,
  ElementService,
  SegmentService,
  TagService,
  KeyframeService,
  SessionService,
  MigrationService,
  SubjectReferenceService,
} from './interfaces';
import type { SessionData, PipeRow } from '$types';

// ── Service Implementations ──────────────────────────────────────────────────

import { PipeServiceImpl } from './pipes';
import { ElementServiceImpl } from './elements';
import { SegmentServiceImpl } from './segments';
import { TagServiceImpl } from './tags';
import { KeyframeServiceImpl } from './keyframes';
import { SessionServiceImpl } from './session-io';
import { MigrationServiceImpl } from './migrations';
import { SubjectReferenceServiceImpl } from './subjectRefs';

// ── Shared State ──────────────────────────────────────────────────────────────

export const sessions = new Map<string, SessionData>();
export const unsynced = new Set<string>();

let onUpdateCallback: ((sessionId: string) => void) | null = null;

// ── Store Implementation ──────────────────────────────────────────────────────

class ComposerStoreImpl implements ComposerStore {
  sessions = sessions;
  unsynced = unsynced;

  private services: {
    pipes: PipeService;
    elements: ElementService;
    segments: SegmentService;
    tags: TagService;
    keyframes: KeyframeService;
    session: SessionService;
    migration: MigrationService;
    subjectRefs: SubjectReferenceService;
  };

  constructor() {
    this.services = {
      pipes: new PipeServiceImpl({} as SessionData),
      elements: new ElementServiceImpl({} as SessionData),
      segments: new SegmentServiceImpl({} as SessionData, () => undefined),
      tags: new TagServiceImpl({} as SessionData, () => undefined),
      keyframes: new KeyframeServiceImpl({} as SessionData, () => undefined),
      session: new SessionServiceImpl(),
      migration: new MigrationServiceImpl(),
      subjectRefs: new SubjectReferenceServiceImpl({} as SessionData),
    };
  }

  setOnUpdate(callback: (sessionId: string) => void): void {
    onUpdateCallback = callback;
  }

  // ── Private Helpers ───────────────────────────────────────────────────────

  private getSession(sessionId: string): SessionData | undefined {
    return sessions.get(sessionId);
  }

  private notifyUpdate(sessionId: string): void {
    unsynced.add(sessionId);
    if (onUpdateCallback) {
      onUpdateCallback(sessionId);
    }
  }

  private getService(sessionId: string) {
    const session = this.getSession(sessionId);
    if (!session) throw new Error('Session not found');

    return {
      pipes: new PipeServiceImpl(session),
      elements: new ElementServiceImpl(session),
      segments: new SegmentServiceImpl(session, (pid: string) => session.pipes.find(p => p.id === pid)),
      tags: new TagServiceImpl(session, (pid: string) => session.pipes.find(p => p.id === pid)),
      keyframes: new KeyframeServiceImpl(session, (pid: string) => session.pipes.find(p => p.id === pid)),
      session: this.services.session,
      migration: this.services.migration,
      subjectRefs: new SubjectReferenceServiceImpl(session),
    };
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async addPipe(sessionId: string): Promise<ServiceResult> {
    const session = sessions.get(sessionId);
    if (!session) return { errors: ['Session not found'] };

    const pipes = new PipeServiceImpl(session);
    const result = await pipes.add(sessionId);
    if (result.errors.length === 0) this.notifyUpdate(sessionId);
    return result;
  }

  async removePipe(sessionId: string, pipeId: string): Promise<ServiceResult> {
    const session = sessions.get(sessionId);
    if (!session) return { errors: ['Session not found'] };

    const pipes = new PipeServiceImpl(session);
    const result = await pipes.remove(sessionId, pipeId);
    if (result.errors.length === 0) this.notifyUpdate(sessionId);
    return result;
  }

  async movePipe(sessionId: string, pipeId: string, newOrderIndex: number): Promise<ServiceResult> {
    const s = this.getService(sessionId);
    const result = await s.pipes.move(sessionId, pipeId, newOrderIndex);
    if (result.errors.length === 0) this.notifyUpdate(sessionId);
    return result;
  }

  async duplicatePipe(sessionId: string, pipeId: string): Promise<ServiceResult> {
    const s = this.getService(sessionId);
    const result = await s.pipes.duplicate(sessionId, pipeId);
    if (result.errors.length === 0) this.notifyUpdate(sessionId);
    return result;
  }

  async updateQ(sessionId: string, pipeId: string, qValue: number): Promise<ServiceResult> {
    const s = this.getService(sessionId);
    const result = await s.pipes.updateQ(sessionId, pipeId, qValue);
    if (result.errors.length === 0) this.notifyUpdate(sessionId);
    return result;
  }

  async updateC(sessionId: string, pipeId: string, cValue: number): Promise<ServiceResult> {
    const s = this.getService(sessionId);
    const result = await s.pipes.updateC(sessionId, pipeId, cValue);
    if (result.errors.length === 0) this.notifyUpdate(sessionId);
    return result;
  }

  async setPipeLength(sessionId: string, pipeId: string, frames: number): Promise<ServiceResult> {
    const s = this.getService(sessionId);
    const result = await s.pipes.setLength(sessionId, pipeId, frames);
    if (result.errors.length === 0) this.notifyUpdate(sessionId);
    return result;
  }

  // Global element operations
  async addGlobalElement(sessionId: string, pipeId: string, frameStart: number, frameEnd: number): Promise<ServiceResult> {
    const s = this.getService(sessionId);
    const result = await s.elements.addGlobal(sessionId, pipeId, frameStart, frameEnd);
    if (result.errors.length === 0) this.notifyUpdate(sessionId);
    return result;
  }

  async updateGlobalRange(sessionId: string, pipeId: string, globalId: string, frameStart: number, frameEnd: number): Promise<ServiceResult> {
    const s = this.getService(sessionId);
    const result = await s.elements.updateGlobalRange(sessionId, pipeId, globalId, frameStart, frameEnd);
    if (result.errors.length === 0) this.notifyUpdate(sessionId);
    return result;
  }

  async toggleGlobalElement(sessionId: string, pipeId: string, globalId: string): Promise<ServiceResult> {
    const s = this.getService(sessionId);
    const result = await s.elements.toggleGlobal(sessionId, pipeId, globalId);
    if (result.errors.length === 0) this.notifyUpdate(sessionId);
    return result;
  }

  async removeGlobalElement(sessionId: string, pipeId: string, globalId: string): Promise<ServiceResult> {
    const s = this.getService(sessionId);
    const result = await s.elements.removeGlobal(sessionId, pipeId, globalId);
    if (result.errors.length === 0) this.notifyUpdate(sessionId);
    return result;
  }

  async addTimelineElement(sessionId: string, pipeId: string): Promise<ServiceResult> {
    const s = this.getService(sessionId);
    const result = await s.elements.addTimeline(sessionId, pipeId);
    if (result.errors.length === 0) this.notifyUpdate(sessionId);
    return result;
  }

  // Segment operations
  async addSegment(sessionId: string, pipeId: string, frameStart: number, frameEnd: number): Promise<ServiceResult> {
    const session = sessions.get(sessionId);
    if (!session) return { errors: ['Session not found'] };

    const segments = new SegmentServiceImpl(session, (pid: string) => session.pipes.find(p => p.id === pid));
    const result = await segments.add(sessionId, pipeId, frameStart, frameEnd);
    if (result.errors.length === 0) this.notifyUpdate(sessionId);
    return result;
  }

  async removeSegment(sessionId: string, pipeId: string, segmentId: string): Promise<ServiceResult> {
    const s = this.getService(sessionId);
    const result = await s.segments.remove(sessionId, pipeId, segmentId);
    if (result.errors.length === 0) this.notifyUpdate(sessionId);
    return result;
  }

  async resizeSegment(sessionId: string, pipeId: string, segmentId: string, newStart: number, newEnd: number): Promise<ServiceResult> {
    const s = this.getService(sessionId);
    const result = await s.segments.resize(sessionId, pipeId, segmentId, newStart, newEnd);
    if (result.errors.length === 0) this.notifyUpdate(sessionId);
    return result;
  }

  // Tag operations
  async addTagElement(sessionId: string, pipeId: string, segmentId: string, tagType: string): Promise<ServiceResult> {
    const s = this.getService(sessionId);
    const result = await s.tags.add(sessionId, pipeId, segmentId, tagType as any);
    if (result.errors.length === 0) this.notifyUpdate(sessionId);
    return result;
  }

  async removeTagElement(sessionId: string, pipeId: string, segmentId: string, tagId: string): Promise<ServiceResult> {
    const s = this.getService(sessionId);
    const result = await s.tags.remove(sessionId, pipeId, segmentId, tagId);
    if (result.errors.length === 0) this.notifyUpdate(sessionId);
    return result;
  }

  async resizeTagElement(sessionId: string, pipeId: string, segmentId: string, tagId: string, newStart: number, newEnd: number): Promise<ServiceResult> {
    const s = this.getService(sessionId);
    const result = await s.tags.resize(sessionId, pipeId, segmentId, tagId, newStart, newEnd);
    if (result.errors.length === 0) this.notifyUpdate(sessionId);
    return result;
  }

  async updateTagValue(sessionId: string, pipeId: string, segmentId: string, tagId: string, value: number): Promise<ServiceResult> {
    const s = this.getService(sessionId);
    const result = await s.tags.updateValue(sessionId, pipeId, segmentId, tagId, value);
    if (result.errors.length === 0) this.notifyUpdate(sessionId);
    return result;
  }

  async updateTagPrompt(sessionId: string, pipeId: string, segmentId: string, tagId: string, prompt: string): Promise<ServiceResult> {
    const s = this.getService(sessionId);
    const result = await s.tags.updatePrompt(sessionId, pipeId, segmentId, tagId, prompt);
    if (result.errors.length === 0) this.notifyUpdate(sessionId);
    return result;
  }

  // Keyframe operations
  async addKeyframe(sessionId: string, pipeId: string, slotIndex: number, frame: number, type: 'url' | 'txt2img' | 'img2img', value: string): Promise<ServiceResult> {
    const s = this.getService(sessionId);
    const result = await s.keyframes.add(sessionId, pipeId, slotIndex, frame, type, value);
    if (result.errors.length === 0) this.notifyUpdate(sessionId);
    return result;
  }

  async removeKeyframe(sessionId: string, pipeId: string, keyframeId: string): Promise<ServiceResult> {
    const s = this.getService(sessionId);
    const result = await s.keyframes.remove(sessionId, pipeId, keyframeId);
    if (result.errors.length === 0) this.notifyUpdate(sessionId);
    return result;
  }

  async moveKeyframe(sessionId: string, pipeId: string, keyframeId: string, newFrame: number): Promise<ServiceResult> {
    const s = this.getService(sessionId);
    const result = await s.keyframes.move(sessionId, pipeId, keyframeId, newFrame);
    if (result.errors.length === 0) this.notifyUpdate(sessionId);
    return result;
  }

  // Subject reference operations
  async addSubjectRef(sessionId: string, pipeId: string, imageUrl: string, useFrames: boolean, frameStart?: number, frameEnd?: number): Promise<ServiceResult> {
    const s = this.getService(sessionId);
    const result = await s.subjectRefs.add(sessionId, pipeId, imageUrl, useFrames, frameStart, frameEnd);
    if (result.errors.length === 0) this.notifyUpdate(sessionId);
    return result;
  }

  async updateSubjectRefRange(sessionId: string, pipeId: string, refId: string, frameStart: number, frameEnd: number): Promise<ServiceResult> {
    const s = this.getService(sessionId);
    const result = await s.subjectRefs.updateRange(sessionId, pipeId, refId, frameStart, frameEnd);
    if (result.errors.length === 0) this.notifyUpdate(sessionId);
    return result;
  }

  async removeSubjectRef(sessionId: string, pipeId: string, refId: string): Promise<ServiceResult> {
    const s = this.getService(sessionId);
    const result = await s.subjectRefs.remove(sessionId, pipeId, refId);
    if (result.errors.length === 0) this.notifyUpdate(sessionId);
    return result;
  }

  async toggleSubjectRef(sessionId: string, pipeId: string, refId: string): Promise<ServiceResult> {
    const s = this.getService(sessionId);
    const result = await s.subjectRefs.toggle(sessionId, pipeId, refId);
    if (result.errors.length === 0) this.notifyUpdate(sessionId);
    return result;
  }

  async updateSubjectRefUrl(sessionId: string, pipeId: string, refId: string, imageUrl: string): Promise<ServiceResult> {
    const s = this.getService(sessionId);
    const result = await s.subjectRefs.updateImageUrl(sessionId, pipeId, refId, imageUrl);
    if (result.errors.length === 0) this.notifyUpdate(sessionId);
    return result;
  }

  async updateSubjectRefUseFrames(sessionId: string, pipeId: string, refId: string, useFrames: boolean): Promise<ServiceResult> {
    const s = this.getService(sessionId);
    const result = await s.subjectRefs.updateUseFrames(sessionId, pipeId, refId, useFrames);
    if (result.errors.length === 0) this.notifyUpdate(sessionId);
    return result;
  }

  // Session operations
  async updateFPS(sessionId: string, fps: number): Promise<ServiceResult> {
    const session = sessions.get(sessionId);
    if (!session) return { errors: ['Session not found'] };
    session.fps = fps;
    unsynced.delete(sessionId);
    return { errors: [] };
  }

  async updateResolution(sessionId: string, resolution: string): Promise<ServiceResult> {
    const session = sessions.get(sessionId);
    if (!session) return { errors: ['Session not found'] };
    session.resolution = resolution as any;
    unsynced.delete(sessionId);
    return { errors: [] };
  }

  async loadSession(sessionId: string): Promise<ServiceResult & { session?: SessionData }> {
    try {
      const result = await invoke('get_session', { sessionId });
      const session = result as SessionData;
      if (session) {
        sessions.set(sessionId, session);
        unsynced.delete(sessionId);
      }
      return { errors: [], session };
    } catch (e) {
      console.error('[ComposerStore] Failed to load session:', e);
      return { errors: ['Failed to load session'] };
    }
  }

  async saveSession(sessionId: string): Promise<ServiceResult> {
    const session = sessions.get(sessionId);
    if (!session) return { errors: ['Session not found'] };

    try {
      await invoke('save_composer', {
        input: JSON.stringify({
          session_id: session.id,
          name: session.name,
          pipes: session.pipes.map((pipe: any) => ({
            id: pipe.id,
            name: pipe.name,
            lengthFrames: pipe.lengthFrames,
            qValue: pipe.qValue,
            cValue: pipe.cValue,
            orderIndex: pipe.orderIndex,
            keyframes: pipe.keyframes,
            subjectReferences: (pipe.subjectReferences ?? []).map((ref: any) => ({
              id: ref.id,
              imageUrl: ref.imageUrl,
              useFrames: ref.useFrames ?? false,
              frameStart: ref.frameStart,
              frameEnd: ref.frameEnd,
              visible: ref.visible !== false,
            })),
            elements: pipe.elements.map((el: any) => {
              if ('segments' in el) {
                return {
                  id: el.id,
                  tag: el.tag,
                  segments: el.segments.map((s: any) => ({
                    id: s.id,
                    frameStart: s.frameStart,
                    frameEnd: s.frameEnd,
                    tags: s.tags.map((t: any) => ({
                      id: t.id,
                      tag: t.tag,
                      frameStart: t.frameStart,
                      frameEnd: t.frameEnd,
                      value: t.value,
                      prompt: t.prompt,
                      spec: t.spec,
                    })),
                  })),
                };
              }
              // Global element - use frame range format
              return {
                id: el.id,
                tag: el.tag,
                frameStart: el.frameStart ?? 0,
                frameEnd: el.frameEnd ?? el.value ? 240 : 0,
                enabled: el.enabled,
              };
            }),
          })),
          fps: session.fps,
          resolution: session.resolution,
          orientation: session.orientation,
          totalGeneratedFrames: session.totalGeneratedFrames,
        }),
      });
      unsynced.delete(sessionId);
      return { errors: [] };
    } catch (e) {
      console.error('[ComposerStore] Failed to save session:', e);
      return { errors: ['Failed to save session'] };
    }
  }

  async hydrateSessions(sessionList: any[]): Promise<void> {
    for (const session of sessionList) {
      sessions.set(session.id, session);
    }
  }

  migratePipe(pipe: any): any {
    return this.services.migration.migratePipe(pipe);
  }
}

// ── Singleton Instance ────────────────────────────────────────────────────────

export const composerStore = new ComposerStoreImpl();

// ── Re-export for backward compatibility ──────────────────────────────────────

export const setOnUpdate = composerStore.setOnUpdate.bind(composerStore);
export const addPipe = composerStore.addPipe.bind(composerStore);
export const removePipe = composerStore.removePipe.bind(composerStore);
export const movePipe = composerStore.movePipe.bind(composerStore);
export const duplicatePipe = composerStore.duplicatePipe.bind(composerStore);
export const updateQ = composerStore.updateQ.bind(composerStore);
export const updateC = composerStore.updateC.bind(composerStore);
export const setPipeLength = composerStore.setPipeLength.bind(composerStore);
export const addGlobalElement = composerStore.addGlobalElement.bind(composerStore);
export const updateGlobalRange = composerStore.updateGlobalRange.bind(composerStore);
export const toggleGlobalElement = composerStore.toggleGlobalElement.bind(composerStore);
export const removeGlobalElement = composerStore.removeGlobalElement.bind(composerStore);
export const addTimelineElement = composerStore.addTimelineElement.bind(composerStore);
export const addSegment = composerStore.addSegment.bind(composerStore);
export const removeSegment = composerStore.removeSegment.bind(composerStore);
export const resizeSegment = composerStore.resizeSegment.bind(composerStore);
export const addTagElement = composerStore.addTagElement.bind(composerStore);
export const removeTagElement = composerStore.removeTagElement.bind(composerStore);
export const resizeTagElement = composerStore.resizeTagElement.bind(composerStore);
export const updateTagValue = composerStore.updateTagValue.bind(composerStore);
export const updateTagPrompt = composerStore.updateTagPrompt.bind(composerStore);
export const addKeyframe = composerStore.addKeyframe.bind(composerStore);
export const removeKeyframe = composerStore.removeKeyframe.bind(composerStore);
export const moveKeyframe = composerStore.moveKeyframe.bind(composerStore);
export const addSubjectRef = composerStore.addSubjectRef.bind(composerStore);
export const updateSubjectRefRange = composerStore.updateSubjectRefRange.bind(composerStore);
export const removeSubjectRef = composerStore.removeSubjectRef.bind(composerStore);
export const toggleSubjectRef = composerStore.toggleSubjectRef.bind(composerStore);
export const updateSubjectRefUrl = composerStore.updateSubjectRefUrl.bind(composerStore);
export const updateSubjectRefUseFrames = composerStore.updateSubjectRefUseFrames.bind(composerStore);
export const updateFPS = composerStore.updateFPS.bind(composerStore);
export const updateResolution = composerStore.updateResolution.bind(composerStore);
export const loadSession = composerStore.loadSession.bind(composerStore);
export const saveSession = composerStore.saveSession.bind(composerStore);
export const hydrateSessions = composerStore.hydrateSessions.bind(composerStore);
export const migratePipe = composerStore.migratePipe.bind(composerStore);

// Export types
export type {
  ComposerStore,
  PipeService,
  ElementService,
  SegmentService,
  TagService,
  KeyframeService,
  SessionService,
  MigrationService,
  SubjectReferenceService,
  ServiceResult,
} from './interfaces';
