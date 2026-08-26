// 只读保护区（USER-PROBLEM-ANALYSIS D1）
//
// jch 项目实证：agent 自动化操作曾覆盖真实素材（2026-08-07 污染教训）。
// 只读路径必须机制级硬拦截，不能依赖提示词约定。
//
// 配置：`.spica/settings.json`（项目）或 `~/.spica/settings.json`（全局）
// ```json
// { "readonlyPaths": ["samples/", "*.JCH", "data.txt"] }
// ```
// 匹配语义：
// - `dir/` 或 `dir` → 目录前缀（含子目录）
// - `*.ext` → 文件名后缀
// - 含 `*` 的路径 → glob（* 匹配单段内任意字符）
// - 无 `*` → 精确文件或目录前缀

import fs from 'fs';
import os from 'os';
import path from 'path';

const isWindows = process.platform === 'win32';

/** 读取只读配置（全局 + 项目合并，项目优先追加）。 */
export function loadReadonlyPaths(workspace: string): string[] {
  const patterns: string[] = [];
  for (const base of [path.join(os.homedir(), '.spica', 'settings.json'), path.join(workspace, '.spica', 'settings.json')]) {
    try {
      if (fs.existsSync(base)) {
        const cfg = JSON.parse(fs.readFileSync(base, 'utf-8'));
        if (Array.isArray(cfg?.readonlyPaths)) {
          patterns.push(...cfg.readonlyPaths.map((p: unknown) => String(p)));
        }
      }
    } catch {
      // 损坏配置不崩溃——安全默认是"无保护"，由上层保守处理
    }
  }
  return patterns;
}

/** 把用户模式编译为匹配函数（针对 workspace 内相对路径）。 */
function compilePattern(pattern: string): (relPath: string) => boolean {
  const p = pattern.replace(/\\/g, '/');
  const hasGlob = p.includes('*');

  // 目录前缀模式：`samples/` 或 `samples`
  if (!hasGlob) {
    const dirLike = p.endsWith('/') ? p : p + '/';
    return (rel: string) => {
      const r = rel.replace(/\\/g, '/').toLowerCase();
      const d = dirLike.toLowerCase();
      return r === p.toLowerCase() || r.startsWith(d);
    };
  }

  // glob 模式：* 匹配 [^/]*（单段内）
  const escaped = p
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*');
  const re = new RegExp(`^${escaped}$`, 'i');
  if (!p.includes('/')) {
    // 纯文件名模式（如 *.JCH）：匹配任意目录下的 basename
    return (rel: string) => {
      const base = rel.replace(/\\/g, '/').split('/').pop() || '';
      return re.test(base);
    };
  }
  return (rel: string) => re.test(rel.replace(/\\/g, '/'));
}

/** 目标路径（相对或绝对）是否命中只读规则。 */
export function isPathReadonly(workspace: string, targetPath: string): boolean {
  const abs = path.isAbsolute(targetPath) ? targetPath : path.resolve(workspace, targetPath);
  const rel = path.relative(workspace, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return false; // workspace 之外由 resolvePath 负责
  }
  const patterns = loadReadonlyPaths(workspace);
  return patterns.some(p => compilePattern(p)(rel));
}

/** 写操作守卫：返回拒绝原因（null = 允许写）。 */
export function assertWritable(workspace: string, targetPath: string): string | null {
  if (!isPathReadonly(workspace, targetPath)) return null;
  return `写入被拒绝：${targetPath} 在只读保护区（.spica/settings.json readonlyPaths）。如需修改请先调整配置。`;
}
