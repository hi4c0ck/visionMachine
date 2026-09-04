// Pipe Service Implementation
// Handles pipe CRUD operations

import type { PipeService, ServiceResult } from './interfaces';
import type { SessionData, PipeRow } from '$types';
import {
  validatePipeLength,
  validateQValue,
  validateCValue,
  generatePipeName,
  reindexPipes,
} from './validators';

export class PipeServiceImpl implements PipeService {
  private session: SessionData;

  constructor(session: SessionData) {
    this.session = session;
  }

  async add(_sessionId: string): Promise<ServiceResult> {
    const pipe: PipeRow = {
      id: crypto.randomUUID(),
      name: generatePipeName(this.session.pipes.length),
      lengthFrames: validatePipeLength(
        this.session.pipes[0]?.lengthFrames ?? 121,
        this.session.resolution,
      ),
      qValue: 18,
      cValue: 7,
      keyframes: [],
      subjectReferences: [],
      elements: [],
      orderIndex: this.session.pipes.length,
    };

    this.session.pipes.push(pipe);
    reindexPipes(this.session.pipes);
    return { errors: [] };
  }

  async remove(_sessionId: string, pipeId: string): Promise<ServiceResult> {
    const idx = this.session.pipes.findIndex(p => p.id === pipeId);
    if (idx >= 0) {
      this.session.pipes.splice(idx, 1);
      reindexPipes(this.session.pipes);
    }
    return { errors: [] };
  }

  async move(_sessionId: string, pipeId: string, newOrderIndex: number): Promise<ServiceResult> {
    const pipe = this.getPipe(this.session, pipeId);
    if (pipe) {
      pipe.orderIndex = newOrderIndex;
    }
    return { errors: [] };
  }

  async duplicate(_sessionId: string, pipeId: string): Promise<ServiceResult> {
    const pipe = this.getPipe(this.session, pipeId);
    if (pipe) {
      const newPipe: PipeRow = {
        ...pipe,
        id: crypto.randomUUID(),
        name: `${pipe.name} (copy)`,
        orderIndex: this.session.pipes.length,
      };
      this.session.pipes.push(newPipe);
      reindexPipes(this.session.pipes);
    }
    return { errors: [] };
  }

  async updateQ(_sessionId: string, pipeId: string, qValue: number): Promise<ServiceResult> {
    const pipe = this.getPipe(this.session, pipeId);
    if (pipe) {
      pipe.qValue = validateQValue(qValue);
    }
    return { errors: [] };
  }

  async updateC(_sessionId: string, pipeId: string, cValue: number): Promise<ServiceResult> {
    const pipe = this.getPipe(this.session, pipeId);
    if (pipe) {
      pipe.cValue = validateCValue(cValue);
    }
    return { errors: [] };
  }

  async setLength(_sessionId: string, pipeId: string, frames: number): Promise<ServiceResult> {
    const pipe = this.getPipe(this.session, pipeId);
    if (pipe) {
      pipe.lengthFrames = validatePipeLength(frames, this.session.resolution);
    }
    return { errors: [] };
  }

  getPipe(session: SessionData, pipeId: string): PipeRow | undefined {
    return session.pipes.find(p => p.id === pipeId);
  }
}
