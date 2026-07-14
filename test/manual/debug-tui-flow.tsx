import React from 'react';
import { render } from 'ink-testing-library';
import { App } from './src/tui/App';
import fs from 'fs';

// 清理环境
fs.rmSync('~/.spica', { recursive: true, force: true });

console.log('=== TUI数据流诊断 ===\n');

const eventLog: any[] = [];

// 监听所有setState调用
const originalSetState = React.useState;
React.useState = (initial: any) => {
  const [state, setState] = originalSetState(initial);
  const tracedSetState = (newState: any) => {
    eventLog.push({
      time: Date.now(),
      type: 'setState',
      state: newState,
      prevState: state
    });
    console.log('STATE_UPDATE:', JSON.stringify({
      eventsCount: newState.events?.length,
      currentStream: newState.currentStream?.length,
      currentReasoning: newState.currentReasoning?.length,
      isRunning: newState.isRunning
    }));
    setState(newState);
  };
  return [state, tracedSetState];
};

const { stdin, stdout, unmount } = render(<App />);

console.log('1. 初始状态');
console.log(stdout.lastFrame());

stdin.write('测试输入');
console.log('\n2. 输入"测试输入"');
console.log(stdout.lastFrame());

stdin.write('\r');
console.log('\n3. 提交');
console.log(stdout.lastFrame());

setTimeout(() => {
  console.log('\n4. 等待3秒后');
  console.log(stdout.lastFrame());
  
  console.log('\n=== 事件流分析 ===');
  eventLog.forEach((log, i) => {
    console.log(`${i}. ${log.time}: events=${log.state.events?.length}, stream=${log.state.currentStream?.substring(0, 20)}, reasoning=${log.state.currentReasoning?.substring(0, 20)}`);
  });
  
  console.log('\n=== 详细事件内容 ===');
  const finalState = eventLog[eventLog.length - 1]?.state;
  if (finalState?.events) {
    finalState.events.forEach((e: any, i: number) => {
      console.log(`${i}. ${e.type}: ${e.content?.substring(0, 50) || e.toolName}`);
    });
  }
  
  unmount();
}, 3000);