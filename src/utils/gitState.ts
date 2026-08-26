// 开工位置检查（git 状态检测）
//
// 场景：多个 spica 并行时，同一文件夹不同分支必然互相踩踏（分支是
// 工作区级状态）。此模块在会话启动时回答三个问题：
// 1. 我在哪个分支？工作区干净吗？
// 2. 有没有 index.lock（另一个 git 进程活跃）？
// 3. 这个仓库还有哪些 worktree 在并行工作？

import fs from 'fs';
import path from 'path';
import { execa } from 'execa';

export interface GitState {
  isRepo: boolean;
  branch: string | null;
  dirtyCount: number;
  dirtyFiles: string[];
  hasIndexLock: boolean;
  worktrees: string[];
}

export async function getGitState(workspace: string): Promise<GitState> {
  const empty: GitState = {
    isRepo: false,
    branch: null,
    dirtyCount: 0,
    dirtyFiles: [],
    hasIndexLock: false,
    worktrees: [],
  };

  // 快速判断是否 git 仓库（.git 存在即可，不跑 git 命令）
  if (!fs.existsSync(path.join(workspace, '.git'))) return empty;

  try {
    const [branch, status, worktrees] = await Promise.all([
      execa('git', ['branch', '--show-current'], { cwd: workspace, reject: false, timeout: 5000 }),
      execa('git', ['status', '--porcelain'], { cwd: workspace, reject: false, timeout: 5000 }),
      execa('git', ['worktree', 'list', '--porcelain'], { cwd: workspace, reject: false, timeout: 5000 }),
    ]);

    const dirtyFiles = status.stdout
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean);

    // worktree list --porcelain: "worktree <path>\nHEAD <sha>\nbranch refs/heads/x"
    const wtPaths: string[] = [];
    const wtLines = worktrees.stdout.split('\n');
    for (let i = 0; i < wtLines.length; i++) {
      if (wtLines[i].startsWith('worktree ')) {
        wtPaths.push(wtLines[i].slice('worktree '.length));
      }
    }

    return {
      isRepo: true,
      branch: branch.stdout.trim() || null,
      dirtyCount: dirtyFiles.length,
      dirtyFiles: dirtyFiles.slice(0, 10),
      hasIndexLock: fs.existsSync(path.join(workspace, '.git', 'index.lock')),
      worktrees: wtPaths,
    };
  } catch {
    return empty;
  }
}

export interface CleanCheck {
  ok: boolean;
  message?: string;
  state?: GitState;
}

/**
 * 开工检查：分支 + 脏工作区 + index.lock + 并行 worktree。
 * 脏工作区只警告不自动提交（提交是用户决策）。
 */
export async function ensureCleanWorktree(workspace: string): Promise<CleanCheck> {
  const state = await getGitState(workspace);
  if (!state.isRepo) return { ok: true, state };

  const warnings: string[] = [];
  if (state.dirtyCount > 0) {
    warnings.push(
      `⚠ ${state.dirtyCount} 个未提交更改（${state.dirtyFiles.slice(0, 3).join(', ')}...）——建议先提交或 stash 再开始新任务，避免切换分支时丢失。`
    );
  }
  if (state.hasIndexLock) {
    warnings.push(`⚠ .git/index.lock 存在——另一个 git 进程可能活跃，先确认无并发操作。`);
  }
  if (state.worktrees.length > 1) {
    warnings.push(
      `ℹ 仓库有 ${state.worktrees.length} 个 worktree 并行（${state.worktrees.map(w => path.basename(w)).join(', ')}）——各占独立分支，互不影响。`
    );
  }

  if (warnings.length === 0) {
    return { ok: true, state };
  }
  return { ok: false, message: warnings.join('\n'), state };
}
