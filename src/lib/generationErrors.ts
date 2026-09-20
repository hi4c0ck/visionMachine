// Concrete generation error messages, shared by the progress modal and the
// terminal-state toasts so the user always sees the REAL reason a generation
// failed, not just "Generation failed".

export interface GenerationFailure {
  taskId: string;
  status: string;
  pipeId?: string;
  taskError?: string | null;
  stages?: Array<{
    id: string;
    label: string;
    kind: string;
    sourceKind?: string;
    sourceId?: string;
    status: string;
    error?: string | null;
  }>;
}

/**
 * Human-readable failure summary for a terminal generation task:
 * - 'done' → null (no failure)
 * - 'cancelled' → a friendly cancel note
 * - 'error' → the concrete task error; when the task-level error is missing,
 *   fall back to the first stage that carries its own error text.
 */
export function generationFailureMessage(v: GenerationFailure): string | null {
  if (v.status === 'done') return null;
  if (v.status === 'cancelled') return 'Generation cancelled';
  if (v.status === 'error') {
    const taskErr = v.taskError?.trim();
    if (taskErr) return taskErr;
    const stageErr = (v.stages ?? [])
      .find((s) => s.status === 'error' && s.error?.trim())
      ?.error?.trim();
    if (stageErr) return stageErr;
    return 'Generation failed — no details recorded';
  }
  // Non-terminal (queued/running): not a failure yet.
  return null;
}

/**
 * Compact per-piece breakdown for the console log: one line per stage that
 * carries an error, e.g.
 *   stage "Keyframe 1" (keyframe:abc123) → HTTP 429 (agnes-img-2): rate limited
 */
export function stageErrorLines(v: GenerationFailure): string[] {
  return (v.stages ?? [])
    .filter((s) => s.status === 'error' && s.error?.trim())
    .map((s) => `  stage ${s.label} (${s.sourceKind ?? s.kind}:${s.sourceId ?? s.id}) → ${s.error?.trim()}`);
}
