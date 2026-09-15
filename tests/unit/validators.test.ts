/**
 * Unit tests for composerStore validators — normalizeSession / normalizePipe.
 * Regression guard for legacy / partial session data (missing fps,
 * resolution, orientation, pipe element arrays) reaching the UI.
 */
import { describe, it, expect } from 'vitest';
import { normalizeSession, normalizePipe } from '../../src/lib/composerStore/validators';
import type { PipeRow, SessionData } from '../../src/types/app';

function makeSession(overrides: Partial<SessionData> = {}): SessionData {
  return {
    id: 's1',
    name: 'Test',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    directoryPath: 'C:/t',
    pipes: [],
    fps: 24,
    resolution: '720p',
    orientation: 'horizontal',
    totalGeneratedFrames: 0,
    ...overrides,
  };
}

describe('normalizeSession', () => {
  it('defaults missing session-level fields', () => {
    const session = makeSession({
      fps: undefined as unknown as number,
      resolution: undefined as unknown as SessionData['resolution'],
      orientation: undefined as unknown as SessionData['orientation'],
      totalGeneratedFrames: undefined as unknown as number,
    });
    normalizeSession(session);
    expect(session.fps).toBe(24);
    expect(session.resolution).toBe('720p');
    expect(session.orientation).toBe('horizontal');
    expect(session.totalGeneratedFrames).toBe(0);
  });

  it('defaults a missing resolution to the orientation preset', () => {
    const session = makeSession({
      orientation: 'vertical',
      resolution: undefined as unknown as SessionData['resolution'],
    });
    normalizeSession(session);
    expect(session.resolution).toBe('1080p');
  });

  it('normalizes every pipe when the session shape is legacy', () => {
    const rawPipe = {
      id: 'p1',
      name: 'Pipe',
      lengthFrames: 121,
      qValue: 18,
      cValue: 7,
      orderIndex: 0,
    };
    const session = makeSession({ pipes: [rawPipe as unknown as PipeRow] });
    normalizeSession(session);
    const pipe = session.pipes[0];
    expect(pipe.keyframes).toEqual([]);
    expect(pipe.subjectReferences).toEqual([]);
    expect(pipe.elements).toEqual([]);
  });

  it('keeps valid values untouched', () => {
    const session = makeSession({
      fps: 30,
      resolution: '1080p',
      orientation: 'vertical',
      totalGeneratedFrames: 42,
    });
    normalizeSession(session);
    expect(session).toMatchObject({
      fps: 30,
      resolution: '1080p',
      orientation: 'vertical',
      totalGeneratedFrames: 42,
    });
  });
});

describe('normalizePipe', () => {
  it('fills missing structural arrays and scalars', () => {
    const pipe = normalizePipe({ id: 'p1' } as unknown as PipeRow);
    expect(pipe.elements).toEqual([]);
    expect(pipe.keyframes).toEqual([]);
    expect(pipe.subjectReferences).toEqual([]);
    expect(pipe.lengthFrames).toBe(241);
    expect(pipe.qValue).toBe(18);
    expect(pipe.cValue).toBe(7);
  });
});
