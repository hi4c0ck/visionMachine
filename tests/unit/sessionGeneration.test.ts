import { describe, expect, it } from 'vitest';
import { buildSessionGenerationPayload, groupEventIsTerminal, type GroupEvent, type SessionGenerationInput } from '../../src/lib/composerStore/sessionGeneration';
import { summarizePipe } from '../../src/lib/promptEngine';
import type { PipeRow } from '../../src/types';

describe('session generation frontend contract', () => {
  const input: SessionGenerationInput = { sessionId: 's1', pipeIds: ['p1', 'p2'], failurePolicy: 'continue', autoCompose: true, imageModel: 'img', videoModel: 'vid', seed: 7, profileId: 'default' };
  it('passes ordered pipe and policy options through the invoke input', () => {
    expect(buildSessionGenerationPayload(input)).toMatchObject({ sessionId: 's1', pipeIds: ['p1', 'p2'], failurePolicy: 'continue', autoCompose: true });
  });
  it('carries resolved image/video specs on the invoke payload (engine requires them)', () => {
    const imageSpec = { id: 'agnes-image-2.5-flash', kind: 'image', endpoint: '/v1/images', sync: true } as any;
    const videoSpec = { id: 'agnes-video-2.5-flash', kind: 'video', endpoint: '/v1/video', sync: false } as any;
    const out = buildSessionGenerationPayload({ ...input, imageSpec, videoSpec });
    expect(out.imageSpec).toBe(imageSpec);
    expect(out.videoSpec).toBe(videoSpec);
    // Absent specs serialize to null (serde Option default), never omitted keys.
    const out2 = buildSessionGenerationPayload(input);
    expect(out2.imageSpec).toBeNull();
    expect(out2.videoSpec).toBeNull();
  });
  it('recognizes only group-terminal as group completion', () => {
    const terminal: GroupEvent = { groupId: 'g', kind: 'group-terminal' };
    expect(groupEventIsTerminal(terminal)).toBe(true);
    expect(groupEventIsTerminal({ ...terminal, kind: 'pipe-terminal' })).toBe(false);
  });
});

// The session modal must send REAL per-pipe prompts. An empty prompt map
// (or empty strings) makes every pipe generate from nothing, which is
// indistinguishable from a provider failure.
describe('session modal per-pipe prompts', () => {
  const base: SessionGenerationInput = { sessionId: 's1', pipeIds: ['p1', 'p2'], failurePolicy: 'continue', autoCompose: true, imageModel: 'img', videoModel: 'vid', seed: 7, profileId: 'default' };
  const pipe = (id: string, name: string): PipeRow => ({
    id,
    name,
    lengthFrames: 121,
    qValue: 18,
    cValue: 7,
    keyframes: [],
    elements: [
      {
        id: `${id}-tl`,
        tag: 'timeline',
        segments: [
          {
            id: `${id}-seg`,
            frameStart: 1,
            frameEnd: 121,
            tags: [
              { id: `${id}-scene`, frameStart: 1, frameEnd: 121, tag: 'scene', value: `a ${name} scene` },
            ],
          },
        ],
      },
    ],
  } as any);

  it('summarizePipe produces a non-empty prompt for a populated pipe', () => {
    const p = summarizePipe(pipe('p1', 'Pipe 1'), { fps: 24 });
    expect(typeof p).toBe('string');
    expect(p.trim().length).toBeGreaterThan(0);
  });

  it('payload carries one non-empty prompt per pipe id', () => {
    const pipes = [pipe('p1', 'Pipe 1'), pipe('p2', 'Pipe 2')];
    const prompts: Record<string, string> = {};
    for (const p of pipes) prompts[p.id] = summarizePipe(p, { fps: 24 });
    const out = buildSessionGenerationPayload({ ...base, prompts });
    expect(out.prompts).toEqual(prompts);
    // No pipe may be sent with an empty prompt.
    for (const p of pipes) {
      expect(out.prompts![p.id]).toBe(prompts[p.id]);
      expect(out.prompts![p.id].trim().length).toBeGreaterThan(0);
    }
    expect(Object.keys(out.prompts as object).sort()).toEqual(['p1', 'p2']);
  });

  it('distinct pipes produce distinct prompts (no shared empty placeholder)', () => {
    const prompts: Record<string, string> = {};
    for (const p of [pipe('p1', 'Pipe 1'), pipe('p2', 'Pipe 2')]) {
      prompts[p.id] = summarizePipe(p, { fps: 24 });
    }
    expect(prompts.p1).not.toBe(prompts.p2);
  });

  it('omitting prompts still serializes the key as null (serde Option default)', () => {
    // Backend treats a missing/empty prompt map as "empty prompt", so the
    // frontend contract is: always send real prompts, never a silent null.
    const out = buildSessionGenerationPayload(base);
    expect(out.prompts).toBeNull();
    const withPrompts = buildSessionGenerationPayload({ ...base, prompts: { p1: 'real' } });
    expect(withPrompts.prompts).toEqual({ p1: 'real' });
  });
});
