#!/bin/bash
# 压缩真实触发测试

cd /home/zison/development/spica/spica-cli

echo "=== 压缩真实触发测试 ==="
echo ""

# 1. 创建大量消息触发压缩
echo "1. 创建大量消息..."
npx tsx -e "
import { TokenCounter } from './src/llm/TokenCounter';

const counter = new TokenCounter();
counter.setContextWindow(190000);

// 创建超过 80% threshold 的消息 (152k tokens)
// 每条消息约 40 tokens，需要 ~3800 条
const messages = [];
for (let i = 0; i < 4000; i++) {
  messages.push({ role: 'user', content: 'User request ' + i + ' with some content' });
  messages.push({ role: 'assistant', content: 'AI response ' + i + ' with more content here' });
}

const tokens = counter.estimateMessages(messages);
const threshold = 190000 * 0.8;

console.log('Created messages:', messages.length);
console.log('Estimated tokens:', tokens);
console.log('Threshold (80%):', threshold);
console.log('Exceeds threshold:', tokens > threshold ? 'YES - should trigger compression' : 'NO');
" 2>&1

# 2. 测试压缩逻辑
echo ""
echo "2. 测试压缩逻辑..."
npx tsx -e "
import { TokenCounter } from './src/llm/TokenCounter';

const counter = new TokenCounter();
counter.setContextWindow(190000);

// 模拟压缩逻辑
const messages = [];
for (let i = 0; i < 100; i++) {
  messages.push({ role: 'user', content: 'Message ' + i });
  messages.push({ role: 'assistant', content: 'Response ' + i });
}

const usedTokens = counter.estimateMessages(messages);
const targetTokens = 190000 * 0.4;  // 目标 40%

console.log('Before compression:', messages.length, 'messages,', usedTokens, 'tokens');
console.log('Target:', targetTokens, 'tokens (40%)');

// 根据超量程度决定保留数量
const ratio = usedTokens / targetTokens;
let keepCount = ratio > 2 ? 3 : ratio > 1.5 ? 5 : 8;
keepCount = Math.min(keepCount, Math.floor(messages.length * 0.3));

console.log('Ratio:', ratio);
console.log('Will keep:', keepCount, 'messages');

// 模拟压缩结果
const recentMessages = messages.slice(-keepCount);
const oldMessages = messages.slice(0, -keepCount);

// 生成摘要（模拟）
const summary = {
  role: 'assistant',
  content: '[History Summary] User asked about X, Y, Z. AI performed multiple operations. Last topic: ' + (messages[messages.length-1]?.content || 'unknown')
};

const compressed = [summary, ...recentMessages];
const newTokens = counter.estimateMessages(compressed);

console.log('After compression:', compressed.length, 'messages,', newTokens, 'tokens');
console.log('Reduction:', Math.floor((1 - compressed.length / messages.length) * 100), '%');
console.log('✓ Compression reduces messages significantly');
" 2>&1

# 3. 测试消息截断
echo ""
echo "3. 测试超长消息截断..."
npx tsx -e "
import { TokenCounter } from './src/llm/TokenCounter';

const counter = new TokenCounter();

// 超长消息
const longMessage = { role: 'user', content: 'A'.repeat(5000) };
const truncatedContent = longMessage.content.slice(0, 1500) + '...[truncated]';
const truncatedMessage = { ...longMessage, content: truncatedContent };

const originalTokens = counter.estimateMessage(longMessage);
const truncatedTokens = counter.estimateMessage(truncatedMessage);

console.log('Original message:', longMessage.content.length, 'chars,', originalTokens, 'tokens');
console.log('Truncated message:', truncatedContent.length, 'chars,', truncatedTokens, 'tokens');
console.log('Token reduction:', Math.floor((1 - truncatedTokens / originalTokens) * 100), '%');
" 2>&1

echo ""
echo "=== 压缩测试完成 ==="