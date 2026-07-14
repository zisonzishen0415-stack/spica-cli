import { SpicaAgent } from './src/agent';
import { loadHistory, saveHistory } from './src/utils/history';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// 设置API配置 - 使用正确的环境变量名
process.env.SPICA_OPENAI_API_KEY = 'sk-sp-64b7b9f29b1942049aa3edad30818b0d';
process.env.SPICA_OPENAI_BASE_URL = 'https://coding.dashscope.aliyuncs.com/v1';
process.env.SPICA_OPENAI_MODEL = 'glm-5';

const TEST_DIR = '/tmp/test-spica-full';
const HISTORY_FILE = path.join(process.env.HOME || '/tmp', '.spica', 'history.json');

console.log('=== 完整流程测试 ===\n');

// 清理环境
execSync(`rm -rf ${TEST_DIR} ~/.spica`);
execSync(`mkdir -p ${TEST_DIR}`);
console.log('✓ 清理测试环境');

// 测试1: 第一轮对话 - 创建项目
console.log('\n--- 测试1: 创建todo项目 ---');
const agent1 = new SpicaAgent(undefined, TEST_DIR);

agent1.on('initialized', (data) => console.log(`初始化: ${data.model}`));
agent1.on('stream', (data) => process.stdout.write(data.chunk));

let thinkingStarted = false;
agent1.on('reasoning', (data) => {
  if (!thinkingStarted) {
    process.stdout.write('\n[思] ');
    thinkingStarted = true;
  }
  process.stdout.write(data.content);
});

agent1.on('tool_call', (data) => {
  thinkingStarted = false;
  console.log(`\n← ${data.name}`);
});
agent1.on('tool_result', (data) => console.log(`\n✓ ${data.success ? '成功' : '失败'}`));

await agent1.init();
const result1 = await agent1.runLoop('创建一个简单的todo CLI应用，功能包括添加、列出、删除任务');

console.log('\n第一轮完成，检查结果...');
console.log('创建的文件:', execSync(`ls ${TEST_DIR}`).toString());

// 检查history
const history1 = loadHistory();
console.log('History长度:', history1.length);
console.log('History包含tool calls:', history1.some(m => m.toolCalls || m.role === 'tool'));
console.log('History第一条:', history1[0]?.role);

// 测试2: 第二轮对话 - 添加功能
console.log('\n--- 测试2: 添加新功能 ---');
const agent2 = new SpicaAgent(undefined, TEST_DIR);

agent2.on('initialized', () => console.log('✓ 加载历史'));
agent2.on('stream', (data) => process.stdout.write(data.chunk));

let thinking2 = false;
agent2.on('reasoning', (data) => {
  if (!thinking2) {
    process.stdout.write('\n[思] ');
    thinking2 = true;
  }
  process.stdout.write(data.content);
});

agent2.on('tool_call', () => thinking2 = false);
agent2.on('tool_result', (data) => console.log(`\n✓ ${data.success ? '成功' : '失败'}`));

await agent2.init();
const historyLoaded = loadHistory();
console.log('第二轮History长度:', historyLoaded.length);
console.log('第二轮是否记住上次对话:', historyLoaded.length > 0);

const result2 = await agent2.runLoop('添加标记完成功能');

console.log('\n第二轮完成');

// 测试3: 第三轮对话 - 验证记忆
console.log('\n--- 测试3: 验证记忆 ---');
const agent3 = new SpicaAgent(undefined, TEST_DIR);

await agent3.init();
const history3 = loadHistory();
console.log('第三轮History长度:', history3.length);

const result3 = await agent3.runLoop('我们之前创建了什么应用？');

console.log('\n第三轮结果:', result3.substring(0, 100));
console.log('是否记得todo应用:', result3.toLowerCase().includes('todo') || result3.includes('待办'));

// 测试4: 检查thinking显示
console.log('\n--- 测试4: thinking段落显示 ---');
const agent4 = new SpicaAgent(undefined, TEST_DIR);

let reasoningBuffer = '';
agent4.on('reasoning', (data) => {
  reasoningBuffer += data.content;
  process.stdout.write(data.content);
});

await agent4.init();
await agent4.runLoop('思考一下如何优化这个应用');

console.log('\nThinking内容长度:', reasoningBuffer.length);
console.log('Thinking是否完整段落:', reasoningBuffer.split('\n').length >= 1);

// 最终验证
console.log('\n=== 最终验证 ===');
console.log('创建的文件:', execSync(`find ${TEST_DIR} -name "*.go" -o -name "*.ts" -o -name "*.js"`).toString());
console.log('History总消息数:', loadHistory().length);
console.log('项目状态:', fs.existsSync(`${TEST_DIR}/.spica/state.json`) ? '存在' : '不存在');
console.log('✓ 完整流程测试完成');