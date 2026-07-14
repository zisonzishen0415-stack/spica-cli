# Spica vs成熟Coding Agent对比

## 核心差异矩阵

| 功能 | Claude Code | OpenCode | Cursor | Spica | 优先级 |
|------|------------|----------|--------|-------|--------|
| **持久记忆** | 全局+项目 | 项目级 | 项目级 | 项目级 | ✅已有 |
| **并行执行** | ✓ Task工具 | ✓ 并行agent | ✓ 多文件 | ✅最多3个 | ✅已有 |
| **分屏显示** | ✓ 可选 | ✗ | ✗ | ✗ 后续 | P2 |
| **工具系统** | 30+ | 25+ | 15+ | 25+ | ✅已有 |
| **流式输出** | ✓ 实时 | ✓ 实时 | ✓ 实时 | ✓ 100ms节流 | ✅已有 |
| **Thinking** | ✓ 可隐藏 | ✓ 可隐藏 | ✗ | ✓ 段落显示 | ✅已有 |
| **输入流畅** | ✓ React优化 | ✓ 节流 | ✓ 原生 | ✓ 节流 | ✅已有 |
| **错误恢复** | ✓ 自动 | ✓ 手动 | ✓ 自动 | ✗ 手动 | P1 |
| **上下文理解** | ✓ 全项目 | ✓ 文件级 | ✓ 文件级 | ✓ .spica.md | ✅已有 |
| **Skills系统** | ✓ superpowers | ✗ | ✗ | ✗ | P2 |

## 缺失的关键功能

### 1. 错误自动恢复（P1）
**成熟agent做法:**
- Claude Code: 失败后自动重试，调整策略
- OpenCode: 提供修复建议，用户选择

**Spica现状:** 错误后停止，需手动重新输入

**实现方案:**
```typescript
// useAgent.ts添加
catch (error) {
  if (error.message.includes('rate limit')) {
    // 自动等待重试
    await sleep(60000);
    return processQueue(); // 重新执行
  }
  if (error.message.includes('not found')) {
    // 提供替代方案
    setState(prev => ({
      ...prev,
      error: error.message,
      suggestions: ['使用glob搜索', '创建文件']
    }));
  }
}
```

### 2. Skills系统（P2）
**Claude Code superpowers:**
- brainstorming - 创建前探索
- systematic-debugging - 修复前分析
- verification-before-completion - 完成前验证

**Spica现状:** 无skills系统

**实现方案:**
```typescript
// src/skills/index.ts
export const skills = {
  brainstorming: {
    trigger: '创建|添加|build',
    execute: async (agent, input) => {
      await agent.runLoop(`探索需求: ${input}`);
      // 收集信息后再创建
    }
  },
  debugging: {
    trigger: '修复|bug|error',
    execute: async (agent, input) => {
      await agent.runLoop(`诊断问题: ${input}`);
    }
  }
};
```

### 3. 分屏并行显示（P2）
**Claude Code做法:**
- 多task时自动分屏
- 每个task独立box
- 完成后合并

**Spica现状:** 并行执行但不分屏显示

**实现方案:** 已设计（见上文），需实现事件监听

## 立即可用的优势

1. **输入流畅** - 100ms节流，比OpenCode更快
2. **项目记忆** - .spica/context.json，无全局污染
3. **工具完整** - 25+工具，覆盖常见场景
4. **Thinking段落** - 不碎片化，完整显示

## 下一步行动

1. **错误恢复** - 自动重试机制
2. **Skills集成** - 复用superpowers
3. **分屏UI** - 实现3任务分屏
4. **性能监控** - Token/时间统计