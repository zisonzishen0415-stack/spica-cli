#!/usr/bin/env node
// 模拟真实场景：banner并行 + init过程

const esc = '\x1b';
const reset = '\x1b[0m';
const lines = [
  '              _)              ',
  '   __|  __ \\   |   __|   _` | ',
  ' \\__ \\  |   |  |  (     (   | ',
  ' ____/  .__/  _| \\___| \\__,_| ',
  '       _|                     ',
];

let stopSignal = false;

async function banner() {
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

  // 呼吸渐变循环（直到stopSignal）
  while (!stopSignal) {
    for (let dim = 0; dim < 6 && !stopSignal; dim++) {
      const g = 206 - dim * 15;
      const color = esc + `[38;2;0;${g};${g+3}m`;
      process.stdout.write(esc + '[5A');
      lines.forEach(line => process.stdout.write(color + line + reset + '\n'));
      await new Promise(r => setTimeout(r, 100));
    }
    for (let dim = 5; dim >= 0 && !stopSignal; dim--) {
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
}

async function init() {
  // 模拟init过程（不打印任何东西干扰banner）
  await new Promise(r => setTimeout(r, 2000));
}

async function main() {
  const bannerPromise = banner();
  await init();
  stopSignal = true;
  await bannerPromise;

  // init完成后打印信息
  process.stdout.write('glm-5 | /h for help\n');
  process.stdout.write('SUCCESS: If banner shows 5 cyan lines correctly, it works!\n');
}

main();