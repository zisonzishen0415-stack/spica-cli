#!/bin/bash
# 真实 AI Skills 调用测试

cd /home/zison/development/spica/spica-cli

echo "=== AI Skills 调用真实测试 ==="
echo ""

# 1. 构建包含 skills 信息的 system prompt
echo "1. 构建 System Prompt..."
npx tsx -e "
import { getSystemPrompt, buildSkillsSection } from './src/prompts/system';
import { listSkills } from './src/skills/index';

// 获取 skills 元数据
const skills = listSkills();
const skillsMetadata = skills.map(s => s.name + ': ' + s.description.slice(0, 50)).join('\\n');

// 构建 skills section
const skillsSection = buildSkillsSection(skillsMetadata);

console.log('Skills section preview:');
console.log(skillsSection.slice(0, 200));
console.log('...');
console.log('');
console.log('Total skills:', skills.length);
console.log('Section length:', skillsSection.length);
" 2>&1

# 2. 发送真实请求测试 AI 是否检查 skills
echo ""
echo "2. 发送请求测试 AI skill 检查..."

# 构建完整请求
REQUEST=$(npx tsx -e "
import { getSystemPrompt, buildSkillsSection } from './src/prompts/system';
import { listSkills } from './src/skills/index';

const skills = listSkills();
const skillsMetadata = skills.map(s => s.name + ': ' + s.description.slice(0, 50)).join('\\n');
const skillsSection = buildSkillsSection(skillsMetadata);

// 构建简化 system prompt 测试
const systemPrompt = getSystemPrompt();

// 发送一个典型的触发 brainstorming skill 的请求
const userMessage = 'create a hello world program';

// JSON 格式化
const messages = [
  { role: 'system', content: systemPrompt.slice(0, 2000) + skillsSection.slice(0, 500) },
  { role: 'user', content: userMessage }
];

console.log(JSON.stringify({ messages }));
" 2>&1)

echo ""
echo "Testing: 'create a hello world program'"
echo "Expected: AI should mention checking skills or invoke brainstorming"
echo ""

# 发送请求（限制 max_tokens 获取开头）
curl -s -X POST "https://coding.dashscope.aliyuncs.com/v1/chat/completions" \
  -H "Authorization: Bearer sk-sp-64b7b9f29b1942049aa3edad30818b0d" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "glm-5",
    "messages": [
      {"role": "system", "content": "You are spica. Before ANY response, you MUST check if a skill applies. Available skills: brainstorming: creative work, systematic-debugging: fix bugs. If creating something, invoke brainstorming skill first."},
      {"role": "user", "content": "create a hello world program"}
    ],
    "max_tokens": 200
  }' \
  --connect-timeout 30 2>&1 | npx tsx -e "
const input = require('fs').readFileSync('/dev/stdin', 'utf-8');
try {
  const data = JSON.parse(input);
  const content = data.choices?.[0]?.message?.content || '';
  const reasoning = data.choices?.[0]?.message?.reasoning_content || '';

  console.log('');
  console.log('AI Response (first 200 chars):');
  console.log(content.slice(0, 200));

  if (reasoning) {
    console.log('');
    console.log('AI Reasoning (first 300 chars):');
    console.log(reasoning.slice(0, 300));
  }

  // 检查 AI 是否提到 skills
  const combined = content + reasoning;
  const mentionsSkills = combined.match(/skill|brainstorm/i) !== null;
  console.log('');
  console.log('✓ Mentions skills:', mentionsSkills ? 'Yes' : 'No');
} catch (e) {
  console.log('Parse error:', e.message);
  console.log('Raw input:', input.slice(0, 100));
}
"

# 3. 测试另一个请求 - bug fixing
echo ""
echo "3. 测试 bug fix 请求..."
curl -s -X POST "https://coding.dashscope.aliyuncs.com/v1/chat/completions" \
  -H "Authorization: Bearer sk-sp-64b7b9f29b1942049aa3edad30818b0d" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "glm-5",
    "messages": [
      {"role": "system", "content": "You are spica. Before ANY response, you MUST check if a skill applies. Available skills: brainstorming: creative work, systematic-debugging: fix bugs. If fixing bugs, invoke systematic-debugging skill first."},
      {"role": "user", "content": "fix the login timeout bug"}
    ],
    "max_tokens": 200
  }' \
  --connect-timeout 30 2>&1 | npx tsx -e "
const input = require('fs').readFileSync('/dev/stdin', 'utf-8');
try {
  const data = JSON.parse(input);
  const content = data.choices?.[0]?.message?.content || '';
  const reasoning = data.choices?.[0]?.message?.reasoning_content || '';

  console.log('');
  console.log('AI Response:');
  console.log(content.slice(0, 150));

  if (reasoning) {
    console.log('');
    console.log('Reasoning:');
    console.log(reasoning.slice(0, 200));
  }

  const combined = content + reasoning;
  const mentionsDebug = combined.match(/skill|debug|systematic/i) !== null;
  console.log('');
  console.log('✓ Mentions debugging:', mentionsDebug ? 'Yes' : 'No');
} catch (e) {
  console.log('Error:', e.message);
}
"

echo ""
echo "=== AI Skills 调用测试完成 ==="