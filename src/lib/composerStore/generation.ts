// Generation Result Service Implementation
// Attaches the last-generation artifact to a pipe and flips reference
// statuses after a generation task reaches its terminal state.

import type { GenerationService, ServiceResult } from './interfaces';
import type {
  SessionData,
  PipeRow,
  PipeLastGeneration,
  GenerationStatus,
  PipeKeyframe,
  SubjectReference,
} from '$types';

export class GenerationServiceImpl implements GenerationService {
  private session: SessionData;
  private getPipe: (pipeId: string) => PipeRow | undefined;

  constructor(session: SessionData, getPipe: (pipeId: string) => PipeRow | undefined) {
    this.session = session;
    this.getPipe = getPipe;
  }

  async attachLastGeneration(
    _sessionId: string,
    pipeId: string,
    gen: PipeLastGeneration,
  ): Promise<ServiceResult> {
    const pipe = this.getPipe(pipeId);
    if (!pipe) return { errors: ['Pipe not found'] };
    pipe.lastGeneration = gen;
    return { errors: [] };
  }

  async markRefStatus(
    _sessionId: string,
    pipeId: string,
    kind: 'keyframe' | 'subject',
    refId: string,
    status: GenerationStatus,
  ): Promise<ServiceResult> {
    const pipe = this.getPipe(pipeId);
    if (!pipe) return { errors: ['Pipe not found'] };

    const target =
      kind === 'keyframe'
        ? pipe.keyframes.find((k) => k.id === refId)
        : (pipe.subjectReferences ?? []).find((r) => r.id === refId);
    if (!target) return { errors: ['Reference not found'] };
    target.status = status;
    return { errors: [] };
  }

  /**
   * Link a generated image back to its keyframe / subject so the chip shows a
   * thumbnail + the video stage carries the right upstream source. The two
   * fields are:
   *  - previewRemoteUrl: the provider's remote output URL (primary for the
   *    video API — fetchable by the provider).
   *  - previewLocalPath: the local media-tree file (UI chip preview + fallback
   *    for the video API when the remote URL is unreachable).
   * Both round-trip through the composer config JSON, so they survive restarts.
   */
  async attachGeneratedImage(
    _sessionId: string,
    pipeId: string,
    kind: 'keyframe' | 'subject',
    refId: string,
    localPath: string,
    remoteUrl?: string,
  ): Promise<ServiceResult> {
    const pipe = this.getPipe(pipeId);
    if (!pipe) return { errors: ['Pipe not found'] };
    const target =
      kind === 'keyframe'
        ? pipe.keyframes.find((k) => k.id === refId)
        : (pipe.subjectReferences ?? []).find((r) => r.id === refId);
    if (!target) return { errors: ['Reference not found'] };
    // Only set the local path when we have one; the remote URL when present.
    const tgt = target as PipeKeyframe | SubjectReference;
    if (localPath && localPath.trim()) tgt.previewLocalPath = localPath;
    if (remoteUrl && remoteUrl.trim()) tgt.previewRemoteUrl = remoteUrl;
    // A fresh artifact just arrived: any queued force-regen for this piece
    // is satisfied — clear the flag so the next run skips the stage as
    // `Ready` again and the dot's "queued" cue disappears.
    delete tgt.forceRegen;
    return { errors: [] };
  }

  /**
   * Queue a piece for regeneration on the next generation run (status-dot
   * click). Non-destructive by design: the settled preview data stays put,
   * so the asset keeps its "valid" readiness until the run re-makes it.
   * The registry overrides the stage's Ready-skip while the flag is set.
   */
  async queueRefRegen(
    _sessionId: string,
    pipeId: string,
    kind: 'keyframe' | 'subject',
    refId: string,
  ): Promise<ServiceResult> {
    const pipe = this.getPipe(pipeId);
    if (!pipe) return { errors: ['Pipe not found'] };
    const target =
      kind === 'keyframe'
        ? pipe.keyframes.find((k) => k.id === refId)
        : (pipe.subjectReferences ?? []).find((r) => r.id === refId);
    if (!target) return { errors: ['Reference not found'] };
    (target as PipeKeyframe | SubjectReference).forceRegen = true;
    return { errors: [] };
  }

  /**
   * Cancel a queued regeneration (status-dot re-click while the piece is
   * already queued). Non-destructive: the settled preview data stays, and
   * the registry's Ready-skip applies again on the next run — the dot goes
   * back to its readiness color immediately.
   */
  async clearRefRegen(
    _sessionId: string,
    pipeId: string,
    kind: 'keyframe' | 'subject',
    refId: string,
  ): Promise<ServiceResult> {
    const pipe = this.getPipe(pipeId);
    if (!pipe) return { errors: ['Pipe not found'] };
    const target =
      kind === 'keyframe'
        ? pipe.keyframes.find((k) => k.id === refId)
        : (pipe.subjectReferences ?? []).find((r) => r.id === refId);
    if (!target) return { errors: ['Reference not found'] };
    delete (target as PipeKeyframe | SubjectReference).forceRegen;
    return { errors: [] };
  }
}
