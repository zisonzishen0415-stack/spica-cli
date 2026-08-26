// 指令健康测试——/help 文本必须与实际支持的命令一致（防止帮助脱节）
import { describe, it, expect, vi } from 'vitest';
import { helpHandler } from '../help';

// 权威命令清单：dispatchSlash 支持的所有命令
const SUPPORTED_COMMANDS = [
  'help', 'h',
  'archive', 'clear', 'reset', 'new',
  'history', 'sessions',
  'view', 'rename', 'delete',
  'summary', 'sum', 'compact', 'init',
  'queue', 'q', 'undo',
  'skill', 'mcp', 'status',
  'subagents',
  'idea', 'ideas', 'idea-done', 'idea-open', 'idea-delete',
];

// 已被禁用的功能不应出现在帮助中
const DISABLED_COMMANDS = ['switch'];

function captureHelpText(): string {
  const scrolls: string[] = [];
  const ctx = {
    screen: { appendScroll: (s: string) => scrolls.push(s) },
    agent: { getWorkspacePath: () => process.cwd() },
  } as never;
  helpHandler('', ctx as never);
  return scrolls.join('');
}

describe('指令帮助健康', () => {
  it('help 文本包含全部受支持的命令', () => {
    const text = captureHelpText();
    for (const cmd of SUPPORTED_COMMANDS) {
      expect(text, `帮助文本缺少 /${cmd}`).toContain(`/${cmd}`);
    }
  });

  it('help 文本不包含已禁用命令', () => {
    const text = captureHelpText();
    for (const cmd of DISABLED_COMMANDS) {
      expect(text, `帮助文本不应包含已禁用的 /${cmd}`).not.toContain(`/${cmd}`);
    }
  });

  it('help 文本不包含未注册的 historyMsgHandler 残留', () => {
    // historyMsgHandler 已移除（/history 走 sessionHandler）
    expect(captureHelpText()).not.toContain('/historymsg');
  });
});
