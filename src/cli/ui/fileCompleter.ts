// @ 文件引用 fuzzy 匹配器
// 输入 @api → 搜索 workspace 中匹配的文件路径

import fastGlob from 'fast-glob';

export class FileCompleter {
  private workspace: string;
  private ignorePatterns: string[];

  constructor(workspace: string) {
    this.workspace = workspace;
    this.ignorePatterns = ['node_modules', '.git', 'dist', 'build', '*.lock', '.spica'];
  }

  // fuzzy 搜索文件
  async search(query: string, maxResults = 10): Promise<string[]> {
    if (!query) {
      // 无查询时返回最近修改的文件
      const files = await fastGlob('**/*', {
        cwd: this.workspace,
        ignore: this.ignorePatterns,
        onlyFiles: true,
        dot: false,
      });
      return files.slice(0, maxResults);
    }

    // 将查询字符转为宽松的 glob 模式
    // "api" → "**/*api*"
    // "ind.ts" → "**/*ind*.ts"
    const pattern = `**/*${query}*`;
    try {
      const files = await fastGlob(pattern, {
        cwd: this.workspace,
        ignore: this.ignorePatterns,
        onlyFiles: true,
        dot: false,
      });

      // 按匹配质量排序：精确匹配 > 前缀匹配 > 包含匹配
      const scored = files.map(f => ({
        path: f,
        score: this.scoreMatch(f, query),
      }));
      scored.sort((a, b) => b.score - a.score);

      return scored.slice(0, maxResults).map(s => s.path);
    } catch {
      return [];
    }
  }

  // 评分：越高越匹配
  private scoreMatch(filePath: string, query: string): number {
    const lower = filePath.toLowerCase();
    const q = query.toLowerCase();

    // 文件名完全匹配
    const fileName = lower.split('/').pop() || '';
    if (fileName === q) return 100;
    if (fileName.startsWith(q)) return 90;
    if (fileName.includes(q)) return 80;

    // 路径包含查询
    if (lower.includes(q)) return 60;

    // fuzzy 匹配：每个字符按顺序出现
    let qi = 0;
    for (let i = 0; i < lower.length && qi < q.length; i++) {
      if (lower[i] === q[qi]) qi++;
    }
    return qi === q.length ? 40 : 0;
  }
}
