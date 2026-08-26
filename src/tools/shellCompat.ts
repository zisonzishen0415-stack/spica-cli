// Shell 兼容层（USER-PROBLEM-ANALYSIS A1/A2）
//
// Windows 无 Git Bash 时 bash 工具 fallback 到 PowerShell，bash 习语
// （2>/dev/null、/dev/null 重定向）会直接报错——Codex 日志实证：
// `out-file : Could not find a part of the path 'D:\dev\null'`。
// 此模块提供：轻量语法翻译 + 输出编码自适应。

import { getBashOrFallback } from '../utils/platform';

export type ShellType = 'bash' | 'powershell' | 'cmd';

/** 当前 bash 工具实际使用的 shell 类型。 */
export function detectShellType(): ShellType {
  const { shell } = getBashOrFallback();
  const lower = shell.toLowerCase();
  if (lower.includes('bash')) return 'bash';
  if (lower.includes('powershell') || lower.includes('pwsh')) return 'powershell';
  return 'cmd';
}

/** 命令是否含 PowerShell 不支持的 bash 专属语法。 */
export function hasBashOnlySyntax(command: string): boolean {
  return /(^|\s)\d?[<>]\s*\/dev\/null/.test(command) || /\s\/dev\/null(\s|$)/.test(command);
}

export interface TranslationResult {
  command: string;
  translated: boolean;
  notes: string[];
}

/**
 * 把常见的 bash 重定向习语翻译为 PowerShell 等价写法。
 * 只处理无歧义的高频模式，绝不猜测复杂语法：
 * - `2>/dev/null` / `2> /dev/null` → `2>$null`（丢弃 stderr）
 * - `>/dev/null` / `> /dev/null`  → `>$null`（丢弃 stdout）
 * - `< /dev/null`                 → `< $null`
 */
export function translateBashToPowerShell(command: string): TranslationResult {
  if (!hasBashOnlySyntax(command)) {
    return { command, translated: false, notes: [] };
  }

  let cmd = command;
  const notes: string[] = [];

  // fd 数字 + 重定向符 + 可选空格 + /dev/null
  // fd=2 → stderr 丢弃；fd 缺省/1 → stdout 丢弃；保留原始空格结构
  cmd = cmd.replace(/(\d)?(>\s*)\/dev\/null/g, (m, fd: string | undefined, sp: string) => {
    if (fd === '2') {
      notes.push('stderr redirect → 2>$null');
      return `2${sp}$null`;
    }
    if (fd === undefined || fd === '1') {
      notes.push('stdout redirect → >$null');
      return `${sp}$null`;
    }
    return m; // 其他 fd（3 等）不翻译，避免误伤
  });

  // < /dev/null（stdin 来自空）
  cmd = cmd.replace(/(<\s*)\/dev\/null/g, (_m, sp: string) => {
    notes.push('stdin from /dev/null → <$null');
    return `${sp}$null`;
  });

  // 裸 /dev/null 引用（如参数位置）——替换为 $null
  cmd = cmd.replace(/\s\/dev\/null(\s|$)/g, ' $null$1');

  return { command: cmd, translated: true, notes };
}

/**
 * 解码命令输出：优先严格 UTF-8；失败回退 GBK（Windows 控制台默认代码页
 * 936 输出中文时是 GBK 字节，UTF-8 解码会产生乱码）。
 */
export function decodeOutput(buf: Buffer): string {
  if (buf.length === 0) return '';
  try {
    // 严格 UTF-8：遇到非法字节抛错
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    // 回退：GBK（Windows 936）→ 再回退宽松 UTF-8
    try {
      return new TextDecoder('gbk').decode(buf);
    } catch {
      return buf.toString('utf-8');
    }
  }
}
