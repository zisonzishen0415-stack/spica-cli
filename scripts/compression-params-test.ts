// Compression parameter comparison test
// Tests different compression parameters to find optimal values

import { TokenCounter } from '../src/llm/TokenCounter';
import type { ChatMessage } from '../src/llm/providers/BaseProvider';

// Simulate compression logic with different parameters
function simulateCompression(
  messages: ChatMessage[],
  contextWindow: number,
  targetPercent: number,
  maxToolCalls: number,
  keepCountConfig: { min: number; max: number; percent: number }
): { finalMessages: ChatMessage[]; tokensBefore: number; tokensAfter: number; iterations: number } {

  const counter = new TokenCounter();
  counter.setContextWindow(contextWindow);

  const targetTokens = Math.floor(contextWindow * targetPercent);
  let currentMessages = [...messages];
  let iterations = 0;

  const tokensBefore = counter.estimateMessages(currentMessages);

  while (counter.estimateMessages(currentMessages) > targetTokens && iterations < 5) {
    iterations++;
    const usedTokens = counter.estimateMessages(currentMessages);
    const ratio = usedTokens / targetTokens;

    // Calculate keepCount
    let keepCount = ratio > 2 ? 3 : ratio > 1.5 ? 5 : 8;
    keepCount = Math.max(keepCountConfig.min, Math.min(keepCountConfig.max, Math.floor(currentMessages.length * keepCountConfig.percent)));

    const recentMessages = currentMessages.slice(-keepCount);
    const oldMessages = currentMessages.slice(0, -keepCount);

    // Truncate recent messages
    const truncatedRecent = recentMessages.map(m => {
      const truncatedContent = (m.content || '').length > 1500
        ? (m.content || '').slice(0, 1500) + '...[truncated]'
        : m.content;

      let truncatedToolCalls = m.toolCalls;
      if (m.toolCalls && m.toolCalls.length > maxToolCalls) {
        truncatedToolCalls = [
          ...m.toolCalls.slice(0, maxToolCalls),
          { id: 'truncated', name: '...[truncated]', arguments: {} }
        ];
      }

      return { ...m, content: truncatedContent, toolCalls: truncatedToolCalls };
    });

    // Simulate summary (estimate ~200 tokens)
    if (oldMessages.length > 0) {
      const summaryContent = `[History Summary] Compressed ${oldMessages.length} messages. Key topics preserved.`;
      currentMessages = [{ role: 'assistant', content: summaryContent }, ...truncatedRecent];
    } else {
      currentMessages = truncatedRecent;
    }
  }

  const tokensAfter = counter.estimateMessages(currentMessages);

  return { finalMessages: currentMessages, tokensBefore, tokensAfter, iterations };
}

// Generate realistic test messages
function generateTestMessages(scenario: 'small' | 'medium' | 'large' | 'toolHeavy' | 'extreme'): ChatMessage[] {
  const messages: ChatMessage[] = [];

  switch (scenario) {
    case 'small':
      // 50 messages, moderate content
      for (let i = 0; i < 50; i++) {
        messages.push({ role: 'user', content: `Question ${i}: ${'A'.repeat(200)}` });
        messages.push({ role: 'assistant', content: `Answer ${i}: ${'B'.repeat(300)}` });
      }
      break;

    case 'medium':
      // 100 messages, larger content (~85k tokens to trigger 80% threshold)
      for (let i = 0; i < 100; i++) {
        messages.push({ role: 'user', content: `Question ${i}: ${'A'.repeat(500)}` });
        messages.push({ role: 'assistant', content: `Answer ${i}: ${'B'.repeat(800)}` });
      }
      break;

    case 'large':
      // 200 messages, large content (~200k tokens)
      for (let i = 0; i < 200; i++) {
        messages.push({ role: 'user', content: `Question ${i}: ${'A'.repeat(1000)}` });
        messages.push({ role: 'assistant', content: `Answer ${i}: ${'B'.repeat(1500)}` });
      }
      break;

    case 'toolHeavy':
      // 80 messages with many tool calls (~100k tokens)
      for (let i = 0; i < 80; i++) {
        messages.push({ role: 'user', content: `Request ${i}` });
        messages.push({
          role: 'assistant',
          content: '',
          toolCalls: Array.from({ length: 10 }, (_, j) => ({
            id: `tc${i}_${j}`,
            name: j < 5 ? 'file_read' : 'bash',
            arguments: { path: `/file${j}.txt`, command: `cmd${j}` }
          }))
        });
        // Tool results
        for (let j = 0; j < 10; j++) {
          messages.push({ role: 'tool', content: `Result ${j}: ${'X'.repeat(400)}`, toolCallId: `tc${i}_${j}` });
        }
      }
      break;

    case 'extreme':
      // 500 messages, massive content (~500k tokens)
      for (let i = 0; i < 500; i++) {
        messages.push({ role: 'user', content: `Question ${i}: ${'A'.repeat(2000)}` });
        messages.push({ role: 'assistant', content: `Answer ${i}: ${'B'.repeat(3000)}` });
      }
      break;
  }

  return messages;
}

// Test configurations
const configs = [
  { name: 'Original (40%, no tool trunc)', target: 0.4, maxTools: 100, keep: { min: 1, max: 100, percent: 0.3 } },
  { name: 'New (50%, 3 tools)', target: 0.5, maxTools: 3, keep: { min: 3, max: 8, percent: 0.3 } },
  { name: 'Aggressive (60%, 2 tools)', target: 0.6, maxTools: 2, keep: { min: 2, max: 5, percent: 0.2 } },
  { name: 'Conservative (45%, 5 tools)', target: 0.45, maxTools: 5, keep: { min: 5, max: 10, percent: 0.4 } },
  { name: 'Balanced (50%, 4 tools, min5 max15)', target: 0.5, maxTools: 4, keep: { min: 5, max: 15, percent: 0.25 } },
];

const scenarios = ['large', 'toolHeavy', 'extreme'] as const;
const contextWindows = [128000, 200000]; // GPT-4o and Claude-3 context windows

// Run tests
console.log('=== Compression Parameter Comparison ===\n');

const resultsTable: string[][] = [];

for (const contextWindow of contextWindows) {
  console.log(`\n========== Context Window: ${contextWindow.toLocaleString()} tokens ==========\n`);

  for (const scenario of scenarios) {
    const messages = generateTestMessages(scenario);
    const counter = new TokenCounter();
    counter.setContextWindow(contextWindow);
    const totalTokens = counter.estimateMessages(messages);
    const usagePercent = Math.floor(totalTokens / contextWindow * 100);

    console.log(`--- Scenario: ${scenario} ---`);
    console.log(`Messages: ${messages.length}, Tokens: ${totalTokens.toLocaleString()} (${usagePercent}% usage)`);
    console.log(`Trigger threshold: 80% = ${Math.floor(contextWindow * 0.8).toLocaleString()} tokens`);

    if (totalTokens < contextWindow * 0.5) {
      console.log('  Tokens below all targets - no compression needed\n');
      continue;
    }

    for (const config of configs) {
      const result = simulateCompression(messages, contextWindow, config.target, config.maxTools, config.keep);
      const reduction = Math.floor((1 - result.tokensAfter / result.tokensBefore) * 100);
      const targetTokens = Math.floor(contextWindow * config.target);
      const belowTarget = result.tokensAfter < targetTokens;
      const finalPercent = Math.floor(result.tokensAfter / contextWindow * 100);

      console.log(`\n  ${config.name}:`);
      console.log(`    Final: ${result.finalMessages.length} msgs, ${result.tokensAfter.toLocaleString()} tokens (${finalPercent}%)`);
      console.log(`    Reduction: ${reduction}%, Iterations: ${result.iterations}`);
      console.log(`    Below target (${Math.floor(config.target * 100)}%): ${belowTarget ? '✓' : '✗'}`);

      resultsTable.push([
        scenario,
        contextWindow.toLocaleString(),
        config.name,
        `${result.finalMessages.length}`,
        `${finalPercent}%`,
        `${reduction}%`,
        `${result.iterations}`,
        belowTarget ? '✓' : '✗'
      ]);
    }
  }
}

console.log('\n\n=== Results Table ===');
console.log('Scenario | Context | Config | Msgs | Tokens% | Reduction | Iter | Target');
console.log('---------|---------|--------|------|---------|-----------|------|-------');
for (const row of resultsTable) {
  console.log(row.join(' | '));
}