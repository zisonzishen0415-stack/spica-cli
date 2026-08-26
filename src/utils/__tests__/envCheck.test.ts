// 环境预检（USER-PROBLEM-ANALYSIS A4/A5）
// Codex 实证：`cmake: CommandNotFoundException` 反复撞、C1088 磁盘满。
// /doctor 检测常用工具与磁盘空间，避免 agent 在缺失依赖上反复试错。
import { describe, it, expect } from 'vitest';
import { checkTool, checkDiskSpace, runEnvCheck } from '../envCheck';

describe('checkTool', () => {
  it('检测存在的工具并返回版本', async () => {
    const r = await checkTool('node', ['--version']);
    expect(r.found).toBe(true);
    expect(r.version).toMatch(/^v?\d+/);
  });

  it('检测缺失的工具（不抛异常）', async () => {
    const r = await checkTool('definitely-not-a-real-cmd-xyz', ['--version']);
    expect(r.found).toBe(false);
    expect(typeof r.hint).toBe('string');
  });
});

describe('checkDiskSpace', () => {
  it('返回可用磁盘空间 GB 数与健康状态', async () => {
    const r = await checkDiskSpace();
    expect(r.freeGB).toBeGreaterThan(0);
    expect(typeof r.warning).toBe('boolean');
    // 测试机磁盘应大于 1GB
    expect(r.freeGB).toBeGreaterThan(1);
  });
});

describe('runEnvCheck', () => {
  it('返回工具列表且 node 必然在列', async () => {
    const results = await runEnvCheck();
    const node = results.find(t => t.name === 'node');
    expect(node).toBeDefined();
    expect(node!.found).toBe(true);
    // 全部项都有 found 字段
    for (const r of results) {
      expect(typeof r.found).toBe('boolean');
    }
  });
});
