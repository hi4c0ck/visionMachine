// Generation outcome → reference status mapping (decisions D1/D4).
// When a task reaches a terminal state, each reference's generation status is
// flipped accordingly: ready/done image types → 'done', failed stage → 'error',
// everything that never ran (cancelled/not reached) → back to 'pending'.

import type { GenerationStatus, GenerationTaskView } from '$types';

export interface RefOutcome {
  kind: 'keyframe' | 'subject';
  refId: string;
  status: GenerationStatus;
}

export function refOutcomes(view: GenerationTaskView): RefOutcome[] {
  const out: RefOutcome[] = [];
  for (const stage of view.stages) {
    if (stage.kind === 'video') continue;
    let status: GenerationStatus;
    switch (stage.status) {
      case 'done':
      case 'ready':
        status = 'done';
        break;
      case 'error':
        status = 'error';
        break;
      default:
        // cancelled / never reached / still generating at abort
        status = 'pending';
        break;
    }
    out.push({
      kind: stage.sourceKind === 'keyframe' ? 'keyframe' : 'subject',
      refId: stage.sourceId,
      status,
    });
  }
  return out;
}
