// /worktree — 多 agent 并行隔离工作区管理
// /worktree                 → 列出全部 worktree
// /worktree <name>          → 创建隔离 worktree（仓库父目录/<name>）并切换过去
// /worktree remove <name>   → 移除 worktree
import path from 'path';
import { COLORS } from '../../cli/ui/colors';
import { createWorktree, listWorktrees, removeWorktree } from '../../utils/worktree';
import type { SlashHandler } from './types';

export const worktreeHandler: SlashHandler = async (args, ctx) => {
  const parts = args.trim().split(/\s+/);
  const sub = parts[0];
  const workspace = ctx.agent.getWorkspacePath();

  // /worktree — 列出
  if (!sub) {
    const wts = await listWorktrees(workspace);
    ctx.screen.appendScroll(COLORS.primary.bold('\nWorktrees\n'));
    ctx.screen.appendScroll(COLORS.muted('─'.repeat(60) + '\n'));
    if (wts.length === 0) {
      ctx.screen.appendScroll(COLORS.muted('  不是 git 仓库或无可列 worktree\n\n'));
      return;
    }
    for (const w of wts) {
      const marker = w.isCurrent ? COLORS.success('●') : COLORS.muted('○');
      const branch = w.branch ? COLORS.secondary(`[${w.branch}]`) : '';
      ctx.screen.appendScroll(`  ${marker} ${branch} ${COLORS.muted(w.path)}\n`);
    }
    ctx.screen.appendScroll('\n  /worktree <name> 创建并切换 | /worktree remove <name> 移除\n\n');
    return;
  }

  // /worktree remove <name>
  if (sub === 'remove') {
    const target = parts[1];
    if (!target) {
      ctx.screen.appendScroll(COLORS.warning('\nUsage: /worktree remove <branch-or-path>\n'));
      return;
    }
    const r = await removeWorktree(workspace, target);
    if (r.ok) {
      ctx.screen.appendScroll(COLORS.success(`\n[OK] worktree 已移除: ${target}\n\n`));
    } else {
      ctx.screen.appendScroll(COLORS.warning(`\n${r.error}\n\n`));
    }
    return;
  }

  // /worktree create <name> [path] — 显式创建（不切换）
  if (sub === 'create') {
    const name = parts[1];
    if (!name) {
      ctx.screen.appendScroll(COLORS.warning('\nUsage: /worktree create <name> [path]\n'));
      return;
    }
    const r = await createWorktree(workspace, name, parts[2]);
    if (r.ok) {
      ctx.screen.appendScroll(COLORS.success(`\n[OK] worktree 已创建: ${r.path}\n`));
      ctx.screen.appendScroll(COLORS.muted(`  在另一个终端: cd ${r.path} && spica\n\n`));
    } else {
      ctx.screen.appendScroll(COLORS.warning(`\n${r.error}\n\n`));
    }
    return;
  }

  // /worktree <name> — 创建并切换
  const name = sub;
  const r = await createWorktree(workspace, name, parts[1] || undefined);
  if (!r.ok) {
    ctx.screen.appendScroll(COLORS.warning(`\n${r.error}\n\n`));
    return;
  }

  ctx.screen.appendScroll(COLORS.success(`\n[OK] worktree 已创建: ${r.path}（分支 ${name}）\n`));
  ctx.screen.appendScroll(COLORS.muted('  切换工作区...\n'));

  try {
    await ctx.agent.switchWorkspace(r.path!);
    ctx.screen.appendScroll(COLORS.success(`  已切换到新工作区: ${path.basename(r.path!)}\n`));
    ctx.screen.appendScroll(COLORS.muted(`  当前分支: ${name} | 新 session 已开始（历史已清空）\n\n`));
    ctx.updateStatusBar();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.screen.appendScroll(COLORS.warning(`  切换失败: ${msg}（worktree 已创建，可手动 cd ${r.path}）\n\n`));
  }
};
