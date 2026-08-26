// worktree 管理（多 agent 并行隔离）
// 同一仓库多个工作目录，各占分支，共享对象库但独立 index/工作区。
// 主会话 worktree 放仓库兄弟目录（如 D:/dev/puttyon → D:/dev/puttyon-feature-x）。
import fs from 'fs';
import path from 'path';
import { execa } from 'execa';

export interface WorktreeInfo {
  path: string;
  branch: string | null;
  isCurrent: boolean;
}

/** 列出仓库全部 worktree。 */
export async function listWorktrees(workspace: string): Promise<WorktreeInfo[]> {
  try {
    const { stdout } = await execa('git', ['worktree', 'list', '--porcelain'], {
      cwd: workspace,
      reject: false,
      timeout: 8000,
    });
    const result: WorktreeInfo[] = [];
    const lines = stdout.split('\n');
    let current: Partial<WorktreeInfo> = {};
    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        if (current.path) result.push(current as WorktreeInfo);
        current = { path: line.slice('worktree '.length), branch: null, isCurrent: false };
      } else if (line.startsWith('branch refs/heads/')) {
        current.branch = line.slice('branch refs/heads/'.length);
      } else if (line === 'detached') {
        current.branch = '(detached)';
      }
    }
    if (current.path) result.push(current as WorktreeInfo);
    const wsReal = path.resolve(workspace).toLowerCase();
    for (const w of result) {
      w.isCurrent = path.resolve(w.path).toLowerCase() === wsReal;
    }
    return result;
  } catch {
    return [];
  }
}

export interface CreateResult {
  ok: boolean;
  path?: string;
  error?: string;
}

/**
 * 创建隔离 worktree：`git worktree add <defaultPath> -b <name>`。
 * 默认路径 = 仓库父目录/<name>（与仓库平级）。
 */
export async function createWorktree(
  workspace: string,
  name: string,
  customPath?: string
): Promise<CreateResult> {
  const branch = name.replace(/[^a-zA-Z0-9_-]/g, '-');
  if (!branch) return { ok: false, error: '分支名无效' };

  const wtPath = customPath || path.join(path.dirname(path.resolve(workspace)), branch);
  if (fs.existsSync(wtPath)) {
    return { ok: false, error: `目标目录已存在: ${wtPath}` };
  }

  try {
    await execa('git', ['worktree', 'add', wtPath, '-b', branch], {
      cwd: workspace,
      timeout: 15000,
    });
    return { ok: true, path: wtPath };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `worktree 创建失败: ${msg}` };
  }
}

/** 移除 worktree（先确保分支已合并或用户确认）。 */
export async function removeWorktree(
  workspace: string,
  branchOrPath: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    // 支持按分支名或路径匹配
    const wts = await listWorktrees(workspace);
    const target = wts.find(
      w => w.branch === branchOrPath || w.path === branchOrPath || path.basename(w.path) === branchOrPath
    );
    if (!target) return { ok: false, error: `未找到 worktree: ${branchOrPath}` };
    if (target.isCurrent) return { ok: false, error: '不能移除当前所在 worktree' };

    await execa('git', ['worktree', 'remove', target.path], {
      cwd: workspace,
      timeout: 15000,
    });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `移除失败（可能有未提交更改）: ${msg}` };
  }
}
