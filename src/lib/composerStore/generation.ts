// Generation Result Service Implementation
// Attaches the last-generation artifact to a pipe and flips reference
// statuses after a generation task reaches its terminal state.

import type { GenerationService, ServiceResult } from './interfaces';
import type {
  SessionData,
  PipeRow,
  PipeLastGeneration,
  GenerationStatus,
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
}
