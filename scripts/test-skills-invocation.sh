#!/bin/bash
# 实际 Skills 调用测试
# 测试 AI 是否能正确识别和调用 skill

cd /home/zison/development/spica/spica-cli

echo "=== Skills 实际调用测试 ==="

# 测试1: 测试 brainstorming skill 调用
echo ""
echo "Test 1: brainstorming skill"
echo "Request: create a new feature for user authentication"
echo ""
echo "Expected: AI should invoke brainstorming skill"
echo "Actual skill content check:"
npx tsx -e "
import { getSkill, buildSkillPrompt } from './src/skills/index';
const skill = getSkill('brainstorming');
if (skill) {
  console.log('✓ brainstorming skill loaded');
  console.log('  Name:', skill.name);
  console.log('  Description:', skill.description.slice(0, 50) + '...');
  console.log('  Template length:', skill.promptTemplate?.length || 0, 'chars');
} else {
  console.log('✗ brainstorming skill NOT loaded');
}
" 2>&1

# 测试2: 测试 systematic-debugging skill 调用
echo ""
echo "Test 2: systematic-debugging skill"
echo "Request: fix the login timeout bug"
echo ""
npx tsx -e "
import { getSkill, parseSkillInput } from './src/skills/index';
const skill = getSkill('systematic-debugging');
if (skill) {
  console.log('✓ systematic-debugging skill loaded');
  console.log('  Contains debug keywords:', /debug|bug|fix/i.test(skill.promptTemplate || '') ? 'Yes' : 'No');
} else {
  console.log('✗ systematic-debugging skill NOT loaded');
}
" 2>&1

# 测试3: 测试所有14个skills都能被parseSkillInput识别
echo ""
echo "Test 3: parseSkillInput for all 14 skills"
npx tsx -e "
import { parseSkillInput, loadSkills } from './src/skills/index';

const skills = loadSkills();
const skillNames = Array.from(skills.keys());
console.log('Loaded skills:', skillNames.length);

const testInputs = [
  '/brainstorming',
  '/systematic-debugging fix bug',
  '/test-driven-development',
  '/writing-plans',
  '/requesting-code-review',
  '/executing-plans',
  '/subagent-driven-development',
  '/using-git-worktrees',
  '/using-superpowers',
  '/verification-before-completion',
  '/finishing-a-development-branch',
  '/receiving-code-review',
  '/dispatching-parallel-agents',
  '/writing-skills',
];

let passed = 0;
for (const input of testInputs) {
  const parsed = parseSkillInput(input);
  if (parsed) {
    passed++;
    console.log('✓', parsed.skillName);
  } else {
    console.log('✗', input, 'NOT recognized');
  }
}
console.log('Passed:', passed, '/', testInputs.length);
" 2>&1

# 测试4: 验证 system prompt 包含 skill 检查指令
echo ""
echo "Test 4: System prompt skill instructions"
npx tsx -e "
import { getSystemPrompt, buildSkillsSection } from './src/prompts/system';

const skillsMetadata = 'brainstorming: creative work\nsystematic-debugging: fix bugs';
const skillsSection = buildSkillsSection(skillsMetadata);

console.log('Skills section contains:');
console.log('  EXTREMELY-IMPORTANT:', skillsSection.includes('EXTREMELY-IMPORTANT') ? 'Yes' : 'No');
console.log('  SKILL-RULE:', skillsSection.includes('SKILL-RULE') ? 'Yes' : 'No');
console.log('  Mandatory check:', skillsSection.includes('MANDATORY') ? 'Yes' : 'No');
" 2>&1

echo ""
echo "=== Skills 测试完成 ==="