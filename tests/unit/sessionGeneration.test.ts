import { describe, expect, it } from 'vitest';
import { buildSessionGenerationPayload, groupEventIsTerminal, type GroupEvent, type SessionGenerationInput } from '../../src/lib/composerStore/sessionGeneration';

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
