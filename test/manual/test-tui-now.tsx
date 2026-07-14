import React from 'react';
import { render } from 'ink-testing-library';
import { App } from './src/tui/App';

console.log('=== TUI完整测试 ===\n');

const { stdin, stdout, unmount } = render(<App />);

stdin.write('hello');
stdin.write('\r');

await new Promise(r => setTimeout(r, 10000));

const output = stdout.lastFrame();
console.log('\n=== 最终输出 ===');
console.log(output);

const lines = output.split('\n');
const reasoningCount = lines.filter(l => l.includes('[思]')).length;
const toolCallCount = lines.filter(l => l.includes('←')).length;
const messageCount = lines.filter(l => l.includes('Hello') || l.includes('你好')).length;

console.log('\n=== 统计 ===');
console.log('thinking行数:', reasoningCount);
console.log('tool_call行数:', toolCallCount);
console.log('message行数:', messageCount);

if (reasoningCount > 3) {
  console.log('\n⚠️ 发现thinking重复！超过3行');
}

if (toolCallCount > 5) {
  console.log('\n⚠️ 发现tool_call重复！超过5行');
}

unmount();
console.log('\n✓ 测试完成');