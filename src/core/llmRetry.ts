// LLM 调用重试（从 agent.ts 拆分）
// 指数退避（2s→120s），支持中断信号，可重试判定由调用方注入。
// 独立函数而非类方法——依赖只有 InterruptError 与 emit 回调。

import type { InterruptError as InterruptErrorType } from '../agent';

export class RetryInterruptError extends Error {
  constructor(message = 'Interrupted by user') {
    super(message);
    this.name = 'InterruptError';
  }
}

export interface RetryEmitter {
  emit(event: string, data: unknown): unknown;
}

/**
 * 带重试的 LLM 调用（参考 Claude Code 等 coding agent 的重试策略）。
 * 指数退避 2s, 4s, 8s... 上限 120s；不可重试错误立即抛出；
 * 中断信号（ESC ESC）在任何阶段即时中止。
 */
export async function callLLMWithRetry<T>(
  operation: (signal?: AbortSignal) => Promise<T>,
  operationName: string,
  emit: (event: string, data: unknown) => void,
  isRetryable: (error: unknown) => boolean,
  maxRetries: number = 10,
  signal?: AbortSignal
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // 检查中断信号
    if (signal?.aborted) {
      throw new RetryInterruptError('Interrupted by user');
    }

    try {
      // Pass signal to operation
      return await operation(signal);
    } catch (error: unknown) {
      // InterruptError: don't retry, propagate immediately
      if (
        error instanceof Error &&
        (error.name === 'InterruptError' || error instanceof RetryInterruptError)
      ) {
        throw error;
      }

      lastError = error instanceof Error ? error : new Error(String(error));

      // 最后一次尝试不再重试
      if (attempt === maxRetries) {
        break;
      }

      // 检查中断信号
      if (signal?.aborted) {
        throw new RetryInterruptError('Interrupted by user after error');
      }

      // 检查是否可重试（认证等错误直接抛出）
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (!isRetryable(error)) {
        emit('error_suggestion', {
          tool: operationName,
          error: errorMsg,
          suggestion: `Error not retryable, user needs to handle: ${errorMsg}`,
        });
        throw error;
      }

      if (signal?.aborted) {
        throw new RetryInterruptError('Interrupted by user before retry');
      }

      // 指数退避：2s, 4s, 8s, 16s, 32s, 64s, 120s...（最大120秒）
      const delay = Math.min(2000 * Math.pow(2, attempt), 120000);
      emit('retry_attempt', {
        operation: operationName,
        attempt: attempt + 1,
        maxRetries,
        delay,
        error: errorMsg,
      });

      // Single setTimeout with AbortSignal support for interrupt checking.
      // Avoids Date.now() polling loop which is fragile with fake timers in tests.
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(resolve, delay);
        if (signal) {
          signal.addEventListener(
            'abort',
            () => {
              clearTimeout(timeout);
              reject(new RetryInterruptError('Interrupted by user during retry delay'));
            },
            { once: true }
          );
        }
      });

      // Double-check: if signal was already aborted before the listener was registered,
      // the above listener won't fire — check here.
      if (signal?.aborted) {
        throw new RetryInterruptError('Interrupted by user during retry delay');
      }
    }
  }

  // If signal was aborted during the last attempt, prefer InterruptError
  if (signal?.aborted) {
    throw new RetryInterruptError('Interrupted by user');
  }
  throw lastError;
}
