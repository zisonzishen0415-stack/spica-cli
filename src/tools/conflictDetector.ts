// 工具冲突检测（从 agent.ts 拆分）
// 同一资源（文件/仓库）的写操作自动串行，无冲突的并行执行。

export function resolveAlias(toolName: string): string {
  const ALIASES: Record<string, string> = {
    'file_read': 'read',
    'file_write': 'write',
    'file_edit': 'edit',
  };
  return ALIASES[toolName] || toolName;
}

/** 提取工具调用涉及的资源路径（文件或 git:repo）。 */
export function extractResourcePath(
  toolName: string,
  args: Record<string, unknown>
): string | null {
  const resolved = resolveAlias(toolName);
  // 文件操作工具
  if (
    [
      'read',
      'write',
      'edit',
      'file_multi_edit',
      'file_delete',
      'file_copy',
      'file_move',
      'file_exists',
      'file_patch',
    ].includes(resolved)
  ) {
    return (args.path || args.file_path || args.source || args.from) as string | null;
  }
  // bash 命令中可能涉及的文件（检测 rm、mv、cp 等操作）
  if (toolName === 'bash') {
    const cmd = (args.command as string) || '';
    // 检查是否有文件修改操作
    if (/\b(rm|mv|cp|rsync)\b/.test(cmd)) {
      // 提取最后一个非选项参数作为文件路径
      const parts = cmd.split(/\s+/).filter(p => !p.startsWith('-') && !p.startsWith('--'));
      // rm/mv/cp 通常最后一个或倒数第二个参数是目标文件
      const filePath = parts[parts.length - 1] || parts[parts.length - 2];
      if (filePath && !filePath.includes('|') && !filePath.includes('>')) {
        return filePath;
      }
    }
    // 检查写入重定向
    const writeMatch = cmd.match(/>>\s*(\S+)/);
    if (writeMatch) return writeMatch[1];
    const redirectMatch = cmd.match(/>\s*(\S+)/);
    if (redirectMatch && !cmd.includes('>>') && !cmd.includes('|')) return redirectMatch[1];
  }
  // git 操作（整个仓库）
  if (toolName === 'git') {
    return 'git:repo'; // git 操作视为同资源
  }
  return null;
}

export interface ConflictToolCall {
  name: string;
  id: string;
  arguments: Record<string, unknown>;
}

/**
 * 检测工具调用冲突：返回需要顺序执行的工具组。
 * 无冲突的并行执行，同一资源的按顺序执行。
 */
export function detectToolConflicts(toolCalls: ConflictToolCall[]): {
  parallel: ConflictToolCall[];
  sequential: ConflictToolCall[][];
  conflicts: Array<{ path: string; tools: string[] }>;
} {
  const pathToTools: Map<string, ConflictToolCall[]> = new Map();
  const noConflictTools: ConflictToolCall[] = [];

  for (const tc of toolCalls) {
    const resourcePath = extractResourcePath(tc.name, tc.arguments);
    if (resourcePath) {
      if (!pathToTools.has(resourcePath)) {
        pathToTools.set(resourcePath, []);
      }
      pathToTools.get(resourcePath)!.push(tc);
    } else {
      noConflictTools.push(tc);
    }
  }

  const sequential: ConflictToolCall[][] = [];
  const parallel: ConflictToolCall[] = [...noConflictTools];
  const conflicts: Array<{ path: string; tools: string[] }> = [];

  for (const [path, tools] of pathToTools) {
    if (tools.length === 1) {
      // 单个工具操作该资源，可以并行
      parallel.push(tools[0]);
    } else {
      // 多个工具操作同一资源，需要顺序执行
      sequential.push(tools);
      conflicts.push({ path, tools: tools.map(t => t.name) });
    }
  }

  return { parallel, sequential, conflicts };
}
