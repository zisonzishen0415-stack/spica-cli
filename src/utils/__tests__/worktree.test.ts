// worktree 管理测试
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { execa } from 'execa';
import { createWorktree, listWorktrees, removeWorktree } from '../worktree';

const TEST_DIR = path.join(os.tmpdir(), 'spica-test-worktree');
const REPO = path.join(TEST_DIR, 'repo');

async function gitInit(dir: string): Promise<void> {
  await fs.ensureDir(dir);
  await execa('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  await execa('git', ['config', 'user.email', 't@t.com'], { cwd: dir });
  await execa('git', ['config', 'user.name', 't'], { cwd: dir });
  await fs.writeFile(path.join(dir, 'readme.md'), 'hello');
  await execa('git', ['add', '.'], { cwd: dir });
  await execa('git', ['commit', '-q', '-m', 'init'], { cwd: dir });
}

describe('worktree', () => {
  beforeEach(async () => {
    await fs.ensureDir(TEST_DIR);
  });

  afterEach(async () => {
    // 先移除残留 worktree 再删目录（git 会锁住 worktree 目录）
    try {
      const { listWorktrees: lw } = await import('../worktree');
      for (const w of await lw(REPO)) {
        if (!w.isCurrent) {
          await execa('git', ['worktree', 'remove', w.path, '--force'], { cwd: REPO }).catch(() => {});
        }
      }
    } catch { /* ignore */ }
    for (let i = 0; i < 5; i++) {
      try { await fs.remove(TEST_DIR); break; }
      catch { await new Promise(r => setTimeout(r, 250)); }
    }
  });

  it('createWorktree 创建隔离分支目录（默认在仓库父目录）', async () => {
    await gitInit(REPO);
    const r = await createWorktree(REPO, 'feature-x');
    expect(r.ok).toBe(true);
    expect(r.path).toBe(path.join(TEST_DIR, 'feature-x'));
    expect(await fs.pathExists(r.path!)).toBe(true);
    // 新 worktree 在自己分支上
    const branch = (await execa('git', ['branch', '--show-current'], { cwd: r.path })).stdout.trim();
    expect(branch).toBe('feature-x');
  });

  it('listWorktrees 列出全部（标记当前）', async () => {
    await gitInit(REPO);
    await createWorktree(REPO, 'feature-x');
    const wts = await listWorktrees(REPO);
    expect(wts.length).toBe(2);
    const current = wts.find(w => w.isCurrent);
    const feature = wts.find(w => w.branch === 'feature-x');
    expect(current?.branch).toBe('main');
    expect(feature).toBeDefined();
  });

  it('重复创建同目录失败且不破坏', async () => {
    await gitInit(REPO);
    await createWorktree(REPO, 'feature-x');
    const r2 = await createWorktree(REPO, 'feature-x');
    expect(r2.ok).toBe(false);
    expect(r2.error).toContain('已存在');
  });

  it('removeWorktree 按分支名移除', async () => {
    await gitInit(REPO);
    await createWorktree(REPO, 'feature-x');
    const r = await removeWorktree(REPO, 'feature-x');
    expect(r.ok).toBe(true);
    const wts = await listWorktrees(REPO);
    expect(wts.length).toBe(1);
  });

  it('不能移除当前所在 worktree', async () => {
    await gitInit(REPO);
    await createWorktree(REPO, 'feature-x');
    const r = await removeWorktree(REPO, 'main');
    expect(r.ok).toBe(false);
  });

  it('非 git 仓库容错', async () => {
    const plain = path.join(TEST_DIR, 'plain');
    await fs.ensureDir(plain);
    expect(await listWorktrees(plain)).toEqual([]);
    const r = await createWorktree(plain, 'x');
    expect(r.ok).toBe(false);
  });
});
