// Stuck detection helpers for bash tool.
// Three improvements over wall-clock timeout:
// 1. Output-based detection — reset timer on stdout/stderr data
// 2. Smart slow-command auto-detection — auto-increase threshold for known slow commands
// 3. stale file — the actual stuckWarning timer logic lives here,
//    deployed to bash.ts via createStuckDetector()

export interface StuckDetector {
  /** Call on every stdout/stderr data chunk to reset the timer */
  onOutput: () => void;
  /** Clean up timers */
  dispose: () => void;
}

/**
 * Create an output-based stuck detector.
 * The stuck callback fires only when NO output has arrived for `stuckWarningMs`.
 * Each call to onOutput() resets the countdown.
 */
export function createStuckDetector(
  stuckWarningMs: number,
  onStuck: () => void,
): StuckDetector {
  let lastOutputTime = Date.now();
  let stuckTimer: NodeJS.Timeout | null = null;
  let triggered = false;

  const scheduleCheck = () => {
    if (stuckTimer) clearTimeout(stuckTimer);
    if (triggered) return;

    const remaining = stuckWarningMs - (Date.now() - lastOutputTime);
    const delay = Math.max(0, remaining);

    stuckTimer = setTimeout(() => {
      const elapsed = Date.now() - lastOutputTime;
      if (elapsed >= stuckWarningMs && !triggered) {
        triggered = true;
        onStuck();
      } else if (!triggered) {
        // Still getting output or just started — reschedule
        scheduleCheck();
      }
    }, delay);
  };

  scheduleCheck();

  return {
    onOutput: () => {
      lastOutputTime = Date.now();
      scheduleCheck();
    },
    dispose: () => {
      if (stuckTimer) clearTimeout(stuckTimer);
      stuckTimer = null;
    },
  };
}

// ---------- Smart slow-command detection ----------

export interface SlowPattern {
  pattern: RegExp;
  multiplier: number;
  description: string;
}

/**
 * Known slow command patterns. When matched, the stuck threshold
 * is multiplied to allow these commands more time.
 *
 * Pattern matching order is important: more specific patterns
 * (like `git clone`) should appear before broader ones.
 */
export const SLOW_COMMAND_PATTERNS: SlowPattern[] = [
  { pattern: /\bgit\s+(clone|pull|fetch)\b/, multiplier: 5, description: 'git clone/pull' },
  { pattern: /\b(npm|pnpm|yarn)\s+(install|ci|update)\b/, multiplier: 4, description: 'npm/pnpm/yarn install' },
  { pattern: /\b(pip|pip3|pipenv)\s+install\b/, multiplier: 5, description: 'pip install' },
  { pattern: /\b(apt-get|apt|brew|choco|yum|dnf)\s+install\b/, multiplier: 5, description: 'package manager install' },
  { pattern: /\b(cargo\s+build|cargo\s+install|go\s+build|go\s+install|go\s+get)\b/, multiplier: 3, description: 'compile/build' },
  { pattern: /\b(bundle\s+install|gem\s+install|composer\s+install)\b/, multiplier: 4, description: 'dependency install' },
  { pattern: /\b(npx\s+tsc|npx\s+eslint.*--fix|npx\s+prettier.*--write)\b/, multiplier: 3, description: 'linter/formatter' },
  { pattern: /\b(docker\s+build|docker\s+compose\s+build|docker\s+pull)\b/, multiplier: 5, description: 'docker build' },
  { pattern: /\b(cmake|make|ninja)\b/, multiplier: 3, description: 'build system' },
  { pattern: /\bnpx\s+vitest\s+run\b/, multiplier: 3, description: 'test suite' },
];

/**
 * Determine the stuck timeout for a command.
 *
 * If the command matches a known slow pattern, the baseMs is multiplied.
 * If the user explicitly sets `stuckWarning`, that value is used directly
 * (no auto-detection override).
 */
export function getSmartStuckTimeout(
  command: string,
  baseMs: number,
): { timeout: number; reason?: string } {
  for (const { pattern, multiplier, description } of SLOW_COMMAND_PATTERNS) {
    if (pattern.test(command)) {
      return { timeout: baseMs * multiplier, reason: description };
    }
  }
  return { timeout: baseMs };
}
