// 会话全文搜索（USER-PROBLEM-ANALYSIS E4）
// 跨存档 session 检索历史知识：'上次是怎么处理 OSS 双前缀的？'
// 这类问题不再靠人肉 /history 浏览。

import fs from 'fs';
import path from 'path';

export interface SearchMatch {
  role: string;
  snippet: string;
}

export interface SessionHit {
  sessionId: string;
  summary: string;
  score: number;
  lastActivity?: string;
  matches: SearchMatch[];
}

const SNIPPET_RADIUS = 40;

/** 在文本中找关键词，返回带上下文的片段。 */
function findSnippets(text: string, queryLower: string, maxSnippets = 2): string[] {
  const lower = text.toLowerCase();
  const snippets: string[] = [];
  let idx = lower.indexOf(queryLower);
  while (idx !== -1 && snippets.length < maxSnippets) {
    const start = Math.max(0, idx - SNIPPET_RADIUS);
    const end = Math.min(text.length, idx + queryLower.length + SNIPPET_RADIUS);
    snippets.push((start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : ''));
    idx = lower.indexOf(queryLower, idx + queryLower.length);
  }
  return snippets;
}

/**
 * 搜索项目存档会话。匹配 summary 与 user/assistant 消息内容
 * （跳过 toolCalls 参数——那是工具输入不是对话知识）。
 * 返回按命中数降序的会话列表。
 */
export function searchSessions(
  workspace: string,
  query: string,
  limit: number = 10
): SessionHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const sessionsDir = path.join(workspace, '.spica', 'sessions');
  let files: string[];
  try {
    files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json') && f.startsWith('sess_'));
  } catch {
    return [];
  }

  const hits: SessionHit[] = [];
  for (const f of files) {
    try {
      const session = JSON.parse(fs.readFileSync(path.join(sessionsDir, f), 'utf-8'));
      const matches: SearchMatch[] = [];
      let score = 0;

      // summary 命中权重高
      if (typeof session.summary === 'string' && session.summary.toLowerCase().includes(q)) {
        score += 5;
        matches.push({ role: 'summary', snippet: session.summary });
      }

      // 消息内容
      for (const m of Array.isArray(session.messages) ? session.messages : []) {
        if (m.role !== 'user' && m.role !== 'assistant') continue;
        const content = typeof m.content === 'string' ? m.content : '';
        if (!content) continue;
        const snippets = findSnippets(content, q);
        if (snippets.length > 0) {
          score += snippets.length;
          for (const s of snippets.slice(0, 1)) {
            if (matches.length < 3) matches.push({ role: m.role, snippet: s });
          }
        }
      }

      if (score > 0) {
        hits.push({
          sessionId: session.id || f.replace(/\.json$/, ''),
          summary: session.summary || '',
          score,
          lastActivity: session.lastActivity,
          matches,
        });
      }
    } catch {
      // 损坏文件跳过
    }
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}
