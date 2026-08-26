// 只读保护区（USER-PROBLEM-ANALYSIS D1）
// jch 污染教训（2026-08-07 源文件被 agent 覆盖）：samples/ 等真实素材
// 目录必须机制级只读，不能靠提示词约定。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { loadReadonlyPaths, isPathReadonly, assertWritable } from '../readonlyGuard';

const TEST_DIR = path.join(os.tmpdir(), 'spica-test-readonly');
const WS = path.join(TEST_DIR, 'workspace');

describe('readonlyGuard', () => {
  beforeEach(async () => {
    await fs.ensureDir(path.join(WS, 'samples'));
    await fs.ensureDir(path.join(WS, 'src'));
    await fs.ensureDir(path.join(WS, '.spica'));
    await fs.writeFile(path.join(WS, 'samples', 'a.JCH'), 'x');
    await fs.writeFile(path.join(WS, 'src', 'index.ts'), 'x');
    await fs.writeFile(path.join(WS, 'data.txt'), 'x');
  });

  afterEach(async () => {
    for (let i = 0; i < 5; i++) {
      try { await fs.remove(TEST_DIR); break; }
      catch { await new Promise(r => setTimeout(r, 250)); }
    }
  });

  describe('loadReadonlyPaths', () => {
    it('无配置时返回空', () => {
      expect(loadReadonlyPaths(WS)).toEqual([]);
    });

    it('读取项目 .spica/settings.json 配置', async () => {
      await fs.writeJson(path.join(WS, '.spica', 'settings.json'), {
        readonlyPaths: ['samples/', '*.JCH'],
      });
      expect(loadReadonlyPaths(WS)).toEqual(['samples/', '*.JCH']);
    });

    it('损坏配置不崩溃', async () => {
      await fs.writeFile(path.join(WS, '.spica', 'settings.json'), '{oops');
      expect(loadReadonlyPaths(WS)).toEqual([]);
    });
  });

  describe('isPathReadonly', () => {
    beforeEach(async () => {
      await fs.writeJson(path.join(WS, '.spica', 'settings.json'), {
        readonlyPaths: ['samples/', '*.JCH', 'data.txt'],
      });
    });

    it('目录前缀模式拦截目录内所有文件', () => {
      expect(isPathReadonly(WS, path.join(WS, 'samples', 'a.JCH'))).toBe(true);
      expect(isPathReadonly(WS, path.join(WS, 'samples', 'sub', 'b.png'))).toBe(true);
    });

    it('后缀模式拦截匹配文件', () => {
      expect(isPathReadonly(WS, path.join(WS, 'samples', 'a.JCH'))).toBe(true);
      expect(isPathReadonly(WS, path.join(WS, 'src', 'x.JCH'))).toBe(true);
    });

    it('精确路径拦截', () => {
      expect(isPathReadonly(WS, path.join(WS, 'data.txt'))).toBe(true);
    });

    it('不拦截未配置路径', () => {
      expect(isPathReadonly(WS, path.join(WS, 'src', 'index.ts'))).toBe(false);
    });

    it('相对路径同样被拦截', () => {
      expect(isPathReadonly(WS, 'samples/a.JCH')).toBe(true);
      expect(isPathReadonly(WS, 'src/index.ts')).toBe(false);
    });

    it('Windows 大小写不敏感', () => {
      expect(isPathReadonly(WS, path.join(WS, 'SAMPLES', 'a.jch'))).toBe(true);
    });
  });

  describe('assertWritable', () => {
    beforeEach(async () => {
      await fs.writeJson(path.join(WS, '.spica', 'settings.json'), {
        readonlyPaths: ['samples/'],
      });
    });

    it('只读路径返回拒绝原因', () => {
      const reason = assertWritable(WS, path.join(WS, 'samples', 'a.JCH'));
      expect(reason).toContain('samples');
    });

    it('可写路径返回 null', () => {
      expect(assertWritable(WS, path.join(WS, 'src', 'index.ts'))).toBeNull();
    });
  });
});
