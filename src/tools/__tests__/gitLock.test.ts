// Git 互斥锁（USER-PROBLEM-ANALYSIS D2）
// Codex rules 实证：agent 并发 git 操作互相踩 .git/index.lock，
// 甚至用 `Remove-Item .git/index.lock` 硬删锁（危险——锁存在意味着
// 另一个 git 进程活跃，删锁会损坏仓库）。正确做法：串行化 + 等待。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { withGitLock, waitForIndexLock } from '../gitLock';

const TEST_DIR = path.join(os.tmpdir(), 'spica-test-gitlock');

describe('gitLock', () => {
  beforeEach(async () => {
    await fs.ensureDir(path.join(TEST_DIR, '.git'));
  });

  afterEach(async () => {
    for (let i = 0; i < 5; i++) {
      try { await fs.remove(TEST_DIR); break; }
      catch { await new Promise(r => setTimeout(r, 250)); }
    }
  });

  describe('withGitLock', () => {
    it('串行化并发 git 操作（无重叠执行）', async () => {
      const order: string[] = [];
      const run = async (name: string, delay: number): Promise<void> => {
        await withGitLock(async () => {
          order.push(name + '-start');
          await new Promise(r => setTimeout(r, delay));
          order.push(name + '-end');
        });
      };
      await Promise.all([run('a', 30), run('b', 5), run('c', 10)]);
      // 每个操作的 start/end 必须相邻（无交错）
      expect(order[0]).toBe('a-start');
      expect(order[1]).toBe('a-end');
      expect(order[2]).toBe('b-start');
      expect(order[3]).toBe('b-end');
      expect(order[4]).toBe('c-start');
      expect(order[5]).toBe('c-end');
    });

    it('异常不破坏锁（后续操作仍可执行）', async () => {
      await expect(
        withGitLock(async () => { throw new Error('boom'); })
      ).rejects.toThrow('boom');
      const result = await withGitLock(async () => 'ok');
      expect(result).toBe('ok');
    });
  });

  describe('waitForIndexLock', () => {
    it('无锁时立即通过', async () => {
      const r = await waitForIndexLock(TEST_DIR, 1000);
      expect(r.ok).toBe(true);
    });

    it('锁存在时等待到锁消失', async () => {
      const lockPath = path.join(TEST_DIR, '.git', 'index.lock');
      await fs.writeFile(lockPath, '');
      // 150ms 后释放锁
      setTimeout(() => fs.remove(lockPath), 150);
      const r = await waitForIndexLock(TEST_DIR, 3000);
      expect(r.ok).toBe(true);
    });

    it('锁一直存在时超时并给出提示（不删锁）', async () => {
      const lockPath = path.join(TEST_DIR, '.git', 'index.lock');
      await fs.writeFile(lockPath, '');
      const r = await waitForIndexLock(TEST_DIR, 300);
      expect(r.ok).toBe(false);
      expect(r.error).toContain('index.lock');
      // 锁文件未被删除
      expect(await fs.pathExists(lockPath)).toBe(true);
    });
  });
});
