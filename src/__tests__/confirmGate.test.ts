import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SpicaAgent } from '../agent';
import { EventEmitter } from 'events';

// ── Mocks（对齐 agent.test.ts 的体系）─────────────────────────────

vi.mock('../llm/LLMClient', () => ({
  LLMClient: vi.fn().mockImplementation(() => ({
    setSystemPrompt: vi.fn(),
    setMessages: vi.fn(),
    getMessages: vi.fn().mockReturnValue([]),
    on: vi.fn(),
    generate: vi.fn(),
    continueWithAllToolResults: vi
      .fn()
      .mockResolvedValue({ content: 'done', finished: true, toolCalls: [] }),
    generateDirect: vi.fn().mockResolvedValue({ content: 'summary' }),
    checkConnection: vi.fn().mockResolvedValue({ success: true }),
    getProvider: vi.fn().mockReturnValue({ getContextWindow: vi.fn().mockReturnValue(128000) }),
    getTokenCounter: vi.fn().mockReturnValue({
      setContextWindow: vi.fn(),
      estimateMessages: vi.fn().mockReturnValue(0),
    }),
    interrupt: vi.fn(),
  })),
}));

vi.mock('../tools/index', () => ({
  executeTool: vi.fn().mockResolvedValue({ success: true, output: 'tool result' }),
  getActiveToolDefinitions: vi.fn().mockReturnValue([]),
  getAllToolDefinitions: vi.fn().mockReturnValue([]),
  setWorkspace: vi.fn(),
  getWorkspace: vi.fn().mockReturnValue(process.cwd()),
  isLazyTool: vi.fn().mockReturnValue(false),
  getToolBatchHint: vi.fn().mockImplementation((name: string) =>
    ['read', 'write', 'edit', 'file_multi_edit', 'file_patch', 'file_replace', 'file_insert'].includes(name)
      ? (name === 'read' ? 'read' : 'write')
      : 'neutral'
  ),
}));

vi.mock('../mcp/client', () => ({
  initMCP: vi.fn().mockResolvedValue(undefined),
  shutdownMCP: vi.fn(),
}));

vi.mock('../skills/index', () => ({
  initSkills: vi.fn().mockResolvedValue(undefined),
  listSkills: vi.fn().mockReturnValue([]),
}));

vi.mock('../utils/config', () => ({
  getProviderConfig: vi.fn().mockResolvedValue({
    apiKey: 'test-key',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4',
  }),
}));

vi.mock('../storage/projectState', () => ({
  loadProjectState: vi.fn().mockReturnValue(null),
  saveProjectState: vi.fn(),
  updateProjectTodos: vi.fn(),
  loadProjectContext: vi.fn().mockReturnValue([]),
  saveProjectContext: vi.fn(),
  ensureProjectDir: vi.fn(),
}));

vi.mock('../utils/projectConfig', () => ({
  loadProjectConfig: vi.fn().mockReturnValue(null),
  autoDetectProject: vi.fn().mockReturnValue({ type: 'typescript' }),
  createAgentsMd: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../utils/session', () => ({
  saveSession: vi.fn(),
}));

vi.mock('../hooks', () => ({
  runPreHooks: vi.fn(),
  runPostHooks: vi.fn().mockReturnValue(null),
}));

vi.mock('../core/verifyLoop', () => ({
  loadVerifyConfig: vi.fn().mockReturnValue({}),
  detectVerifyCommand: vi.fn().mockReturnValue(null),
  batchNeedsVerify: vi.fn().mockReturnValue(false),
  runVerify: vi.fn(),
}));

// ── 工具导入（在 mock 之后）──────────────────────────────────────
import { executeTool } from '../tools/index';
import { runPreHooks } from '../hooks';

describe('P0-2 危险操作确认门', () => {
  let agent: SpicaAgent;

  beforeEach(() => {
    vi.clearAllMocks();
    agent = new SpicaAgent('openai', '/test/workspace');
  });

  describe('无确认回调（非交互模式）', () => {
    it('confirm 动作降级为拒绝，工具不执行', async () => {
      // 需要 init 流程建立 llm — 直接手动注入 llm mock
      const { LLMClient } = await import('../llm/LLMClient');
      (agent as unknown as { llm: unknown }).llm = new LLMClient({} as never) as never;

      const genMock = (agent as unknown as { llm: { generate: ReturnType<typeof vi.fn> } }).llm!.generate;
      const continueMock = (agent as unknown as { llm: { continueWithAllToolResults: ReturnType<typeof vi.fn> } }).llm!.continueWithAllToolResults;
      genMock
        .mockResolvedValueOnce({
          content: '',
          finished: false,
          toolCalls: [{ id: 'call_1', name: 'bash', arguments: { command: 'sudo rm -rf /tmp/x' } }],
        })
        .mockResolvedValue({ content: 'done', finished: true, toolCalls: [] });

      vi.mocked(runPreHooks).mockReturnValue({
        matched: true,
        action: 'confirm',
        message: 'sudo 命令需要确认，确认继续？(y/n)',
      });

      await agent.runLoop('run the command');

      // 工具被拒绝执行
      expect(executeTool).not.toHaveBeenCalled();
      // 拒绝信息进入 tool results（LLM 下一轮能看到）
      expect(continueMock).toHaveBeenCalled();
    });

    it('emit hook_blocked 事件（含拒绝原因）', async () => {
      const { LLMClient } = await import('../llm/LLMClient');
      (agent as unknown as { llm: unknown }).llm = new LLMClient({} as never) as never;
      const genMock = (agent as unknown as { llm: { generate: ReturnType<typeof vi.fn> } }).llm!.generate;
      const continueMock = (agent as unknown as { llm: { continueWithAllToolResults: ReturnType<typeof vi.fn> } }).llm!.continueWithAllToolResults;
      genMock
        .mockResolvedValueOnce({
          content: '',
          finished: false,
          toolCalls: [{ id: 'call_1', name: 'bash', arguments: { command: 'sudo rm -rf /tmp/x' } }],
        })
        .mockResolvedValue({ content: 'done', finished: true, toolCalls: [] });
      vi.mocked(runPreHooks).mockReturnValue({
        matched: true,
        action: 'confirm',
        message: 'test confirm',
      });

      const blockedSpy = vi.fn();
      agent.on('hook_blocked', blockedSpy);

      await agent.runLoop('run the command');

      expect(blockedSpy).toHaveBeenCalledWith(
        expect.objectContaining({ tool: 'bash', reason: 'test confirm' })
      );
    });
  });

  describe('有确认回调（交互模式）', () => {
    it('用户允许时工具执行', async () => {
      const { LLMClient } = await import('../llm/LLMClient');
      (agent as unknown as { llm: unknown }).llm = new LLMClient({} as never) as never;
      const genMock = (agent as unknown as { llm: { generate: ReturnType<typeof vi.fn> } }).llm!.generate;
      const continueMock = (agent as unknown as { llm: { continueWithAllToolResults: ReturnType<typeof vi.fn> } }).llm!.continueWithAllToolResults;
      genMock
        .mockResolvedValueOnce({
          content: '',
          finished: false,
          toolCalls: [{ id: 'call_1', name: 'bash', arguments: { command: 'sudo rm -rf /tmp/x' } }],
        })
        .mockResolvedValue({ content: 'done', finished: true, toolCalls: [] });
      vi.mocked(runPreHooks).mockReturnValue({
        matched: true,
        action: 'confirm',
        message: 'sudo 命令需要确认，确认继续？(y/n)',
      });

      const confirmSpy = vi.fn().mockResolvedValue(true);
      agent.setConfirmCallback(confirmSpy);

      await agent.runLoop('run the command');

      expect(confirmSpy).toHaveBeenCalledWith('sudo 命令需要确认，确认继续？(y/n)');
      expect(executeTool).toHaveBeenCalledWith(
        'bash',
        expect.objectContaining({ command: 'sudo rm -rf /tmp/x' }),
        expect.any(Function)
      );
    });

    it('用户拒绝时工具不执行', async () => {
      const { LLMClient } = await import('../llm/LLMClient');
      (agent as unknown as { llm: unknown }).llm = new LLMClient({} as never) as never;
      const genMock = (agent as unknown as { llm: { generate: ReturnType<typeof vi.fn> } }).llm!.generate;
      const continueMock = (agent as unknown as { llm: { continueWithAllToolResults: ReturnType<typeof vi.fn> } }).llm!.continueWithAllToolResults;
      genMock
        .mockResolvedValueOnce({
          content: '',
          finished: false,
          toolCalls: [{ id: 'call_1', name: 'bash', arguments: { command: 'sudo rm -rf /tmp/x' } }],
        })
        .mockResolvedValue({ content: 'done', finished: true, toolCalls: [] });
      vi.mocked(runPreHooks).mockReturnValue({
        matched: true,
        action: 'confirm',
        message: 'test confirm',
      });

      agent.setConfirmCallback(vi.fn().mockResolvedValue(false));

      await agent.runLoop('run the command');

      expect(executeTool).not.toHaveBeenCalled();
    });

    it('确认回调抛异常时安全降级为拒绝', async () => {
      const { LLMClient } = await import('../llm/LLMClient');
      (agent as unknown as { llm: unknown }).llm = new LLMClient({} as never) as never;
      const genMock = (agent as unknown as { llm: { generate: ReturnType<typeof vi.fn> } }).llm!.generate;
      const continueMock = (agent as unknown as { llm: { continueWithAllToolResults: ReturnType<typeof vi.fn> } }).llm!.continueWithAllToolResults;
      genMock
        .mockResolvedValueOnce({
          content: '',
          finished: false,
          toolCalls: [{ id: 'call_1', name: 'bash', arguments: { command: 'sudo rm -rf /tmp/x' } }],
        })
        .mockResolvedValue({ content: 'done', finished: true, toolCalls: [] });
      vi.mocked(runPreHooks).mockReturnValue({
        matched: true,
        action: 'confirm',
        message: 'test confirm',
      });

      agent.setConfirmCallback(vi.fn().mockRejectedValue(new Error('ui gone')));

      await agent.runLoop('run the command');

      expect(executeTool).not.toHaveBeenCalled();
    });
  });
});
