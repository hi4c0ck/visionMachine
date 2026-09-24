// Session I/O Service Implementation
// Handles loading and saving composer data from/to backend

import { invoke } from '@tauri-apps/api/core';
import type { SessionService, ServiceResult } from './interfaces';
import type { SessionData, PipeRow, ResolutionPreset } from '$types';
import { TAG_SPECIFICATIONS } from '$types';
import { normalizePipe } from './validators';

export class SessionServiceImpl implements SessionService {
  async load(sessionId: string): Promise<ServiceResult & { session?: SessionData }> {
    try {
      // get_composer takes session_id directly (Tauri camelCase arg matching)
      const result = await invoke('get_composer', { sessionId });
      const backendData = result as any;

      const rawPipes: PipeRow[] = this.mapBackendPipes(backendData.pipes || []);
      // Normalize every loaded pipe so legacy / stale on-disk shapes
      // (missing arrays, out-of-bounds frames, null ids) become valid
      // PipeRows instead of crash sources later in the UI layer.
      const pipes = rawPipes.map((p) => normalizePipe(p));

      const session: SessionData = {
        id: backendData.id || sessionId,
        name: backendData.name || 'Session',
        pipes,
        fps: backendData.fps || 24,
        resolution: (backendData.resolution || '720p') as ResolutionPreset,
        orientation: backendData.orientation || 'horizontal',
        createdAt: backendData.createdAt || Date.now(),
        updatedAt: backendData.updatedAt || Date.now(),
        directoryPath: backendData.directoryPath || '',
        totalGeneratedFrames: backendData.totalGeneratedFrames || 0,
      };

      return { session, errors: [] };
    } catch (e) {
      console.error('[SessionService] Failed to load session:', e);
      return { errors: ['Failed to load session'] };
    }
  }

  async save(sessionId: string): Promise<ServiceResult> {
    try {
      // Session save is handled by the store - this is just a placeholder
      // The actual save happens via the store's session data
      return { errors: [] };
    } catch (e) {
      console.error('[SessionService] Failed to save session:', e);
      return { errors: ['Failed to save session'] };
    }
  }

  async hydrate(sessions: SessionData[]): Promise<void> {
    for (const session of sessions) {
      // Hydration is handled by the store
    }
  }

  // ── Pipe Mapping ──────────────────────────────────────────────────────────

  private mapBackendPipes(pipeData: any[]): PipeRow[] {
    return pipeData.map((p: any) => ({
      id: p.id,
      name: p.name || `Pipe ${p.orderIndex ?? 0}`,
      lengthFrames: p.lengthFrames ?? 121,
      qValue: p.qValue ?? 18,
      cValue: p.cValue ?? 7,
      orderIndex: p.orderIndex ?? 0,
      keyframes: (p.keyframes || []).map((kf: any) => ({
        id: kf.id,
        frame: kf.frame,
        slotIndex: kf.slotIndex,
        type: kf.type,
        imageSrc: kf.imageSrc,
        prompt: kf.prompt,
        referenceUrl: kf.referenceUrl,
        previewRemoteUrl: kf.previewRemoteUrl,
        previewLocalPath: kf.previewLocalPath,
        status: kf.status || 'pending',
        forceRegen: kf.forceRegen === true,
      })),
      subjectReferences: (p.subjectReferences || []).map((r: any) => {
        const useFrames = r.useFrames === true;
        return {
          id: r.id,
          imageUrl: r.imageUrl || '',
          useFrames,
          type: r.type ?? 'url',
          prompt: r.prompt,
          previewRemoteUrl: r.previewRemoteUrl,
          previewLocalPath: r.previewLocalPath,
          status: r.status ?? 'pending',
          forceRegen: r.forceRegen === true,
          ...(useFrames && (r.frameStart !== undefined || r.frameEnd !== undefined) ? {
            frameStart: r.frameStart ?? 0,
            frameEnd: r.frameEnd ?? 240,
          } : {}),
          visible: r.visible !== false,
        };
      }),
      elements: (p.elements || []).map((el: any) => this.mapBackendElement(el)),
      // Last-gen artifact (D9): round-trips through the DB via the Rust
      // `Pipe.last_generation` field. Without this the session load silently
      // drops every pipe's generated video path, so the top-panel preview and
      // the pipe inspector's last-gen slot are empty after a session switch.
      lastGeneration: p.lastGeneration ?? null,
    }));
  }

  private mapBackendElement(el: any): any {
    // New format: has explicit 'tag' field
    if (el.tag === 'timeline') {
      return {
        id: el.id,
        tag: 'timeline',
        segments: (el.segments || []).map((s: any) => ({
          id: s.id,
          frameStart: s.frame_start ?? s.frameStart,
          frameEnd: s.frame_end ?? s.frameEnd,
          tags: (s.tags || []).map((t: any) => this.mapBackendTag(t)),
        })),
      };
    }
    if (el.tag === 'global_style') {
      return {
        id: el.id,
        tag: 'global_style',
        frameStart: el.frame_start ?? el.frameStart ?? 0,
        frameEnd: el.frame_end ?? el.frameEnd ?? 240,
        enabled: el.enabled !== false,
        prompt: el.prompt,
      };
    }
    if (el.tag === 'sound') {
      return {
        id: el.id,
        tag: 'sound',
        frameStart: el.frame_start ?? el.frameStart ?? 0,
        frameEnd: el.frame_end ?? el.frameEnd ?? 240,
        enabled: el.enabled !== false,
        prompt: el.prompt,
      };
    }
    // Legacy format: detect by presence of segments
    if ('segments' in el) {
      return {
        id: el.id,
        tag: 'timeline',
        segments: (el.segments || []).map((s: any) => ({
          id: s.id,
          frameStart: s.frameStart,
          frameEnd: s.frameEnd,
          tags: (s.tags || []).map((t: any) => this.mapBackendTag(t)),
        })),
      };
    }
    return {
      id: el.id,
      tag: 'global_style',
      value: el.value,
      enabled: el.enabled !== false,
    };
  }

  private mapBackendTag(t: any) {
    const row = {
      id: t.id,
      tag: t.tag,
      frameStart: t.frame_start ?? t.frameStart,
      frameEnd: t.frame_end ?? t.frameEnd,
      value: t.value,
      prompt: t.prompt,
      spec: t.spec,
    };
    // A tag row whose type is unknown to this version of the app (old/newer
    // session data) has no spec — fill in a fallback so render code can
    // safely read tag.spec.name / .color without crashing.
    if (row.spec === null || row.spec === undefined) {
      row.spec = {
        color: '#888888',
        name: row.tag ? String(row.tag) : 'Unknown',
        constructRule: 'plain',
      };
    }
    return row;
  }
}
