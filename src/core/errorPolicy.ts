// 错误策略（从 agent.ts 拆分）
// 重试判定 / 关键错误判定 / 错误建议生成——纯函数，无状态。

/** 判断错误是否可重试（网络/超时/限流/服务器错误可重试）。 */
export function isRetryableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const code = String(
    (error as { code?: unknown; status?: unknown }).code ||
      (error as { code?: unknown; status?: unknown }).status ||
      ''
  );

  // 不可重试的错误
  const nonRetryablePatterns = [
    '400', // 请求格式错误（如不支持的消息角色）
    '401', // 认证失败
    '403', // 权限不足
    '404', // 资源不存在
    'invalid',
    'unauthorized',
    'permission',
  ];

  for (const pattern of nonRetryablePatterns) {
    if (message.includes(pattern) || code === pattern) {
      return false;
    }
  }

  // 可重试的错误：网络问题、超时、速率限制、服务器错误
  const retryablePatterns = [
    'ECONNREFUSED',
    'ENOTFOUND',
    'ETIMEDOUT',
    'ECONNRESET',
    '429',
    '500',
    '502',
    '503',
    'timeout',
    'network',
    'connection',
    'rate limit',
  ];

  for (const pattern of retryablePatterns) {
    if (message.toLowerCase().includes(pattern.toLowerCase()) || code === pattern) {
      return true;
    }
  }

  // 默认：未知错误也重试（网络波动等临时问题）
  return true;
}

/** 判断工具错误是否"关键错误"（应停止整个生成循环）。 */
export function isCriticalToolError(
  toolName: string,
  result: { success: boolean; error?: string; output?: string }
): boolean {
  if (result.success) return false;

  const error = result.error || '';

  // Web 工具的特殊处理优先：网络/API 错误不应该停止整个任务
  // Agent 应该尝试其他方案或使用已有信息继续
  if (toolName === 'web_search' || toolName === 'web_fetch') {
    return false; // web 工具错误永远不 critical
  }

  // 只有 AI 调用相关的错误才是 critical
  const criticalPatterns = [
    'invalid API key',
    'authentication failed',
    'ECONNREFUSED',
    'ENOTFOUND',
    'API connection failed',
    // 注意：403/401 对于非 AI 调用不 critical（如 web 工具已在上面处理）
  ];

  for (const pattern of criticalPatterns) {
    if (error.toLowerCase().includes(pattern.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/** 生成工具错误的可操作建议。 */
export function generateErrorSuggestion(
  toolName: string,
  error: string,
  args: Record<string, unknown>
): string {
  const suggestions: Record<string, (e: string, a: Record<string, unknown>) => string> = {
    read: (e, a) =>
      e.includes('ENOENT')
        ? `File not found: ${a.path}. Try: glob to find similar files, or check path spelling.`
        : e.includes('EACCES')
          ? `Permission denied: ${a.path}. Try: check file permissions, or use different path.`
          : `Read failed. Try: check path exists, or use glob to search.`,
    write: (e, a) =>
      e.includes('EACCES')
        ? `Permission denied: ${a.path}. Try: check file permissions, or use different path.`
        : e.includes('ENOENT')
          ? `Directory not found: ${a.path}. Try: create directory first with directory_create.`
          : `Write failed. Try: check path and content, or use edit for existing files.`,
    edit: (e, a) =>
      e.includes('not found')
        ? `Text not found in file. Try: read file first to get exact text, or use smaller snippet.`
        : `Edit failed. Try: read file to verify content, or use write to overwrite.`,
    bash: (e, a) =>
      e.includes('command not found')
        ? `Command not found: ${a.command}. Try: install required tool, or use alternative command.`
        : e.includes('Permission denied')
          ? `Permission denied: ${a.command}. Try: check permissions, or use sudo if safe.`
          : e.includes('timeout')
            ? `Command timed out. Consider: detached=true, longer timeout, or break into smaller steps.`
            : `Execution failed. Try: check command syntax, or use simpler command.`,
    glob: (e, a) =>
      `Search failed: ${a.pattern}. Try: simpler pattern (e.g., *.ts), or check directory exists.`,
    grep: (e, a) => `Search failed. Try: simpler pattern, or use glob first to find files.`,
    test: (e, _a) =>
      e.includes('timeout')
        ? `Test timed out. Consider: run with longer timeout, run specific test file, or use quick validation (tsc, lint).`
        : `Test failed. Try: run single test file, or check test output for details.`,
    lint: (e, _a) =>
      e.includes('error')
        ? `Lint errors found. Try: fix errors one by one, or use format tool.`
        : `Lint failed. Try: check file syntax, or run on smaller scope.`,
    directory_list: (e, a) =>
      `Directory listing failed: ${a.path}. Try: check path exists, or use glob to search.`,
    file_delete: (e, a) =>
      `Delete failed: ${a.path}. Try: check file exists, or check permissions.`,
    file_copy: (e, a) =>
      `Copy failed. Try: check source exists: ${a.source}, or check destination path.`,
    file_move: (e, a) =>
      `Move failed. Try: check source exists: ${a.source}, or check destination permissions.`,
  };

  const baseSuggestion =
    suggestions[toolName]?.(error, args) || `Tool ${toolName} failed. Check parameters.`;

  return baseSuggestion;
}
