// 开工位置检查（git 状态检测）
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { execa } from 'execa';
import { getGitState, ensureCleanWorktree } from '../gitState';

const TEST_DIR = path.join(os.tmpdir(), 'spica-test-gitstate');
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

describe('getGitState', () => {
  beforeEach(async () => {
    await fs.ensureDir(TEST_DIR);
  });

  afterEach(async () => {
    for (let i = 0; i < 5; i++) {
      try { await fs.remove(TEST_DIR); break; }
      catch { await new Promise(r => setTimeout(r, 250)); }
    }
  });

  it('非 git 目录返回 isRepo=false（不抛异常）', async () => {
    const s = await getGitState(TEST_DIR);
    expect(s.isRepo).toBe(false);
  });

  it('git 仓库返回分支与干净状态', async () => {
    await gitInit(REPO);
    const s = await getGitState(REPO);
    expect(s.isRepo).toBe(true);
    expect(s.branch).toBe('main');
    expect(s.dirtyCount).toBe(0);
  });

  it('检测脏工作区数量', async () => {
    await gitInit(REPO);
    await fs.writeFile(path.join(REPO, 'a.ts'), 'x');
    await fs.writeFile(path.join(REPO, 'b.ts'), 'y');
    const s = await getGitState(REPO);
    expect(s.dirtyCount).toBe(2);
  });

  it('检测 index.lock 存在（独立目录避免污染其他用例）', async () => {
    const lockRepo = path.join(TEST_DIR, 'lockrepo');
    await gitInit(lockRepo);
    await fs.writeFile(path.join(lockRepo, '.git', 'index.lock'), '');
    const s = await getGitState(lockRepo);
    expect(s.hasIndexLock).toBe(true);
    // 清理锁，避免影响同一目录的其他用例
    await fs.remove(path.join(lockRepo, '.git', 'index.lock')).catch(() => {});
  });

  it('列出其他 worktree', async () => {
    await gitInit(REPO);
    await execa('git', ['worktree', 'add', path.join(TEST_DIR, 'wt-feature'), '-b', 'feature-x'], { cwd: REPO });
    const s = await getGitState(REPO);
    expect(s.worktrees.length).toBeGreaterThanOrEqual(1);
    expect(s.worktrees.some(w => w.includes('wt-feature'))).toBe(true);
  });
});

describe('ensureCleanWorktree', () => {
  beforeEach(async () => {
    await fs.ensureDir(TEST_DIR);
  });

  afterEach(async () => {
    for (let i = 0; i < 5; i++) {
      try { await fs.remove(TEST_DIR); break; }
      catch { await new Promise(r => setTimeout(r, 250)); }
    }
  });

  it('干净工作区返回 ok', async () => {
    await gitInit(REPO);
    const r = await ensureCleanWorktree(REPO);
    expect(r.ok).toBe(true);
  });

  it('脏工作区返回警告（不自动提交）', async () => {
    await gitInit(REPO);
    await fs.writeFile(path.join(REPO, 'dirty.ts'), 'x');
    const r = await ensureCleanWorktree(REPO);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('dirty.ts');
  });
});
