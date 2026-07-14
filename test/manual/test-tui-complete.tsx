import React from 'react';
import { render } from 'ink-testing-library';
import { App } from './src/tui/App';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// 配置API
process.env.SPICA_OPENAI_API_KEY = 'sk-sp-64b7b9f29b1942049aa3edad30818b0d';
process.env.SPICA_OPENAI_BASE_URL = 'https://coding.dashscope.aliyuncs.com/v1';
process.env.SPICA_OPENAI_MODEL = 'glm-5';

// 清理测试环境
const TEST_DIR = '/tmp/test-tui-complete';
execSync(`rm -rf ${TEST_DIR} ~/.spica/history.json`);
execSync(`mkdir -p ${TEST_DIR}`);
process.chdir(TEST_DIR);

console.log('=== TUI完整交互测试 ===\n');

// 测试1: 启动并输入第一轮对话
console.log('--- 测试1: 第一轮对话 ---');
const { stdin, stdout, unmount } = render(<App />);

// 等待初始化
await new Promise(r => setTimeout(r, 1000));
console.log('初始化输出:', stdout.lastFrame());

// 输入第一个请求
stdin.write('创建一个简单的hello程序');
stdin.write('\r');

// 等待响应完成（增加时间）
await new Promise(r => setTimeout(r, 10000));

const frames1 = stdout.frames;
console.log('第一轮frames数:', frames1.length);
console.log('最后输出（诊断）:', stdout.lastFrame());

// 检查关键问题
const output1 = stdout.lastFrame();
const hasThinkingFragment = frames1.some(f => (f.match(/\[思\]/g) || []).length > 1);
const hasToolCall = frames1.some(f => f.includes('←'));
const hasResult = frames1.some(f => f.includes('✓'));

console.log('thinking碎片化（应该false）:', hasThinkingFragment);
console.log('有工具调用:', hasToolCall);
console.log('有结果:', hasResult);

// 检查history
const historyFile = path.join(process.env.HOME || '/tmp', '.spica', 'history.json');
if (fs.existsSync(historyFile)) {
  const history = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
  console.log('History消息数:', history.length);
} else {
  console.log('History文件不存在');
}

unmount();
console.log('\n=== 第一轮测试完成 ===');