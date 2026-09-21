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
import type { SessionData, PipeRow, PipeLastGeneration, GenerationStatus, KeyframeType } from '$types';

// ── Service Implementations ──────────────────────────────────────────────────

import { PipeServiceImpl } from './pipes';
import { ElementServiceImpl } from './elements';
import { SegmentServiceImpl } from './segments';
import { TagServiceImpl } from './tags';
import { KeyframeServiceImpl } from './keyframes';
import { SessionServiceImpl } from './session-io';
import { MigrationServiceImpl } from './migrations';
import { SubjectReferenceServiceImpl } from './subjectRefs';
import { GenerationServiceImpl } from './generation';
import { normalizeSession } from './validators';
import { backfillGeneratedImages } from '$lib/generatedImageBackfill';

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

  // Resolve the store's session for an id. The composer UI renders from
  // Workspace's `selectedSession` (projects state), so any mutation can run
  // even before the session is materialized in the `sessions` Map (e.g. a
  // freshly created session in browser/E2E mode where the backend invoke is
  // unavailable). Instead of throwing "Session not found" — which crashed the
  // whole app via an unhandled rejection — fall back to a fresh blank session
  // that gets registered in the Map so all later lookups hit it.
  private resolveSession(sessionId: string, _name?: string): SessionData {
    let session = this.getSession(sessionId);
    if (!session) {
      session = {
        id: sessionId,
        name: _name || 'Session',
        pipes: [],
        fps: 24,
        resolution: '720p',
        orientation: 'horizontal',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        directoryPath: '',
        totalGeneratedFrames: 0,
      };
      sessions.set(sessionId, session);
    }
    return session;
  }

  private getService(sessionId: string, name?: string) {
    const session = this.resolveSession(sessionId, name);
    return {
      pipes: new PipeServiceImpl(session),
      elements: new ElementServiceImpl(session),
      segments: new SegmentServiceImpl(session, (pid: string) => session.pipes.find(p => p.id === pid)),
      tags: new TagServiceImpl(session, (pid: string) => session.pipes.find(p => p.id === pid)),
      keyframes: new KeyframeServiceImpl(session, (pid: string) => session.pipes.find(p => p.id === pid)),
      session: this.services.session,
      migration: this.services.migration,
      subjectRefs: new SubjectReferenceServiceImpl(session),
      generation: new GenerationServiceImpl(session, (pid: string) => session.pipes.find(p => p.id === pid)),
    };
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async addPipe(sessionId: string): Promise<ServiceResult> {
    const session = this.resolveSession(sessionId);

    const pipes = new PipeServiceImpl(session);
    const result = await pipes.add(sessionId);
    if (result.errors.length === 0) this.notifyUpdate(sessionId);
    return result;
  }

  async removePipe(sessionId: string, pipeId: string): Promise<ServiceResult> {
    const session = this.resolveSession(sessionId);

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

  async setMediaMode(sessionId: string, pipeId: string, mode: 'keyframes' | 'reference'): Promise<ServiceResult> {
    const s = this.getService(sessionId);
    const result = await s.pipes.setMediaMode(sessionId, pipeId, mode);
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

  async updateGlobalPrompt(sessionId: string, pipeId: string, globalId: string, prompt: string): Promise<ServiceResult> {
    const s = this.getService(sessionId);
    const result = await s.elements.updateGlobalPrompt(sessionId, pipeId, globalId, prompt);
    if (result.errors.length === 0) this.notifyUpdate(sessionId);
    return result;
  }

  // Sound element operations
  async addSoundElement(sessionId: string, pipeId: string, frameStart: number, frameEnd: number): Promise<ServiceResult> {
    const s = this.getService(sessionId);
    const result = await s.elements.addSound(sessionId, pipeId, frameStart, frameEnd);
    if (result.errors.length === 0) this.notifyUpdate(sessionId);
    return result;
  }

  async updateSoundRange(sessionId: string, pipeId: string, soundId: string, frameStart: number, frameEnd: number): Promise<ServiceResult> {
    const s = this.getService(sessionId);
    const result = await s.elements.updateSoundRange(sessionId, pipeId, soundId, frameStart, frameEnd);
    if (result.errors.length === 0) this.notifyUpdate(sessionId);
    return result;
  }

  async toggleSoundElement(sessionId: string, pipeId: string, soundId: string): Promise<ServiceResult> {
    const s = this.getService(sessionId);
    const result = await s.elements.toggleSound(sessionId, pipeId, soundId);
    if (result.errors.length === 0) this.notifyUpdate(sessionId);
    return result;
  }

  async removeSoundElement(sessionId: string, pipeId: string, soundId: string): Promise<ServiceResult> {
    const s = this.getService(sessionId);
    const result = await s.elements.removeSound(sessionId, pipeId, soundId);
    if (result.errors.length === 0) this.notifyUpdate(sessionId);
    return result;
  }

  async updateSoundPrompt(sessionId: string, pipeId: string, soundId: string, prompt: string): Promise<ServiceResult> {
    const s = this.getService(sessionId);
    const result = await s.elements.updateSoundPrompt(sessionId, pipeId, soundId, prompt);
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
    const session = this.resolveSession(sessionId);

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
  async addKeyframe(sessionId: string, pipeId: string, slotIndex: number, frame: number, type: 'url' | 'txt2img' | 'img2img', value: string, referenceUrl?: string): Promise<ServiceResult> {
    const s = this.getService(sessionId);
    const result = await s.keyframes.add(sessionId, pipeId, slotIndex, frame, type, value, referenceUrl);
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
  async addSubjectRef(
    sessionId: string,
    pipeId: string,
    imageUrl: string,
    useFrames: boolean,
    frameStart?: number,
    frameEnd?: number,
    type?: KeyframeType,
    prompt?: string,
  ): Promise<ServiceResult> {
    const s = this.getService(sessionId);
    const result = await s.subjectRefs.add(sessionId, pipeId, imageUrl, useFrames, frameStart, frameEnd, type, prompt);
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

  /**
   * Atomic subject-reference edit: one logical mutation (URL + frame range +
   * useFrames) with a single notifyUpdate(). Modal closes only on success.
   */
  async updateSubjectRef(
    sessionId: string,
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
    const s = this.getService(sessionId);
    const result = await s.subjectRefs.update(sessionId, pipeId, refId, update);
    if (result.errors.length === 0) this.notifyUpdate(sessionId);
    return result;
  }

  // Generation result operations (task terminal → pipe artifact + ref statuses)
  async attachLastGeneration(sessionId: string, pipeId: string, gen: PipeLastGeneration): Promise<ServiceResult> {
    const s = this.getService(sessionId);
    const result = await s.generation.attachLastGeneration(sessionId, pipeId, gen);
    if (result.errors.length === 0) this.notifyUpdate(sessionId);
    return result;
  }

  async markRefStatus(
    sessionId: string,
    pipeId: string,
    kind: 'keyframe' | 'subject',
    refId: string,
    status: GenerationStatus,
  ): Promise<ServiceResult> {
    const s = this.getService(sessionId);
    const result = await s.generation.markRefStatus(sessionId, pipeId, kind, refId, status);
    if (result.errors.length === 0) this.notifyUpdate(sessionId);
    return result;
  }

  /** Link a generated image path back to its keyframe/subject so the chip
   *  shows a thumbnail. Persists via the normal notifyUpdate → saveSession
   *  path, so it survives app restarts. */
  async attachGeneratedImage(
    sessionId: string,
    pipeId: string,
    kind: 'keyframe' | 'subject',
    refId: string,
    localPath: string,
    remoteUrl?: string,
  ): Promise<ServiceResult> {
    const s = this.getService(sessionId);
    const result = await s.generation.attachGeneratedImage(sessionId, pipeId, kind, refId, localPath, remoteUrl);
    if (result.errors.length === 0) this.notifyUpdate(sessionId);
    return result;
  }

  /** Queue a piece for regeneration on the next run (see
   *  GenerationService.queueRefRegen). Non-destructive: the settled preview
   *  data is kept; the registry's Ready-skip is overridden while queued. */
  async queueRefRegen(
    sessionId: string,
    pipeId: string,
    kind: 'keyframe' | 'subject',
    refId: string,
  ): Promise<ServiceResult> {
    const s = this.getService(sessionId);
    const result = await s.generation.queueRefRegen(sessionId, pipeId, kind, refId);
    if (result.errors.length === 0) this.notifyUpdate(sessionId);
    return result;
  }

  // Session operations.
  // Canonical mutation path: store state mutates, then notifyUpdate() marks
  // the session unsynced and fires the Workspace onUpdate callback, which
  // re-syncs the UI view and debounces saveSession() → SQLite. Settings
  // never mutate Workspace's selectedSession directly, so a later composer
  // mutation can never overwrite them with stale store values.
  async updateFPS(sessionId: string, fps: number): Promise<ServiceResult> {
    const session = this.resolveSession(sessionId);
    session.fps = fps;
    this.notifyUpdate(sessionId);
    return { errors: [] };
  }

  async updateResolution(sessionId: string, resolution: string): Promise<ServiceResult> {
    const session = this.resolveSession(sessionId);
    session.resolution = resolution as any;
    this.notifyUpdate(sessionId);
    return { errors: [] };
  }

  async updateOrientation(sessionId: string, orientation: string): Promise<ServiceResult> {
    const session = this.resolveSession(sessionId);
    if (orientation !== 'horizontal' && orientation !== 'vertical') {
      return { errors: ['Invalid orientation: must be horizontal or vertical'] };
    }
    session.orientation = orientation as any;
    this.notifyUpdate(sessionId);
    return { errors: [] };
  }

  async loadSession(sessionId: string): Promise<ServiceResult & { session?: SessionData }> {
    try {
      // Load via get_composer (the sessions table has no full-session command);
      // session-io maps the backend payload into frontend PipeRow shape.
      const result = await this.services.session.load(sessionId);
      if (result.session) {
        // Session-level fields + every pipe, so the store copy is always
        // render-safe regardless of the on-disk shape.
        normalizeSession(result.session);
        // One-time: link already-generated image artifacts back onto their
        // keyframes/subjects from the media-tree log (runs before the first
        // render so the chips show thumbnails on the next app run).
        const backfilled = await backfillGeneratedImages(result.session);
        sessions.set(sessionId, result.session);
        if (backfilled) {
          // Recovery filled previewLocalPath/previewRemoteUrl that the DB row
          // doesn't have yet — persist it immediately so a later save (or the
          // next app start) doesn't overwrite the recovery with stale data.
          unsynced.add(sessionId);
          void this.saveSession(sessionId);
        } else {
          unsynced.delete(sessionId);
        }
      }
      return result;
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
        input: {
          session_id: session.id,
          name: session.name,
          pipes: session.pipes.map((pipe: any) => ({
            id: pipe.id,
            name: pipe.name,
            lengthFrames: pipe.lengthFrames,
            qValue: pipe.qValue,
            cValue: pipe.cValue,
            mediaMode: pipe.mediaMode ?? 'keyframes',
            orderIndex: pipe.orderIndex,
            keyframes: pipe.keyframes,
            subjectReferences: (pipe.subjectReferences ?? []).map((ref: any) => ({
              id: ref.id,
              imageUrl: ref.imageUrl,
              useFrames: ref.useFrames ?? false,
              frameStart: ref.frameStart,
              frameEnd: ref.frameEnd,
              visible: ref.visible !== false,
              type: ref.type ?? 'url',
              prompt: ref.prompt,
              previewRemoteUrl: ref.previewRemoteUrl ?? undefined,
              previewLocalPath: ref.previewLocalPath ?? undefined,
              status: ref.status ?? 'pending',
              forceRegen: ref.forceRegen === true,
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
              // Global / Sound element - use frame range format
              return {
                id: el.id,
                tag: el.tag,
                frameStart: el.frameStart ?? 0,
                frameEnd: el.frameEnd ?? 0,
                enabled: el.enabled,
                prompt: el.prompt,
              };
            }),
            lastGeneration: pipe.lastGeneration ?? null,
          })),
          fps: session.fps,
          resolution: session.resolution,
          orientation: session.orientation,
          totalGeneratedFrames: session.totalGeneratedFrames,
        },
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
      // Normalize session-level fields (fps/resolution/orientation) AND pipes
      // so legacy/localStorage session shapes are always valid before they
      // enter the store (prevents empty selects and undefined-field crashes
      // on the render path when the user re-enters the app).
      normalizeSession(session as SessionData);
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
export const setMediaMode = composerStore.setMediaMode.bind(composerStore);
export const addGlobalElement = composerStore.addGlobalElement.bind(composerStore);
export const updateGlobalRange = composerStore.updateGlobalRange.bind(composerStore);
export const toggleGlobalElement = composerStore.toggleGlobalElement.bind(composerStore);
export const removeGlobalElement = composerStore.removeGlobalElement.bind(composerStore);
export const updateGlobalPrompt = composerStore.updateGlobalPrompt.bind(composerStore);
export const addSoundElement = composerStore.addSoundElement.bind(composerStore);
export const updateSoundRange = composerStore.updateSoundRange.bind(composerStore);
export const toggleSoundElement = composerStore.toggleSoundElement.bind(composerStore);
export const removeSoundElement = composerStore.removeSoundElement.bind(composerStore);
export const updateSoundPrompt = composerStore.updateSoundPrompt.bind(composerStore);
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
export const updateSubjectRef = composerStore.updateSubjectRef.bind(composerStore);
export const attachLastGeneration = composerStore.attachLastGeneration.bind(composerStore);
export const markRefStatus = composerStore.markRefStatus.bind(composerStore);
export const attachGeneratedImage = composerStore.attachGeneratedImage.bind(composerStore);
export const queueRefRegen = composerStore.queueRefRegen.bind(composerStore);
export const updateFPS = composerStore.updateFPS.bind(composerStore);
export const updateResolution = composerStore.updateResolution.bind(composerStore);
export const updateOrientation = composerStore.updateOrientation.bind(composerStore);
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
