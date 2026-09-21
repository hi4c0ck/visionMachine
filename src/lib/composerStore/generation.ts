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
    return { errors: [] };
  }

  /**
   * Force-regenerate: drop the settled generated preview so the next run
   * regenerates the piece instead of skipping its stage as `Ready`.
   * Also flips the generated-type status back to 'pending' so the chip dot
   * reads "not generated" until the run settles it again. 'url' pieces
   * carry no generated preview — a plain no-op for them.
   */
  async clearRefPreview(
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
    const tgt = target as PipeKeyframe | SubjectReference;
    delete tgt.previewRemoteUrl;
    delete tgt.previewLocalPath;
    const ty = (tgt as SubjectReference).type ?? 'url';
    if (ty !== 'url') tgt.status = 'pending';
    return { errors: [] };
  }
}
