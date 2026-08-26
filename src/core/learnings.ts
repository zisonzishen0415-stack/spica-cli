import fs from 'fs-extra';
import { join } from 'path';

/**
 * Auto-extract project learnings from user corrections and repeated failures.
 *
 * Conservative extraction — only saves when patterns are unambiguous.
 * Learnings are written to .spica/learnings/YYYY-MM-DD-topic.md and
 * automatically loaded into the system prompt on next session.
 */

// Patterns that indicate a user correction
const CORRECTION_PATTERNS = [
  /^(no,?\s+)?use\s+\S+/i,
  /^(no,?\s+)?don'?t\s+use\s+\S+/i,
  /^instead[,;]?\s+use\s+\S+/i,
  /^(no,?\s+)?the\s+correct\s+(command|way|approach)\s+is/i,
  /^actually[,;]?\s+/i,
  /^that'?s\s+wrong[,;]?\s+/i,
];

/** Check if a user message looks like a correction. */
export function isCorrection(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length < 10 || trimmed.length > 500) return false;
  return CORRECTION_PATTERNS.some(p => p.test(trimmed));
}

export interface FailureRecord {
  toolName: string;
  error: string;
  count: number;
}

/**
 * Analyze tool execution history for repeated failures.
 * Returns learnings for tools that failed 3+ times with similar errors.
 */
export function extractFailureLearnings(
  failures: FailureRecord[]
): string[] {
  const learnings: string[] = [];

  for (const f of failures) {
    if (f.count >= 3) {
      learnings.push(
        `Tool "${f.toolName}" failed ${f.count} times with: ${f.error.slice(0, 200)}. ` +
        `Avoid using ${f.toolName} this way or check configuration.`
      );
    }
  }

  return learnings;
}

/**
 * Extract a topic slug from a learning text.
 */
function topicFromText(text: string): string {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2)
    .slice(0, 5);
  return words.join('-') || 'general';
}

/**
 * Save a learning to .spica/learnings/.
 *
 * Each learning is one file: YYYY-MM-DD-topic.md.
 * If a file for today with the same topic exists, it's NOT overwritten.
 */
export async function saveLearning(
  workspacePath: string,
  text: string
): Promise<boolean> {
  try {
    const learningsDir = join(workspacePath, '.spica', 'learnings');
    await fs.ensureDir(learningsDir);

    const today = new Date().toISOString().slice(0, 10);
    const topic = topicFromText(text);
    const filename = `${today}-${topic}.md`;
    const filepath = join(learningsDir, filename);

    // Don't overwrite existing learnings for the same day+topic
    if (fs.existsSync(filepath)) return false;

    const content = `# ${topic.replace(/-/g, ' ')}\n\n${text}\n`;
    await fs.writeFile(filepath, content, 'utf-8');
    return true;
  } catch {
    return false;
  }
}

// ── 重复失败自动沉淀（USER-PROBLEM-ANALYSIS E1）────────────────────────

const ERROR_CATEGORIES: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /ENOENT|no such file/i, category: 'file-not-found' },
  { pattern: /ECONNREFUSED|connection refused/i, category: 'connection-refused' },
  { pattern: /UnicodeEncodeError|gbk|code page/i, category: 'gbk-encoding' },
  { pattern: /timed out|timeout/i, category: 'timeout' },
  { pattern: /command not found|not recognized/i, category: 'command-not-found' },
  { pattern: /EACCES|permission denied/i, category: 'permission-denied' },
  { pattern: /index\.lock/i, category: 'git-index-lock' },
  { pattern: /EBUSY|resource busy/i, category: 'file-locked' },
];

/** 把错误消息归一化为类别（同一类别的不同消息共享计数）。 */
export function categorizeError(error: string): string {
  for (const { pattern, category } of ERROR_CATEGORIES) {
    if (pattern.test(error)) return category;
  }
  return 'unknown';
}

const LEARN_THRESHOLD = 3;

/**
 * 记录一次工具失败。同一 (工具, 错误类别) 模式达到阈值（3 次）时，
 * 自动把教训写入 .spica/learnings/ 并返回学习文本（否则返回 null）。
 * 学习后重置该模式计数，避免重复写入。
 */
export async function recordFailureAndMaybeLearn(
  workspacePath: string,
  toolName: string,
  error: string,
  counters: Map<string, number>
): Promise<string | null> {
  const category = categorizeError(error);
  const key = `${toolName}:${category}`;
  const count = (counters.get(key) || 0) + 1;
  counters.set(key, count);

  if (count < LEARN_THRESHOLD) return null;

  const text =
    `工具 "${toolName}" 连续 ${count} 次因 "${category}" 失败（如: ${error.slice(0, 120)}）。\n` +
    `后续遇到同类错误先检查：${category === 'connection-refused' ? '服务是否在运行、端口是否正确'
      : category === 'file-not-found' ? '路径拼写、文件是否已创建'
      : category === 'gbk-encoding' ? '输出编码（严格 UTF-8 → GBK 回退）'
      : category === 'timeout' ? '命令是否需要 detached 或更长超时'
      : category === 'command-not-found' ? '依赖是否安装、是否在 PATH（/doctor 可查）'
      : category === 'permission-denied' ? '文件权限或是否需要确认门'
      : category === 'git-index-lock' ? '是否有另一个 git 进程在运行（等待而非删锁）'
      : category === 'file-locked' ? '文件句柄是否被其他进程占用（Windows EBUSY）'
      : '错误详情与日志'}。`;

  counters.set(key, 0); // 学习后重置，防止重复写入
  await saveLearning(workspacePath, text);
  return text;
}
