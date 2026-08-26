import fs from 'fs-extra';
import { resolvePath } from '../helpers';
import type { ToolResult } from '../helpers';

// 大文件读取保护（USER-PROBLEM-ANALYSIS B5）：
// 超 MAX_LINES 自动截断 + 提示 offset/limit 分页，防止巨型文件
// （如 4874 行的 CatalogBeta.tsx）整文件灌进 context。
const MAX_LINES = 2000;

export async function executeFileRead(args: Record<string, unknown>): Promise<ToolResult> {
  const readPath = resolvePath(args.path as string);
  const content = await fs.readFile(readPath, 'utf-8');
  const lines = content.split('\n');
  const lineCount = lines.length;

  const offset = typeof args.offset === 'number' ? args.offset : args.offset ? Number(args.offset) : 1;
  const limit = typeof args.limit === 'number' ? args.limit : args.limit ? Number(args.limit) : MAX_LINES;

  const start = Math.max(0, Math.min(offset - 1, lineCount));
  const maxEnd = Math.min(lineCount, start + limit);
  const selectedLines = lines.slice(start, maxEnd);
  const truncated = maxEnd < lineCount || start > 0;

  const hint = truncated
    ? `\n[file_read truncated] ${lineCount} 行只读 ${selectedLines.length} 行（${start + 1}-${maxEnd}）。` +
      `如需继续: 传 offset=${maxEnd + 1} 或调整 limit 参数。`
    : '';

  return {
    success: true,
    output: `[${readPath}:${start + 1}-${maxEnd}] (${selectedLines.length} of ${lineCount} lines)${hint}`,
    content: selectedLines.join('\n'),
  };
}
