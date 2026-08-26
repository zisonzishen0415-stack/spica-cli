import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import {
  isEditTool,
  detectVerifyCommand,
  runVerify,
  batchNeedsVerify,
  loadVerifyConfig,
} from '../verifyLoop';

const TEST_DIR = path.join(os.tmpdir(), 'spica-test-verify');

describe('verifyLoop', () => {
  beforeEach(async () => {
    await fs.ensureDir(TEST_DIR);
  });

  afterEach(async () => {
    // Windows: child-process handles may keep the temp dir locked for a few
    // hundred ms after taskkill — retry instead of failing the whole file.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await fs.remove(TEST_DIR);
        break;
      } catch {
        await new Promise(r => setTimeout(r, 250));
      }
    }
  });

  describe('isEditTool', () => {
    it('recognizes content-writing tools', () => {
      expect(isEditTool('write')).toBe(true);
      expect(isEditTool('edit')).toBe(true);
      expect(isEditTool('file_multi_edit')).toBe(true);
      expect(isEditTool('file_patch')).toBe(true);
      expect(isEditTool('file_replace')).toBe(true);
      expect(isEditTool('file_insert')).toBe(true);
    });

    it('rejects read/neutral tools', () => {
      expect(isEditTool('read')).toBe(false);
      expect(isEditTool('bash')).toBe(false);
      expect(isEditTool('grep')).toBe(false);
      expect(isEditTool('file_delete')).toBe(false);
      expect(isEditTool('git')).toBe(false);
    });
  });

  describe('detectVerifyCommand', () => {
    it('prefers lint script when present', async () => {
      await fs.writeJson(path.join(TEST_DIR, 'package.json'), {
        scripts: { lint: 'eslint .', test: 'vitest run' },
      });
      expect(detectVerifyCommand(TEST_DIR)).toBe('npm run lint');
    });

    it('falls back to test script when no lint', async () => {
      await fs.writeJson(path.join(TEST_DIR, 'package.json'), {
        scripts: { test: 'vitest run' },
      });
      expect(detectVerifyCommand(TEST_DIR)).toBe('npm test');
    });

    it('returns null when no lint/test scripts', async () => {
      await fs.writeJson(path.join(TEST_DIR, 'package.json'), {
        scripts: { build: 'tsc' },
      });
      expect(detectVerifyCommand(TEST_DIR)).toBeNull();
    });

    it('returns null when no package.json', async () => {
      expect(detectVerifyCommand(TEST_DIR)).toBeNull();
    });

    it('handles malformed package.json gracefully', async () => {
      await fs.writeFile(path.join(TEST_DIR, 'package.json'), '{not json');
      expect(detectVerifyCommand(TEST_DIR)).toBeNull();
    });
  });

  describe('runVerify', () => {
    it('reports success for passing command', async () => {
      const r = await runVerify('node -e "console.log(\'verify-ok\')"', TEST_DIR);
      expect(r.success).toBe(true);
      expect(r.output).toContain('verify-ok');
      expect(r.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('reports failure for failing command', async () => {
      const r = await runVerify('node -e "console.error(\'boom\'); process.exit(1)"', TEST_DIR);
      expect(r.success).toBe(false);
      expect(r.output).toContain('boom');
    });

    it('times out long-running commands', async () => {
      const r = await runVerify('node -e "setTimeout(() => {}, 10000)"', TEST_DIR, 500);
      expect(r.success).toBe(false);
      expect(r.output.toLowerCase()).toContain('timed out');
    }, 10000);
  });

  describe('loadVerifyConfig', () => {
    it('returns defaults when no config exists', () => {
      expect(loadVerifyConfig(TEST_DIR)).toEqual({});
    });

    it('reads project-level verify config', async () => {
      await fs.ensureDir(path.join(TEST_DIR, '.spica'));
      await fs.writeJson(path.join(TEST_DIR, '.spica', 'settings.json'), {
        verify: { enabled: false, command: 'npm run check', timeoutMs: 30000 },
      });
      const cfg = loadVerifyConfig(TEST_DIR);
      expect(cfg.enabled).toBe(false);
      expect(cfg.command).toBe('npm run check');
      expect(cfg.timeoutMs).toBe(30000);
    });

    it('tolerates malformed project settings', async () => {
      await fs.ensureDir(path.join(TEST_DIR, '.spica'));
      await fs.writeFile(path.join(TEST_DIR, '.spica', 'settings.json'), '{oops');
      expect(loadVerifyConfig(TEST_DIR)).toEqual({});
    });
  });

  describe('batchNeedsVerify', () => {
    it('true when a successful edit happened', () => {
      expect(batchNeedsVerify([
        { name: 'read', result: 'file content' },
        { name: 'edit', result: 'Edited 2 lines' },
      ])).toBe(true);
    });

    it('false when only reads happened', () => {
      expect(batchNeedsVerify([
        { name: 'read', result: 'file content' },
        { name: 'grep', result: 'no matches' },
      ])).toBe(false);
    });

    it('false when edit failed', () => {
      expect(batchNeedsVerify([
        { name: 'edit', result: 'Error: file not found' },
      ])).toBe(false);
    });

    it('false when edit interrupted', () => {
      expect(batchNeedsVerify([
        { name: 'edit', result: 'interrupted' },
      ])).toBe(false);
    });

    it('false when edit blocked', () => {
      expect(batchNeedsVerify([
        { name: 'edit', result: 'Blocked: read-only path' },
      ])).toBe(false);
    });
  });
});
