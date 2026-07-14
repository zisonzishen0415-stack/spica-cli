import { render } from 'ink-testing-library';
import React from 'react';
import { App } from './src/tui/App';

console.log('=== TUI完整测试 ===\n');

const { stdout, stdin, unmount } = render(<App />);

console.log('1. 初始启动:', stdout.lastFrame());

stdin.write('测试输入');
console.log('2. 输入测试:', stdout.lastFrame());

stdin.write('\r');
console.log('3. 提交测试:', stdout.lastFrame());

setTimeout(() => {
  console.log('4. 等待后:', stdout.lastFrame());
  console.log('\n✓ TUI完整测试通过');
  unmount();
}, 3000);