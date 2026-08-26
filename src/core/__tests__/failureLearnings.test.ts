// 重复失败自动沉淀记忆（USER-PROBLEM-ANALYSIS E1）
// puttyon 14 条 + pattern-seperator 12 条"容易搞错"约定全靠人写——
// 同一错误模式重复出现时，agent 应自动写入 learnings。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { categorizeError, recordFailureAndMaybeLearn } from '../learnings';

const TEST_DIR = path.join(os.tmpdir(), 'spica-test-faillrn');

describe('categorizeError', () => {
  it('识别常见错误类别', () => {
    expect(categorizeError('ENOENT: no such file or directory')).toBe('file-not-found');
    expect(categorizeError('ECONNREFUSED 127.0.0.1:3001')).toBe('connection-refused');
    expect(categorizeError("UnicodeEncodeError: 'gbk' codec can't encode")).toBe('gbk-encoding');
    expect(categorizeError('command timed out after 120000 milliseconds')).toBe('timeout');
    expect(categorizeError('bash: npm: command not found')).toBe('command-not-found');
    expect(categorizeError('EACCES: permission denied')).toBe('permission-denied');
    expect(categorizeError('.git/index.lock exists')).toBe('git-index-lock');
    expect(categorizeError('EBUSY: resource busy or locked')).toBe('file-locked');
    expect(categorizeError('some weird unknown failure')).toBe('unknown');
  });
});

describe('recordFailureAndMaybeLearn', () => {
  beforeEach(async () => {
    await fs.ensureDir(TEST_DIR);
  });

  afterEach(async () => {
    for (let i = 0; i < 5; i++) {
      try { await fs.remove(TEST_DIR); break; }
      catch { await new Promise(r => setTimeout(r, 250)); }
    }
  });

  it('同一模式前 2 次失败不学习', async () => {
    const counters = new Map<string, number>();
    const r1 = await recordFailureAndMaybeLearn(TEST_DIR, 'bash', 'ECONNREFUSED api', counters);
    const r2 = await recordFailureAndMaybeLearn(TEST_DIR, 'bash', 'ECONNREFUSED api again', counters);
    expect(r1).toBeNull();
    expect(r2).toBeNull();
    expect(counters.size).toBe(1);
  });

  it('同一模式第 3 次失败自动写入 learnings 并返回文本', async () => {
    const counters = new Map<string, number>();
    await recordFailureAndMaybeLearn(TEST_DIR, 'bash', 'ECONNREFUSED 1', counters);
    await recordFailureAndMaybeLearn(TEST_DIR, 'bash', 'ECONNREFUSED 2', counters);
    const r3 = await recordFailureAndMaybeLearn(TEST_DIR, 'bash', 'ECONNREFUSED 3', counters);
    expect(r3).not.toBeNull();
    expect(r3).toContain('ECONNREFUSED');
    // learnings 文件已写
    const learningsDir = path.join(TEST_DIR, '.spica', 'learnings');
    const files = await fs.readdir(learningsDir);
    expect(files.length).toBe(1);
  });

  it('不同工具的同类别独立计数', async () => {
    const counters = new Map<string, number>();
    await recordFailureAndMaybeLearn(TEST_DIR, 'bash', 'ECONNREFUSED', counters);
    await recordFailureAndMaybeLearn(TEST_DIR, 'git', 'ECONNREFUSED', counters);
    await recordFailureAndMaybeLearn(TEST_DIR, 'read', 'ECONNREFUSED', counters);
    // 三个不同 key，每个只出现一次——都不学习
    expect(await fs.pathExists(path.join(TEST_DIR, '.spica', 'learnings'))).toBe(false);
  });

  it('学习后计数器重置，不会重复写入', async () => {
    const counters = new Map<string, number>();
    for (let i = 0; i < 3; i++) {
      await recordFailureAndMaybeLearn(TEST_DIR, 'bash', 'ECONNREFUSED x', counters);
    }
    const r4 = await recordFailureAndMaybeLearn(TEST_DIR, 'bash', 'ECONNREFUSED y', counters);
    expect(r4).toBeNull();
    const learningsDir = path.join(TEST_DIR, '.spica', 'learnings');
    expect((await fs.readdir(learningsDir)).length).toBe(1);
  });
});
