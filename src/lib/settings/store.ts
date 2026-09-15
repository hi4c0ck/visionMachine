// Settings store (docs/settings-provider-tasks.md, Phase 2).
//
// A single shared Settings object: module-level source of truth + a change
// callback (composerStore pattern) for reactive consumers (settings modal,
// provider status chip). Tauri: persisted to SQLite (get_settings/
// save_settings). Browser dev: localStorage fallback — no backend,
// mirrors composerStore's dev path.

import { invoke, isTauri } from '@tauri-apps/api/core';
import type { Settings } from '$types';
import { DEFAULT_SETTINGS, normalizeSettings } from './guards';

// The live normalized settings object. `current` is the source of truth;
// consumers register via setOnSettingsChange (composerStore callback pattern)
// and re-read getSettings() on each notification.
let current: Settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
let profileId: string | null = null;
let saveTimer: number | null = null;
let saving = false;
let onChange: (() => void) | null = null;

function clone(s: Settings): Settings {
  return JSON.parse(JSON.stringify(s));
}

/** Imperative read (services, generation flow). */
export function getSettings(): Settings {
  return current;
}

/** Register a notification callback (UI re-sync, mirrors composerStore's setOnUpdate). */
export function setOnSettingsChange(cb: (() => void) | null): void {
  onChange = cb;
}

export function getProfileId(): string | null {
  return profileId;
}

/**
 * Load a profile's settings. Idempotent; always ends with a valid Settings
 * object (garbage rows reseed defaults) and notifies the store.
 */
export async function loadSettings(profile: string): Promise<void> {
  profileId = profile;
  let raw: unknown = null;
  if (isTauri()) {
    try {
      raw = await invoke('get_settings', { profileId: profile });
    } catch (e) {
      console.error('[settings] load failed, using defaults:', e);
    }
  } else {
    try {
      const stored = localStorage.getItem(`vm-settings-${profile}`);
      raw = stored ? JSON.parse(stored) : null;
    } catch (e) {
      console.error('[settings] load failed, using defaults:', e);
      raw = null;
    }
  }
  current = raw ? normalizeSettings(raw) : clone(DEFAULT_SETTINGS);
  onChange?.();
}

/**
 * Commit a full Settings draft (the Settings modal Save button).
 * Normalizes, updates the store, persists immediately.
 */
export async function commitSettings(full: Settings): Promise<void> {
  current = normalizeSettings(full);
  onChange?.();
  await saveSettingsNow();
}

/** In-place typed mutation; schedules a debounced persist. */
export function updateSettings(mutator: (draft: Settings) => void): void {
  const draft = clone(current);
  mutator(draft);
  current = normalizeSettings(draft);
  onChange?.();
  scheduleSave();
}

/** Persist now (also cancels any pending debounced save). */
export async function saveSettingsNow(): Promise<void> {
  if (saveTimer !== null) {
    window.clearTimeout(saveTimer);
    saveTimer = null;
  }
  return persistNow();
}

function scheduleSave(): void {
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    void persistNow();
  }, 800);
}

async function persistNow(): Promise<void> {
  if (saving || !profileId) return;
  saving = true;
  try {
    if (isTauri()) {
      await invoke('save_settings', { profileId, settings: current });
    } else {
      localStorage.setItem(`vm-settings-${profileId}`, JSON.stringify(current));
    }
  } catch (e) {
    console.error('[settings] save failed:', e);
  } finally {
    saving = false;
  }
}

// ── Provider ping (P7: real reachability) ───────────────────────────────────

export interface TestProviderOutcome {
  reachable: boolean;
  status: number | null;
  /** Human-readable; guaranteed key-free (redacted in the backend). */
  message: string;
}

export async function testProvider(
  baseUrl: string,
  apiKey: string,
): Promise<TestProviderOutcome> {
  if (!isTauri()) {
    return {
      reachable: false,
      status: null,
      message: 'Provider test is only available in the desktop app',
    };
  }
  try {
    const raw = (await invoke('test_provider', { baseUrl, apiKey })) as {
      reachable: boolean;
      status: number | null;
      message: string;
    };
    return { reachable: raw.reachable, status: raw.status ?? null, message: raw.message };
  } catch (e) {
    // Backend rejects non-http(s) URLs and client build failures with a
    // readable error string — surface it, never the key.
    return { reachable: false, status: null, message: String(e) };
  }
}
