import { describe, expect, it } from 'vitest';
import { buildSessionGenerationPayload, groupEventIsTerminal, type GroupEvent, type SessionGenerationInput } from '../../src/lib/composerStore/sessionGeneration';

describe('session generation frontend contract', () => {
  const input: SessionGenerationInput = { sessionId: 's1', pipeIds: ['p1', 'p2'], failurePolicy: 'continue', autoCompose: true, imageModel: 'img', videoModel: 'vid', seed: 7, profileId: 'default' };
  it('passes ordered pipe and policy options through the invoke input', () => {
    expect(buildSessionGenerationPayload(input)).toMatchObject({ sessionId: 's1', pipeIds: ['p1', 'p2'], failurePolicy: 'continue', autoCompose: true });
  });
  it('recognizes only group-terminal as group completion', () => {
    const terminal: GroupEvent = { groupId: 'g', kind: 'group-terminal' };
    expect(groupEventIsTerminal(terminal)).toBe(true);
    expect(groupEventIsTerminal({ ...terminal, kind: 'pipe-terminal' })).toBe(false);
  });
});
