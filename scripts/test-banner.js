#!/usr/bin/env node
// 独立测试脚本 - 验证banner动画效果
// 运行: node /home/zison/development/spica/spica-cli/scripts/test-banner.js

const esc = '\x1b';
const reset = '\x1b[0m';
const lines = [
  '              _)              ',
  '   __|  __ \\   |   __|   _` | ',
  ' \\__ \\  |   |  |  (     (   | ',
  ' ____/  .__/  _| \\___| \\__,_| ',
  '       _|                     ',
];

async function bannerTest() {
  // 打印空行 + 5行暗色banner
  process.stdout.write('\n');
  const dim = esc + '[38;2;0;60;63m';
  lines.forEach(line => process.stdout.write(dim + line + reset + '\n'));

  // 入场渐变
  for (let t = 1; t <= 5; t++) {
    const g = 60 + t * 35;
    const color = esc + `[38;2;0;${g};${g+3}m`;
    process.stdout.write(esc + '[5A');
    lines.forEach(line => process.stdout.write(color + line + reset + '\n'));
    await new Promise(r => setTimeout(r, 80));
  }

  // 呼吸渐变循环2次
  for (let cycle = 0; cycle < 2; cycle++) {
    // 渐暗
    for (let dim = 0; dim < 6; dim++) {
      const g = 206 - dim * 15;
      const color = esc + `[38;2;0;${g};${g+3}m`;
      process.stdout.write(esc + '[5A');
      lines.forEach(line => process.stdout.write(color + line + reset + '\n'));
      await new Promise(r => setTimeout(r, 100));
    }
    // 渐亮
    for (let dim = 5; dim >= 0; dim--) {
      const g = 206 - dim * 15;
      const color = esc + `[38;2;0;${g};${g+3}m`;
      process.stdout.write(esc + '[5A');
      lines.forEach(line => process.stdout.write(color + line + reset + '\n'));
      await new Promise(r => setTimeout(r, 100));
    }
  }

  // 最终cyan
  const cyan = esc + '[38;2;0;206;209m';
  process.stdout.write(esc + '[5A');
  lines.forEach(line => process.stdout.write(cyan + line + reset + '\n'));
  process.stdout.write('\n');

  process.stdout.write('SUCCESS: If banner shows 5 cyan lines with breathing effect, it works!\n');
}

bannerTest();