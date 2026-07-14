import React from 'react';
import { render } from 'ink-testing-library';
import { App } from './src/tui/App';

console.log('测试TUI启动...');
const { stdout, stdin, unmount } = render(<App />);
console.log('输出:', stdout.lastFrame());
unmount();
console.log('✓ TUI启动成功');