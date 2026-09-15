// Pre-flight health gates + runtime resource assessment.
// Everything here is a pure decision function or a single-shot OS probe —
// the runner only composes them. Pure parts are unit-tested.

import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { statfs } from 'node:fs/promises';

/** Free system RAM in MB (node builtin — works cross-platform). */
export function freeRamMB() {
  return Math.round(os.freemem() / 1048576);
}

/** 'ok' | 'warn' | 'critical' for the current free RAM. */
export function assessRam(freeMB, { warnMB = 4096, guardMB = 1024 } = {}) {
  if (freeMB < guardMB) return 'critical';
  if (freeMB < warnMB) return 'warn';
  return 'ok';
}

/**
 * Suggest cargo job count: never more than 4 concurrent rustc processes
 * (each can hold 1–2 GB — this is what protects the laptop), and drop to 2
 * when free RAM is tight. `better slow than drained`.
 */
export function suggestJobs({ ramMB = null, cpus = os.cpus().length } = {}) {
  let jobs = Math.max(2, Math.min(4, cpus));
  if (ramMB != null && ramMB < 8192) jobs = 2;
  return jobs;
}

/** Free disk on the drive hosting `dir` (MB), or null when probe fails. */
export async function freeDiskMB(dir) {
  try {
    const s = await statfs(dir);
    return Math.round((s.bavail * s.bsize) / 1048576);
  } catch {
    return null;
  }
}

/** Is vision-machine.exe running (it locks the build output)? Windows-only probe. */
export function appRunning(exe = 'vision-machine.exe') {
  if (process.platform !== 'win32') return false;
  try {
    const out = execFileSync('tasklist', ['/FI', `IMAGENAME eq ${exe}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.toLowerCase().includes(exe);
  } catch {
    return false;
  }
}

/** Count msiexec processes (a hung installer from a previous install blocks WiX). */
export function msiexecCount() {
  if (process.platform !== 'win32') return 0;
  try {
    const out = execFileSync('tasklist', ['/FI', 'IMAGENAME eq msiexec.exe'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return (out.match(/msiexec\.exe/gi) || []).length;
  } catch {
    return 0;
  }
}

/**
 * Run all pre-build gates. Returns { ok, errors, warnings, ramMB, diskMB, jobs }.
 * Hard failures (errors) block the build; warnings are surfaced but proceed.
 */
export async function preflight({
  cwd = process.cwd(),
  cpus = os.cpus().length,
  ramGuardMB = 1024,
  busy = false,
} = {}) {
  const errors = [];
  const warnings = [];

  if (busy) errors.push('another build is already running — use: npm run build:status / build:stop');

  const ramMB = freeRamMB();
  const diskMB = await freeDiskMB(cwd);

  if (appRunning()) {
    errors.push(
      'vision-machine.exe is running — close the app first (it locks the output .exe)',
    );
  }
  const msi = msiexecCount();
  if (msi > 0) {
    warnings.push(
      `${msi} msiexec process(es) running — if a previous install hung: taskkill /IM msiexec.exe /F`,
    );
  }
  if (diskMB != null && diskMB < 4096) {
    errors.push(`only ~${Math.round(diskMB / 1024)} GB free on the target drive — need ~4 GB`);
  }
  if (assessRam(ramMB, { guardMB: ramGuardMB }) === 'critical') {
    errors.push(
      `free RAM ${Math.round(ramMB / 1024)} GB is below the ${ramGuardMB} MB guard — ` +
        'close heavy apps and retry (the build would thrash the OS)',
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    ramMB,
    diskMB,
    jobs: suggestJobs({ ramMB, cpus }),
  };
}
