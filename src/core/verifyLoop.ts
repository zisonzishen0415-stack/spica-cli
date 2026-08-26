// Verify loop — mechanism-level verification after edits.
//
// Solves the "agent says done without running tests" problem (USER-PROBLEM-ANALYSIS B1):
// instead of relying on the prompt ("Never claim completion without running
// verification"), the agent loop itself runs the project's verification command
// after any successful edit, and feeds the result back so the model can fix
// failures before reporting completion.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';

export interface VerifyOptions {
  /** Master switch. Default true. */
  enabled?: boolean;
  /** Custom command override (e.g. "npm run lint && npm test"). Auto-detected when absent. */
  command?: string;
  /** Per-run timeout in ms. Default 60000. */
  timeoutMs?: number;
  /** Max consecutive failed verify rounds before giving up. Default 3. */
  maxFailStreak?: number;
}

export interface VerifyResult {
  success: boolean;
  output: string;
  durationMs: number;
  command: string;
}

// Content-writing tools that trigger verification. file_delete is excluded —
// deletions are usually covered by the next lint/test run anyway, and asking
// the model to verify after every delete adds noise.
const EDIT_TOOLS = new Set([
  'write',
  'edit',
  'file_multi_edit',
  'file_patch',
  'file_replace',
  'file_insert',
]);

export function isEditTool(name: string): boolean {
  return EDIT_TOOLS.has(name);
}

const FAILURE_MARKERS = [
  'interrupted',
  'blocked:',
  'error:',
];

/**
 * A tool result counts as a *successful edit* when:
 * - the tool is an edit tool, and
 * - the result carries no failure marker (interrupt / block / error prefix).
 *
 * Empty results count as success — write tools may legitimately return
 * nothing on success.
 */
function isSuccessfulEdit(name: string, result: string): boolean {
  if (!isEditTool(name)) return false;
  const lower = result.toLowerCase();
  return !FAILURE_MARKERS.some(m => lower.includes(m));
}

export interface BatchToolResult {
  name: string;
  result: string;
}

/** Whether a tool batch contains at least one successful edit → verify. */
export function batchNeedsVerify(toolResults: BatchToolResult[]): boolean {
  return toolResults.some(t => isSuccessfulEdit(t.name, t.result));
}

/**
 * Auto-detect the verification command for a workspace.
 * Priority: package.json scripts.lint → scripts.test → null.
 * Returns "npm run lint" / "npm test" style commands; caller executes via shell.
 */
export function detectVerifyCommand(workspacePath: string): string | null {
  try {
    const pkgPath = path.join(workspacePath, 'package.json');
    if (!fs.existsSync(pkgPath)) return null;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const scripts = pkg?.scripts || {};
    if (typeof scripts.lint === 'string' && scripts.lint) return 'npm run lint';
    if (typeof scripts.test === 'string' && scripts.test) return 'npm test';
    return null;
  } catch {
    return null; // malformed or unreadable — never crash the agent loop
  }
}

/**
 * Load verify config from global (~/.spica/settings.json) and project
 * (.spica/settings.json) settings. Project overrides global. Mirrors the
 * hooks config layering. Config shape:
 *
 * ```json
 * { "verify": { "enabled": true, "command": "npm run lint", "timeoutMs": 60000, "maxFailStreak": 3 } }
 * ```
 */
export function loadVerifyConfig(workspacePath: string): VerifyOptions {
  let cfg: VerifyOptions = {};
  try {
    const globalPath = path.join(os.homedir(), '.spica', 'settings.json');
    if (fs.existsSync(globalPath)) {
      const g = JSON.parse(fs.readFileSync(globalPath, 'utf-8'));
      if (g?.verify) cfg = { ...cfg, ...g.verify };
    }
  } catch { /* non-fatal */ }
  try {
    const projPath = path.join(workspacePath, '.spica', 'settings.json');
    if (fs.existsSync(projPath)) {
      const p = JSON.parse(fs.readFileSync(projPath, 'utf-8'));
      if (p?.verify) cfg = { ...cfg, ...p.verify };
    }
  } catch { /* non-fatal */ }
  return cfg;
}

/**
 * Kill the process tree. Windows needs taskkill /F /T (plain kill leaves
 * orphaned children whose stdout handles keep the directory locked — this
 * was the EBUSY source in the first Windows test run); Unix kills the
 * process group via the detached session leader.
 */
function killProcessTree(child: ChildProcess): void {
  if (child.pid === undefined) return;
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/F', '/T', '/PID', String(child.pid)], { windowsHide: true });
    } catch { /* best effort */ }
  } else {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      try { child.kill('SIGKILL'); } catch { /* best effort */ }
    }
  }
}

/**
 * Run a verification command with a hard timeout. Uses the system shell so
 * "npm run lint" works on both Windows (cmd) and Unix (sh).
 *
 * Implemented with raw spawn (not execa) because execa's timeout on Windows
 * kills only the cmd wrapper, leaving the real child running — the promise
 * never settles and temp dirs stay locked (EBUSY). taskkill /F /T guarantees
 * the whole tree dies.
 */
export async function runVerify(
  command: string,
  cwd: string,
  timeoutMs: number = 60000,
): Promise<VerifyResult> {
  const started = Date.now();
  return new Promise<VerifyResult>(resolve => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;

    const child = spawn(command, {
      cwd,
      shell: true,
      windowsHide: true,
      // Unix: new process group so we can SIGKILL the whole tree.
      detached: process.platform !== 'win32',
    });

    const finish = (success: boolean, output: string): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        success: success && !timedOut,
        output: output.slice(0, 4000) + (output.length > 4000 ? '\n...[truncated]' : ''),
        durationMs: Date.now() - started,
        command,
      });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killProcessTree(child);
      // Give taskkill a moment to close the handles, then report.
      setTimeout(() => finish(false, `${stdout}${stderr}\n[verify] Timed out after ${timeoutMs}ms`), 300);
    }, timeoutMs);

    child.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString();
      if (stdout.length > 100000) child.stdout?.pause(); // cap memory
    });
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('error', err => finish(false, `${stdout}${stderr}\n[verify] Failed to start: ${err.message}`));
    child.on('close', code => {
      if (timedOut) return; // timeout path already settled
      finish(code === 0, `${stdout}${stderr}`);
    });
  });
}
