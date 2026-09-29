// Settings store (docs/settings-provider-tasks.md, Phase 2).
//
// A single shared Settings object: module-level source of truth + a change
// callback (composerStore pattern) for reactive consumers (settings modal,
// provider status chip). Tauri: persisted to SQLite (get_settings/
// save_settings). Browser dev: localStorage fallback — no backend,
// mirrors composerStore's dev path.

import { invoke, isTauri } from '@tauri-apps/api/core';
import type { ProviderKind, Settings } from '$types';
import { DEFAULT_SETTINGS, normalizeSettings, providerStatuses, type ProviderStatusSnapshot } from './guards';

// The live normalized settings object. `current` is the source of truth;
// consumers register via setOnSettingsChange (composerStore callback pattern)
// and re-read getSettings() on each notification.
let current: Settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
let profileId: string | null = null;
/** Which profile id `current` was last loaded from (null = still on defaults). */
let loadedProfile: string | null = null;
let saveTimer: number | null = null;
let saving = false;
// Monotonic generation counter. Every entry point that REPLACES `current`
// (loadSettings / commitSettings / updateSettings) bumps it; an async load
// that finishes after a newer commit/update is stale and must not clobber
// the fresher state — this is the race that let the provider chip revert to
// "key not set" on a freshly configured provider (a late loadSettings
// re-applied the pre-save blob over the just-saved one).
let generation = 0;

function bumpGeneration(): number {
  generation += 1;
  return generation;
}
// MULTIPLE independent listeners: each consumer (Workspace settings re-sync,
// the ffmpeg re-probe, …) registers its own callback and no registration
// clobbers the others. A single-slot `let onChange` here used to let a later
// onMount registration (the ffmpeg re-probe) silently overwrite the
// Workspace's settings/providerStatus re-sync, so the provider status chip
// stayed stale after a Settings save. Adding chains; unregisterSettingsChange
// removes. Each entry is a plain function (never null).
const onChanges = new Set<() => void>();
// Provider status snapshot (P6): a key-presence + configured flag per kind,
// recomputed on profile load and on every settings change. UI reads THIS
// (via getProviderStatus) instead of sniffing apiKey off the live settings
// object, so a mid-load / default-seeded object can no longer report
// "key not set" for a persisted key.
let providerStatus: Record<ProviderKind, ProviderStatusSnapshot> = providerStatuses(current);
// Load lifecycle (P6b): true while the ACTIVE profile's settings are still in
// flight. The snapshot above is a pure function of `current`, and `current`
// is seeded from DEFAULT_SETTINGS at module init — so until the first
// loadSettings settles it looks EXACTLY like "loaded, key genuinely absent".
// That indistinguishability is the initial-load window the P6 generation guard
// does NOT cover (it only stops a *late* load clobbering a *newer* commit).
// Consumers that assert key presence (the provider chip, a generate pre-check)
// must read this flag and treat "not loaded yet" as a neutral state, never
// as "key not set". Flipped to true the moment a load for a DIFFERENT
// profile starts, so a profile switch can't leave the NEW profile's chip
// flashing a transient "key not set" while its settings load.
let settingsLoading = false;

function clone(s: Settings): Settings {
  return JSON.parse(JSON.stringify(s));
}

/** Imperative read (services, generation flow). */
export function getSettings(): Settings {
  return current;
}

/**
 * Register a settings-change notification callback (UI re-sync, mirrors
 * composerStore's setOnUpdate). ADDITIVE: each consumer adds its own listener,
 * so no registration clobbers another (the old single-slot let `onChange`
 * let the ffmpeg re-probe silently overwrite the Workspace's
 * settings/providerStatus re-sync). Pair with unregisterSettingsChange on
 * teardown.
 */
export function setOnSettingsChange(cb: () => void): void {
  onChanges.add(cb);
}

/** Remove a previously-registered listener (must be the same function ref). */
export function unregisterSettingsChange(cb: () => void): void {
  onChanges.delete(cb);
}

function notifyChanges(): void {
  for (const cb of [...onChanges]) cb();
}

export function getProfileId(): string | null {
  return profileId;
}

/**
 * True while the active profile's settings are still in flight — the first
 * loadSettings has not settled, OR a profile switch has kicked off a new
 * load. Lets callers distinguish "seeded from defaults, not loaded yet" —
 * a neutral state — from "loaded, key genuinely absent" (a real gap).
 *
 * This is the ONLY signal that closes the initial-load window the P6
 * generation guard does not cover: the guard stops a LATE load from
 * clobbering a NEWER commit, but while the very first load is in flight the
 * snapshot is the default-seeded one and looks identical to "loaded, no
 * key." Consumers that assert key presence (the provider chip, a generate
 * pre-check) must read this flag and render a neutral state while it is true.
 */
export function isSettingsLoading(): boolean {
  // An in-flight load (settingsLoading) OR a store that has never settled on
  // any profile (loadedProfile === null). The second branch is the one the
  // UI actually observes: a Workspace that mounts before the first load has
  // run (or whose load has not yet completed) must treat the snapshot as
  // unreliable. The two flags are kept in lockstep by loadSettings, so
  // reading them together is race-free.
  return settingsLoading || loadedProfile === null;
}

/**
 * The profile id `current` + `providerStatus` were LAST loaded from. `null`
 * until the first `loadSettings` settles — lets callers tell "seeded from
 * defaults, not loaded yet" apart from "loaded, key genuinely absent".
 */
export function getLoadedProfile(): string | null {
  return loadedProfile;
}

/**
 * Read the provider status snapshot (P6): per-kind key presence + the
 * generation gate. Recomputed on profile load and after every settings
 * change; callers never re-derive key presence off the raw settings object.
 * The snapshot carries `hasKey` (a boolean), never the key value.
 */
export function getProviderStatus(): Record<ProviderKind, ProviderStatusSnapshot> {
  return providerStatus;
}

/**
 * Load a profile's settings. Idempotent; always ends with a valid Settings
 * object (garbage rows reseed defaults) and notifies the store.
 */
export async function loadSettings(profile: string): Promise<void> {
  profileId = profile;
  // The active profile's settings are about to go in flight. If we are
  // switching AWAY from a settled profile, its snapshot no longer represents
  // the profile the UI is showing — mark the load pending so the chip (and
  // any key-presence assert) reads a neutral state, not a transient
  // "key not set" off the outgoing profile's snapshot. A load for the SAME
  // settled profile (idempotent re-call) leaves the flag as-is.
  settingsLoading = loadedProfile !== profile;
  // Captured BEFORE the await: if a commit/update bumps the generation while
  // this load is in flight, the persisted blob we read is stale — the chip
  // would revert a freshly configured provider to "key not set", or re-apply
  // a just-cleared key. Drop the late load instead of clobbering the newer
  // in-memory state.
  const gen = generation;
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
  // A commit/update landed while this load was in flight — the persisted blob
  // we just read is stale, so drop it instead of rolling the UI back. If the
  // in-memory settings now belong to a DIFFERENT profile (a profile switch
  // raced a just-saved key), the store still shows the OLD profile's
  // providerStatus — re-notify so the chip re-syncs from what actually won.
  if (gen !== generation) {
    // A commit/update won the race; the UI already has that fresher state.
    // Clear the pending flag only if we have actually settled on a profile —
    // otherwise a different load is in flight and must keep it pending.
    if (loadedProfile === profile) settingsLoading = false;
    if (loadedProfile !== profile) notifyChanges();
    return;
  }
  current = raw ? normalizeSettings(raw) : clone(DEFAULT_SETTINGS);
  providerStatus = providerStatuses(current);
  loadedProfile = profile;
  settingsLoading = false;
  syncFfmpegUserPath();
  notifyChanges();
}

/**
 * Mirror the user-set ffmpeg path into the process env the backend locator
 * reads (VM_FFMPEG_USER_PATH). Must run on load AND on every commit so a
 * path saved in Settings takes effect without a restart. No-op in browser
 * dev (no backend, locator is irrelevant).
 */
export function syncFfmpegUserPath(): void {
  if (!isTauri()) return;
  void invoke('set_ffmpeg_user_path', { path: current.tools.ffmpegPath });
}

/**
 * Commit a full Settings draft (the Settings modal Save button).
 * Normalizes, updates the store, persists immediately.
 */
export async function commitSettings(full: Settings): Promise<void> {
  bumpGeneration();
  current = normalizeSettings(full);
  providerStatus = providerStatuses(current);
  syncFfmpegUserPath();
  notifyChanges();
  await saveSettingsNow();
}

/** In-place typed mutation; schedules a debounced persist. */
export function updateSettings(mutator: (draft: Settings) => void): void {
  bumpGeneration();
  const draft = clone(current);
  mutator(draft);
  current = normalizeSettings(draft);
  providerStatus = providerStatuses(current);
  notifyChanges();
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

function persistNow(): Promise<void> {
  if (saving || !profileId) return Promise.resolve();
  saving = true;
  return (async () => {
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
  })();
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
