// Generation log access (docs/settings-provider-tasks.md, Phase 1/4).
//
// Entries are PORTABLE (P5): redacted here, in the process that holds the
// keys, before anything is persisted or shown. No API key and no raw local
// path ever reaches the log table.

import { invoke, isTauri } from '@tauri-apps/api/core';
import type { GenerationLogEntry, Settings } from '$types';
import { redactLog } from './guards';
import { getSettings } from './store';

/** Persist (upsert) a generation log entry, redacted against the active settings. */
export async function logGeneration(entry: GenerationLogEntry, settingsArg?: Settings): Promise<void> {
  if (!isTauri()) return;
  const redacted = redactLog(entry, settingsArg ?? getSettings());
  await invoke('log_generation', { entry: redacted });
}

export async function getGenerationLog(taskId: string): Promise<GenerationLogEntry | null> {
  if (!isTauri()) return null;
  const raw = await invoke('get_generation_log', { taskId });
  return raw ? (raw as GenerationLogEntry) : null;
}

export async function listGenerationLogs(sessionId: string): Promise<GenerationLogEntry[]> {
  if (!isTauri()) return [];
  return (await invoke('list_generation_logs', { sessionId })) as GenerationLogEntry[];
}
