// Idea 功能测试——存储层 + overlay 渲染（此前零覆盖）
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import {
  addIdea,
  getAllIdeas,
  getOpenIdeas,
  markDone,
  markOpen,
  deleteIdea,
} from '../ideaStore';
import { renderIdeaOverlay, IDEA_OVERLAY_ROWS } from '../../cli/ui/ideaOverlay';

const TEST_DIR = path.join(os.tmpdir(), 'spica-test-ideas');

describe('ideaStore', () => {
  beforeEach(async () => {
    await fs.ensureDir(TEST_DIR);
    await fs.remove(path.join(TEST_DIR, '.spica'));
  });

  afterEach(async () => {
    for (let i = 0; i < 5; i++) {
      try { await fs.remove(TEST_DIR); break; }
      catch { await new Promise(r => setTimeout(r, 200)); }
    }
  });

  it('addIdea 创建自增 id 的 open 想法', () => {
    const a = addIdea(TEST_DIR, 'first idea');
    const b = addIdea(TEST_DIR, 'second');
    expect(a?.id).toBe(1);
    expect(b?.id).toBe(2);
    expect(a?.status).toBe('open');
    expect(a?.text).toBe('first idea');
  });

  it('拒绝空白文本', () => {
    expect(addIdea(TEST_DIR, '   ')).toBeNull();
  });

  it('markDone / markOpen 切换状态', () => {
    const idea = addIdea(TEST_DIR, 'x');
    expect(markDone(TEST_DIR, idea!.id)).toBe(true);
    expect(getAllIdeas(TEST_DIR)[0].status).toBe('done');
    expect(markDone(TEST_DIR, 999)).toBe(false);
    expect(markOpen(TEST_DIR, idea!.id)).toBe(true);
    expect(getAllIdeas(TEST_DIR)[0].status).toBe('open');
  });

  it('deleteIdea 移除想法', () => {
    const idea = addIdea(TEST_DIR, 'y');
    expect(deleteIdea(TEST_DIR, idea!.id)).toBe(true);
    expect(getAllIdeas(TEST_DIR)).toHaveLength(0);
    expect(deleteIdea(TEST_DIR, idea!.id)).toBe(false);
  });

  it('持久化到 .spica/ideas.json（跨实例加载）', () => {
    addIdea(TEST_DIR, 'persisted');
    const reloaded = getAllIdeas(TEST_DIR);
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0].text).toBe('persisted');
  });

  it('损坏的 JSON 回退到空存储', async () => {
    await fs.ensureDir(path.join(TEST_DIR, '.spica'));
    await fs.writeFile(path.join(TEST_DIR, '.spica', 'ideas.json'), '{broken');
    expect(getAllIdeas(TEST_DIR)).toEqual([]);
  });

  it('getOpenIdeas 只返回 open', () => {
    const a = addIdea(TEST_DIR, 'a');
    addIdea(TEST_DIR, 'b');
    markDone(TEST_DIR, a!.id);
    const open = getOpenIdeas(TEST_DIR);
    expect(open).toHaveLength(1);
    expect(open[0].text).toBe('b');
  });
});

describe('renderIdeaOverlay', () => {
  it('空状态返回固定行数且含提示', () => {
    const lines = renderIdeaOverlay([]);
    expect(lines).toHaveLength(IDEA_OVERLAY_ROWS);
    expect(lines.join('\n')).toContain('No ideas yet');
  });

  it('有想法时显示计数与条目', () => {
    const lines = renderIdeaOverlay([
      { id: 1, text: 'idea one', status: 'open', createdAt: new Date().toISOString() },
      { id: 2, text: 'idea two', status: 'done', createdAt: new Date().toISOString() },
    ]);
    const text = lines.join('\n');
    expect(text).toContain('1 open');
    expect(text).toContain('[1] idea one');
    expect(text).toContain('[x]');
  });

  it('超过 4 条只显示最近 4 条', () => {
    const ideas = Array.from({ length: 6 }, (_, i) => ({
      id: i + 1,
      text: `idea ${i + 1}`,
      status: 'open' as const,
      createdAt: new Date().toISOString(),
    }));
    const text = renderIdeaOverlay(ideas).join('\n');
    expect(text).toContain('[3] idea 3');
    expect(text).not.toContain('[1] idea 1'); // 最早的两条被挤出
  });

  it('长文本按显示宽度截断', () => {
    const lines = renderIdeaOverlay([
      { id: 1, text: 'x'.repeat(300), status: 'open', createdAt: new Date().toISOString() },
    ]);
    // 行宽不超终端宽度
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(80);
    }
  });
});
