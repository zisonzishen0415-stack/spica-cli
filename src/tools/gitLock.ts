// Git 互斥锁（USER-PROBLEM-ANALYSIS D2）
//
// Codex rules 实证：agent 并发/重复 git 操作互相踩 .git/index.lock，
// 甚至用 `Remove-Item .git/index.lock` 硬删锁。删锁是危险的——锁存在
// 意味着另一个 git 进程活跃，删锁可能损坏仓库。正确策略：
// 1. 同一进程内所有 git 操作串行（withGitLock）
// 2. 检测到 index.lock 时等待其消失，超时才报错（waitForIndexLock）

import fs from 'fs';
import path from 'path';

// 模块级互斥队列：同一时间只有一个 git 操作在执行
let gitQueue: Promise<unknown> = Promise.resolve();

/** 以互斥方式执行 git 操作（进程内串行）。 */
export async function withGitLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = gitQueue.then(fn, fn);
  // 队列吞掉错误，由调用方处理
  gitQueue = result.catch(() => undefined);
  return result;
}

export interface IndexLockResult {
  ok: boolean;
  error?: string;
}

/**
 * 等待 .git/index.lock 消失。锁存在 = 另一个 git 进程活跃，
 * 绝不删锁，只等待；超时报错并提示可能原因。
 */
export async function waitForIndexLock(
  repoPath: string,
  timeoutMs: number = 10000
): Promise<IndexLockResult> {
  const lockPath = path.join(repoPath, '.git', 'index.lock');
  if (!fs.existsSync(lockPath)) {
    return { ok: true };
  }

  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await new Promise(r => setTimeout(r, 100));
    if (!fs.existsSync(lockPath)) {
      return { ok: true };
    }
  }

  return {
    ok: false,
    error:
      `git index.lock 在 ${Math.round(timeoutMs / 1000)}s 内未释放（${lockPath}）。` +
      `另一个 git 进程可能正在运行（本 agent 或外部终端）。` +
      `请等待其完成；切勿手动删除 index.lock，否则可能损坏仓库。`,
  };
}
