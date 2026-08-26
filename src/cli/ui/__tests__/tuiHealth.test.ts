// TUI 健康测试——输入框边界与多行粘贴（TUI-REVIEW-REPORT 潜在问题 #1/#3）
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ScreenManager } from '../screenManager';

// 静默 writeStdout
vi.mock('../../utils/logger', () => ({ default: vi.fn() }));

function makeScreen(): ScreenManager {
  const screen = new ScreenManager();
  screen.state.terminalWidth = 80;
  screen.state.terminalHeight = 24;
  screen.state.statusRow = 22;
  return screen;
}

describe('TUI 输入健康', () => {
  let screen: ScreenManager;

  beforeEach(() => {
    screen = makeScreen();
  });

  describe('calcInputLines 上限（潜在问题 #1）', () => {
    it('超长单行输入不无限占用屏幕', () => {
      screen.state.inputBuffer[0] = 'x'.repeat(2000);
      const lines = screen['calcInputLines']();
      expect(lines).toBeLessThanOrEqual(5);
    });

    it('大量逻辑行输入不无限占用屏幕', () => {
      screen.state.inputBuffer[0] = Array.from({ length: 50 }, () => 'line').join('\n');
      const lines = screen['calcInputLines']();
      expect(lines).toBeLessThanOrEqual(5);
    });

    it('短输入不受影响', () => {
      screen.state.inputBuffer[0] = 'hello';
      expect(screen['calcInputLines']()).toBe(1);
    });

    it('updateLayout 后状态行不越界', () => {
      screen.state.inputBuffer[0] = 'y'.repeat(3000);
      screen['updateLayout']();
      // statusRow = terminalHeight - inputLines - 1 ≥ 18（留足输入区）
      expect(screen.state.statusRow).toBeGreaterThanOrEqual(screen.state.terminalHeight - 6);
      expect(screen.state.scrollBottom).toBeGreaterThan(0);
    });
  });

  describe('多行粘贴（潜在问题 #3）', () => {
    it('粘贴含换行内容保留结构', () => {
      screen.handlePaste('line1\nline2\nline3');
      expect(screen.state.inputBuffer[0]).toBe('line1\nline2\nline3');
    });

    it('多行粘贴后光标在末尾（含换行符计数）', () => {
      screen.handlePaste('ab\ncd');
      // graphemes: a b \n c d = 5
      expect(screen.state.cursorCol).toBe(5);
    });

    it('粘贴到已有内容中间（单行）', () => {
      screen.state.inputBuffer[0] = 'hello';
      screen.state.cursorCol = 2;
      screen.handlePaste('XY');
      expect(screen.state.inputBuffer[0]).toBe('heXYllo');
      expect(screen.state.cursorCol).toBe(4);
    });

    it('多行粘贴到已有内容中间', () => {
      screen.state.inputBuffer[0] = 'ab';
      screen.state.cursorCol = 1;
      screen.handlePaste('X\nY');
      expect(screen.state.inputBuffer[0]).toBe('aX\nYb');
    });

    it('restoreCursor 对多行内容不抛异常', () => {
      screen.state.inputBuffer[0] = 'line1\nline2\nline3';
      screen.state.cursorCol = 8; // 在第二行
      expect(() => screen.restoreCursor()).not.toThrow();
    });
  });
});
