// Build process control: spawn the `tauri build` command with resource
// guardrails and be able to kill the whole process tree.
//
//   - CARGO_BUILD_JOBS     caps concurrent rustc processes (CPU + RAM)
//   - CARGO_PROFILE_RELEASE_LTO=false  skips the LTO link when --no-lto
//   - Windows: the command runs under a tiny .ps1 wrapper that lowers the
//     process priority class; the whole tree (npx → node → cargo → rustc)
//     inherits it, so the laptop stays responsive: "better slow than drained"

import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

/** Pure command spec — testable without touching a process. */
export function buildCommand({ jobs, noLto = false, priority = 'normal', stateDir = 'build-state', platform = process.platform, codegenUnits } = {}) {
  const env = { ...process.env, NO_COLOR: '1' };
  if (jobs) env.CARGO_BUILD_JOBS = String(jobs);
  if (noLto) env.CARGO_PROFILE_RELEASE_LTO = 'false';
  // Split one giant codegen unit into N smaller ones: big memory-spike saver
  // on the app crate (release profile ships with codegen-units = 1).
  if (codegenUnits) env.CARGO_PROFILE_RELEASE_CODEGEN_UNITS = String(codegenUnits);

  if (platform === 'win32' && priority !== 'normal') {
    const ps1 = path.join(stateDir, 'build-runner.ps1');
    writeFileSync(ps1, priorityScript(priority), 'utf8');
    return { cmd: 'powershell', args: ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1], env, shell: false, useShell: false };
  }
  // npx is npx.cmd on Windows → needs a shell; a plain binary elsewhere.
  return { cmd: 'npx', args: ['tauri', 'build'], env, shell: platform === 'win32', useShell: platform === 'win32' };
}

function priorityScript(priority) {
  const cls = priority === 'low' ? 'Low' : 'BelowNormal';
  return [
    'try {',
    '  $p = [System.Diagnostics.Process]::GetCurrentProcess()',
    `  $p.PriorityClass = [System.Diagnostics.ProcessPriorityClass]::${cls}`,
    '} catch { } # 32-bit PowerShell cannot set it; fall back to normal',
    '& npx tauri build 2>&1',
    'exit $LASTEXITCODE',
    '',
  ].join('\r\n');
}

/**
 * Spawn the build, merge stdout+stderr into one onLine() stream (complete
 * lines only). Returns { child, kill } — kill() terminates the whole tree.
 */
export function spawnBuild(spec, { onLine }) {
  const child = spawn(spec.cmd, spec.args, {
    cwd: process.cwd(),
    env: spec.env,
    shell: spec.shell,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let buf = '';
  const pipe = (stream) =>
    stream.on('data', (d) => {
      buf += d.toString('utf8');
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, '');
        buf = buf.slice(i + 1);
        onLine(line);
      }
    });
  pipe(child.stdout);
  pipe(child.stderr);

  return { child, kill: () => killTree(child.pid) };
}

/** Kill the process *tree* (a plain SIGKILL of the top pid orphans rustc). */
export function killTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    // taskkill /T walks the tree; detached so we never block on it.
    spawn('taskkill', ['/T', '/F', '/PID', String(pid)], { detached: true, stdio: 'ignore' }).unref();
  } else {
    try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
  }
}
