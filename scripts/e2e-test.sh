#!/bin/bash
# 端到端真实测试 - 实际运行 CLI 并验证功能

cd /home/zison/development/spica/spica-cli

echo "=== 端到端真实测试 ==="
echo ""

# 清理环境
rm -f .spica/session.json
echo "1. 环境清理完成"

# 测试 API 连接
echo ""
echo "2. API 连接测试..."
API_RESULT=$(curl -s -X POST "https://coding.dashscope.aliyuncs.com/v1/chat/completions" \
  -H "Authorization: Bearer sk-sp-64b7b9f29b1942049aa3edad30818b0d" \
  -H "Content-Type: application/json" \
  -d '{"model":"glm-5","messages":[{"role":"user","content":"ping"}],"max_tokens":5}' \
  --connect-timeout 15 2>&1)

if echo "$API_RESULT" | grep -q "choices"; then
  echo "   ✓ API 连接正常"
else
  echo "   ✗ API 连接失败"
  echo "   Response: $API_RESULT"
  exit 1
fi

# 测试 CLI 启动
echo ""
echo "3. CLI 启动测试..."
timeout 10 ./bin/spica --fresh --no-tui 2>&1 &
PID=$!
sleep 3

if ps -p $PID > /dev/null 2>&1; then
  echo "   ✓ CLI 启动成功 (PID: $PID)"
  kill $PID 2>/dev/null
  wait $PID 2>/dev/null
else
  echo "   ✗ CLI 启动失败"
fi

# 测试 session 截断功能
echo ""
echo "4. Session 截断真实测试..."
# 创建超大的 session
node -e "
const fs = require('fs');
const path = require('path');
const messages = [];
for (let i = 0; i < 200; i++) {
  messages.push({ role: 'user', content: 'A'.repeat(5000) + ' msg ' + i });
  messages.push({ role: 'assistant', content: 'Response ' + i });
}
fs.writeFileSync('.spica/session.json', JSON.stringify({
  workspacePath: process.cwd(),
  messages,
  lastActivity: new Date().toISOString()
}, null, 2));
"

ORIGINAL_SIZE=$(ls -lh .spica/session.json | awk '{print $5}')
echo "   Original session: $ORIGINAL_SIZE (200 messages, each 5000 chars)"

# 加载并保存触发截断
npx tsx -e "
import { loadSession, saveSession } from './src/utils/session';
const loaded = loadSession(process.cwd());
if (loaded && loaded.messages) {
  console.log('   Loaded:', loaded.messages.length, 'messages');
  saveSession(process.cwd(), loaded.messages);
  const after = loadSession(process.cwd());
  console.log('   After save:', after?.messages?.length, 'messages');
  if (after && after.messages[0]) {
    console.log('   First message length:', after.messages[0].content?.length);
  }
}
" 2>&1

TRUNCATED_SIZE=$(ls -lh .spica/session.json | awk '{print $5}')
echo "   Truncated session: $TRUNCATED_SIZE"

# 测试 skills 调用
echo ""
echo "5. Skills 解析测试..."
npx tsx -e "
import { parseSkillInput, getSkill, buildSkillPrompt } from './src/skills/index';

const testCases = [
  { input: '/brainstorming create auth feature', expectedSkill: 'brainstorming' },
  { input: '/systematic-debugging login timeout', expectedSkill: 'systematic-debugging' },
  { input: '/test-driven-development user service', expectedSkill: 'test-driven-development' },
  { input: '/writing-plans multi-step refactor', expectedSkill: 'writing-plans' },
];

let passed = 0;
for (const tc of testCases) {
  const parsed = parseSkillInput(tc.input);
  if (parsed && parsed.skillName === tc.expectedSkill) {
    passed++;
    const skill = getSkill(parsed.skillName);
    const prompt = buildSkillPrompt(skill!, parsed.args);
    console.log('   ✓', tc.expectedSkill, '- prompt length:', prompt.length);
  } else {
    console.log('   ✗', tc.input, '- expected:', tc.expectedSkill, 'got:', parsed?.skillName || 'null');
  }
}
console.log('   Passed:', passed, '/', testCases.length);
" 2>&1

# 测试 token 计数准确性
echo ""
echo "6. Token 计数压力测试..."
npx tsx -e "
import { TokenCounter } from './src/llm/TokenCounter';

const counter = new TokenCounter();
counter.setContextWindow(190000);

// 创建包含 toolCalls 的消息
const messages = [];
for (let i = 0; i < 100; i++) {
  messages.push({
    role: 'assistant',
    content: '',
    toolCalls: [
      { id: 'tc-' + i, name: 'file_read', arguments: { path: '/file' + i + '.txt' } },
      { id: 'tc-' + i + '-2', name: 'bash', arguments: { command: 'ls -la' } }
    ]
  });
  messages.push({ role: 'tool', content: 'result data', toolCallId: 'tc-' + i });
  messages.push({ role: 'tool', content: 'output', toolCallId: 'tc-' + i + '-2' });
}

const start = Date.now();
const tokens = counter.estimateMessages(messages);
const duration = Date.now() - start;

console.log('   Messages:', messages.length);
console.log('   Estimated tokens:', tokens);
console.log('   Usage:', Math.floor(tokens / 190000 * 100), '%');
console.log('   Duration:', duration, 'ms');
console.log('   ✓ Fast estimation:', duration < 100 ? 'Yes' : 'No');
" 2>&1

# 测试 diff 计算
echo ""
echo "7. Diff 计算测试..."
npx tsx -e "
import { computeDiff, formatDiff } from './src/cli/ui/diff';

// 新文件
const newFileDiff = computeDiff('', 'line1\\nline2\\nline3');
console.log('   New file diff:', newFileDiff.length, 'lines (all added)');

// 删除所有
const deleteDiff = computeDiff('old\\ncontent', '');
console.log('   Delete all diff:', deleteDiff.length, 'lines (all removed)');

// 修改
const changeDiff = computeDiff('old line', 'new line');
console.log('   Change diff:', changeDiff.length, 'lines');

// 大文件
const start = Date.now();
const largeDiff = computeDiff(Array(500).fill('old').join('\\n'), Array(500).fill('new').join('\\n'));
const duration = Date.now() - start;
console.log('   Large diff (500 lines):', largeDiff.length, 'lines in', duration, 'ms');
" 2>&1

echo ""
echo "=== 端到端测试完成 ==="