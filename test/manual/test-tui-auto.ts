import { render } from 'ink-testing-library';
import React from 'react';
import { App } from './src/tui/App';

console.log('=== TUI自动化测试 ===\n');

// 测试1: 启动渲染
console.log('测试1: 启动TUI...');
const { stdout, stdin, unmount } = render(<App />);
console.log('初始输出:', stdout.lastFrame());

// 测试2: 输入测试
console.log('\n测试2: 输入"hello"');
stdin.write('hello');
console.log('输入后输出:', stdout.lastFrame());

// 测试3: 提交测试
console.log('\n测试3: 提交');
stdin.write('\r');
console.log('提交后输出:', stdout.lastFrame());

// 等待响应
await new Promise(r => setTimeout(r, 2000));
const frames = stdout.frames;
console.log('\n所有frames:', frames.length);
frames.forEach((f, i) => console.log(`Frame ${i}:`, f.substring(0, 100)));

// 测试4: 检查关键功能
console.log('\n=== 测试结果 ===');
const hasRenderEventError = frames.some(f => f.includes('renderEvent is not defined'));
const hasThinking = frames.some(f => f.includes('[思]'));
const hasOutput = frames.some(f => f.includes('You:') || f.includes('hello'));

console.log('renderEvent错误:', hasRenderEventError ? '❌ FAIL' : '✅ PASS');
console.log('thinking显示:', hasThinking ? '✅ PASS' : '❌ FAIL');
console.log('输出正常:', hasOutput ? '✅ PASS' : '❌ FAIL');

unmount();
console.log('\n=== 测试完成 ===');