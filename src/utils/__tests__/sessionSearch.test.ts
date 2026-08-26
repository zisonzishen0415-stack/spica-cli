// 会话全文搜索（USER-PROBLEM-ANALYSIS E4）
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { searchSessions } from '../sessionSearch';

const TEST_DIR = path.join(os.tmpdir(), 'spica-test-search');
const SESSIONS_DIR = path.join(TEST_DIR, '.spica', 'sessions');

function makeSession(id: string, summary: string, messages: Array<Record<string, unknown>>) {
  return {
    id,
    summary,
    messages,
    lastActivity: '2026-08-20T10:00:00.000Z',
  };
}

describe('sessionSearch', () => {
  beforeEach(async () => {
    await fs.ensureDir(SESSIONS_DIR);
    await fs.writeJson(path.join(SESSIONS_DIR, 'sess_1.json'), makeSession('sess_1', '修复 OSS 双前缀问题', [
      { role: 'user', content: 'uploads 图片 404 了' },
      { role: 'assistant', content: 'OSS 双前缀兼容逻辑在 OssServiceImpl' },
    ]));
    await fs.writeJson(path.join(SESSIONS_DIR, 'sess_2.json'), makeSession('sess_2', '画册统计', [
      { role: 'user', content: 'umami 时区问题' },
      { role: 'assistant', content: 'DATE_ADD 转北京时间' },
    ]));
  });

  afterEach(async () => {
    for (let i = 0; i < 5; i++) {
      try { await fs.remove(TEST_DIR); break; }
      catch { await new Promise(r => setTimeout(r, 250)); }
    }
  });

  it('命中 summary 或消息内容', () => {
    const hits = searchSessions(TEST_DIR, 'OSS 双前缀');
    expect(hits.length).toBe(1);
    expect(hits[0].sessionId).toBe('sess_1');
  });

  it('返回带上下文的匹配片段', () => {
    const hits = searchSessions(TEST_DIR, '时区');
    expect(hits.length).toBe(1);
    expect(hits[0].matches.length).toBeGreaterThan(0);
    expect(hits[0].matches[0].snippet).toContain('时区');
    expect(hits[0].matches[0].role).toBe('user');
  });

  it('按命中数排序（命中多的在前）', () => {
    // sess_1 里 "OSS" 出现 2 次，sess_2 里 0 次
    const hits = searchSessions(TEST_DIR, 'OSS');
    expect(hits.length).toBe(1);
    expect(hits[0].sessionId).toBe('sess_1');
  });

  it('无命中返回空数组', () => {
    expect(searchSessions(TEST_DIR, '不存在的关键词xyz')).toEqual([]);
  });

  it('无会话目录返回空数组', async () => {
    await fs.remove(SESSIONS_DIR);
    expect(searchSessions(TEST_DIR, 'OSS')).toEqual([]);
  });

  it('忽略损坏的 session 文件', async () => {
    await fs.writeFile(path.join(SESSIONS_DIR, 'sess_broken.json'), '{oops');
    const hits = searchSessions(TEST_DIR, 'OSS');
    expect(hits.length).toBe(1); // 只有 sess_1
  });

  it('忽略 toolCalls 参数里的噪声匹配', async () => {
    await fs.writeJson(path.join(SESSIONS_DIR, 'sess_3.json'), makeSession('sess_3', 'x', [
      { role: 'assistant', content: '', toolCalls: [{ arguments: { command: 'echo OSS_DEBUG' } }] },
    ]));
    const hits = searchSessions(TEST_DIR, 'OSS_DEBUG');
    expect(hits.length).toBe(0);
  });
});
