import { describe, it, expect } from 'vitest';
import { DEFAULT_HOOKS } from '../../utils/settings';
import { matchesMatcher } from '../index';

/**
 * P0-2 危险操作确认门（USER-PROBLEM-ANALYSIS D1）
 * 默认 hooks 必须覆盖：sudo / rm -rf（非根）/ git push --force / git reset --hard → confirm
 * 硬拦截（无确认）：rm -rf /（根目录）、--force
 * 顺序敏感：confirm 规则必须先于更宽泛的 block 规则（git push --force 在 --force 之前）。
 */

// 模拟 runPreHooks 的遍历逻辑：按顺序返回第一个匹配的 hook
function matchCommand(command: string): { action: string; message: string } | null {
  for (const hook of (DEFAULT_HOOKS!.PreToolUse || [])) {
    if (hook.matcher.tool === 'bash' && matchesMatcher('bash', { command }, hook.matcher)) {
      return { action: hook.action, message: hook.message };
    }
  }
  return null;
}

describe('DEFAULT_HOOKS 危险操作确认门', () => {
  it('sudo 需要确认', () => {
    const r = matchCommand('sudo apt install nginx');
    expect(r?.action).toBe('confirm');
  });

  it('rm -rf 非根路径需要确认', () => {
    const r = matchCommand('rm -rf /tmp/cache');
    expect(r?.action).toBe('confirm');
  });

  it('rm -rf 根目录硬拦截（无确认）', () => {
    const r = matchCommand('rm -rf /*');
    expect(r?.action).toBe('block');
    expect(r?.message).toContain('根目录');
  });

  it('git push --force 需要确认（不被 --force 的 block 抢先）', () => {
    const r = matchCommand('git push --force origin master');
    expect(r?.action).toBe('confirm');
    expect(r?.message).toContain('push --force');
  });

  it('git reset --hard 需要确认', () => {
    const r = matchCommand('git reset --hard HEAD~1');
    expect(r?.action).toBe('confirm');
    expect(r?.message).toContain('reset --hard');
  });

  it('普通命令不受影响', () => {
    expect(matchCommand('ls -la')).toBeNull();
    expect(matchCommand('npm run build')).toBeNull();
    expect(matchCommand('git status')).toBeNull();
  });

  it('其他 --force 用法仍被硬拦截', () => {
    const r = matchCommand('pip install --force-reinstall requests');
    expect(r?.action).toBe('block');
  });

  it('hook 顺序：git push --force 的 confirm 在 --force block 之前', () => {
    const hooks = (DEFAULT_HOOKS!.PreToolUse || []);
    const confirmIdx = hooks.findIndex(h => h.message.includes('push --force'));
    const blockIdx = hooks.findIndex(h => h.message.includes('--force 参数'));
    expect(confirmIdx).toBeGreaterThan(-1);
    expect(blockIdx).toBeGreaterThan(confirmIdx);
  });
});
