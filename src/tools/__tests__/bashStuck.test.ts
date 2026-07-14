/**
 * Tests for bash stuck detection improvements:
 * 1. Output-based detection (resets timer on stdout/stderr data)
 * 2. Smart slow-command auto-detection
 * 3. stuckWarning parameter exposure in registry
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import { join } from 'path';
import { setWorkspace } from '../../tools/index';
import { executeBash } from '../impl/bash';
import {
  getSmartStuckTimeout,
  createStuckDetector,
  SLOW_COMMAND_PATTERNS,
} from '../impl/stuckDetector';
import { TOOLS_DEFINITIONS } from '../registry';

const TEST_DIR = join(process.cwd(), 'test-bash-stuck-temp');

async function safeRemove(path: string, retries = 3): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      await fs.remove(path);
      return;
    } catch {
      if (i < retries - 1) await new Promise(r => setTimeout(r, 200));
    }
  }
}

// -------------------------------------------------------
// Unit tests — fast, no real process
// -------------------------------------------------------

describe('Smart Slow-Command Detection', () => {
  it('should apply multiplier for npm install', () => {
    const result = getSmartStuckTimeout('npm install express', 15000);
    expect(result.timeout).toBe(15000 * 4);
    expect(result.reason).toContain('npm');
  });

  it('should apply multiplier for pnpm install', () => {
    const result = getSmartStuckTimeout('pnpm install', 15000);
    expect(result.timeout).toBe(15000 * 4);
  });

  it('should apply multiplier for yarn install', () => {
    const result = getSmartStuckTimeout('yarn install --frozen-lockfile', 15000);
    expect(result.timeout).toBe(15000 * 4);
  });

  it('should apply multiplier for git clone', () => {
    const result = getSmartStuckTimeout('git clone https://github.com/foo/bar.git', 15000);
    expect(result.timeout).toBe(15000 * 5);
    expect(result.reason).toBe('git clone/pull');
  });

  it('should apply multiplier for git pull', () => {
    const result = getSmartStuckTimeout('git pull origin main', 15000);
    expect(result.timeout).toBe(15000 * 5);
  });

  it('should apply multiplier for pip install', () => {
    const result = getSmartStuckTimeout('pip3 install django', 15000);
    expect(result.timeout).toBe(15000 * 5);
  });

  it('should apply multiplier for cargo build', () => {
    const result = getSmartStuckTimeout('cargo build --release', 15000);
    expect(result.timeout).toBe(15000 * 3);
  });

  it('should apply multiplier for npx tsc', () => {
    const result = getSmartStuckTimeout('npx tsc --noEmit src/index.ts', 15000);
    expect(result.timeout).toBe(15000 * 3);
  });

  it('should use default threshold for echo commands', () => {
    const result = getSmartStuckTimeout('echo hello world', 15000);
    expect(result.timeout).toBe(15000);
    expect(result.reason).toBeUndefined();
  });

  it('should use default threshold for ls', () => {
    const result = getSmartStuckTimeout('ls -la', 15000);
    expect(result.timeout).toBe(15000);
  });

  it('should handle empty commands', () => {
    const result = getSmartStuckTimeout('', 15000);
    expect(result.timeout).toBe(15000);
  });

  it('should handle docker build', () => {
    const result = getSmartStuckTimeout('docker build -t myimage .', 15000);
    expect(result.timeout).toBe(15000 * 5);
  });

  it('should handle npx vitest run', () => {
    const result = getSmartStuckTimeout('npx vitest run src/__tests__/', 15000);
    expect(result.timeout).toBe(15000 * 3);
  });
});

describe('Stuck Detector State Machine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should NOT fire if onOutput is called before timeout', () => {
    const onStuck = vi.fn();
    const detector = createStuckDetector(10000, onStuck);

    // Advance 5s, emit output → timer resets
    vi.advanceTimersByTime(5000);
    detector.onOutput();

    // Advance another 5s — still within 10s window from last output
    vi.advanceTimersByTime(5000);
    expect(onStuck).not.toHaveBeenCalled();

    // Advance remaining 5s — now 10s since last output → should fire
    vi.advanceTimersByTime(5000);
    expect(onStuck).toHaveBeenCalledTimes(1);

    detector.dispose();
  });

  it('should fire exactly once when no output arrives', () => {
    const onStuck = vi.fn();
    const detector = createStuckDetector(10000, onStuck);

    vi.advanceTimersByTime(10000);
    expect(onStuck).toHaveBeenCalledTimes(1);

    // Multiple firings should be ignored
    vi.advanceTimersByTime(20000);
    expect(onStuck).toHaveBeenCalledTimes(1);

    detector.dispose();
  });

  it('should reset timer on each onOutput call', () => {
    const onStuck = vi.fn();
    const detector = createStuckDetector(10000, onStuck);

    // Output at t=5s → resets to t=15s deadline
    vi.advanceTimersByTime(5000);
    detector.onOutput();

    // Advance to t=12s — only 7s since last output, should NOT fire
    vi.advanceTimersByTime(7000);
    expect(onStuck).not.toHaveBeenCalled();

    // Advance to t=16s — 11s since last output, should fire
    vi.advanceTimersByTime(4000);
    expect(onStuck).toHaveBeenCalledTimes(1);

    detector.dispose();
  });

  it('should handle multiple rapid outputs', () => {
    const onStuck = vi.fn();
    const detector = createStuckDetector(10000, onStuck);

    for (let i = 0; i < 100; i++) {
      vi.advanceTimersByTime(100);
      detector.onOutput();
    }

    // Total time advanced: 10s, but output was continuous
    // Should NOT fire because onOutput was called throughout
    // Wait: 100 * 100ms = 10s exactly. The last onOutput was at t=10s.
    // From t=10s to t=20s without output → should fire at t=20s
    expect(onStuck).not.toHaveBeenCalled();

    vi.advanceTimersByTime(10000);
    expect(onStuck).toHaveBeenCalledTimes(1);

    detector.dispose();
  });

  it('should dispose cleanly without firing', () => {
    const onStuck = vi.fn();
    const detector = createStuckDetector(10000, onStuck);

    vi.advanceTimersByTime(5000);
    detector.dispose();

    // After dispose, timer should be cleared
    vi.advanceTimersByTime(10000);
    expect(onStuck).not.toHaveBeenCalled();
  });
});

describe('stuckWarning Parameter in Registry', () => {
  it('should expose stuckWarning in bash tool definition', () => {
    const bashDef = TOOLS_DEFINITIONS.find(t => t.name === 'bash');
    expect(bashDef).toBeDefined();
    expect(bashDef!.parameters.properties).toHaveProperty('stuckWarning');
  });

  it('should describe auto-adjusted behavior and default', () => {
    const bashDef = TOOLS_DEFINITIONS.find(t => t.name === 'bash');
    const prop = bashDef!.parameters.properties.stuckWarning;
    expect(prop.type).toBe('number');
    expect(prop.description).toContain('auto-adjusted');
  });
});

describe('SLOW_COMMAND_PATTERNS coverage', () => {
  it('should cover git, npm, pip, cargo/go, docker, yarn, build systems', () => {
    const categories = SLOW_COMMAND_PATTERNS.map(p => p.description);
    expect(categories.length).toBeGreaterThanOrEqual(7);
    expect(categories.some(c => c.includes('git'))).toBe(true);
    expect(categories.some(c => c.includes('npm'))).toBe(true);
    expect(categories.some(c => c.includes('pip'))).toBe(true);
    expect(categories.some(c => c.includes('build'))).toBe(true);
    expect(categories.some(c => c.includes('docker'))).toBe(true);
    expect(categories.some(c => c.includes('yarn'))).toBe(true);
    expect(categories.some(c => c.includes('install'))).toBe(true);
  });
});

// -------------------------------------------------------
// Integration tests — real bash commands (fast ones only)
// -------------------------------------------------------

describe('Bash stuck with real commands', () => {
  beforeEach(async () => {
    await fs.ensureDir(TEST_DIR);
    setWorkspace(TEST_DIR);
  });

  afterEach(async () => {
    await safeRemove(TEST_DIR);
  });

  it('should complete fast echo command without triggering stuck', async () => {
    const result = await executeBash({
      command: 'echo hello',
    });

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should complete npm --version without triggering stuck', async () => {
    const result = await executeBash({
      command: 'npm --version',
    });

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should allow explicit stuckWarning override', async () => {
    const result = await executeBash({
      command: 'echo fast',
      stuckWarning: 1,
    });

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });
});
