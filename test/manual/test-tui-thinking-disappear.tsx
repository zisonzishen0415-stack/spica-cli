import React from 'react';
import { render } from 'ink-testing-library';
import { App } from './src/tui/App';
import { EventEmitter } from 'events';

console.log('=== TUI thinking消失诊断 ===\n');

const { stdout, stdin, unmount } = render(<App />);

// 监听reasoning事件
const originalEmit = EventEmitter.prototype.emit;
EventEmitter.prototype.emit = function(event, ...args) {
  if (event === 'reasoning') {
    console.log(`[EMIT_REASONING] ${(args[0] as any).content?.substring(0, 30)}`);
  }
  return originalEmit.call(this, event, ...args);
};

stdin.write('思考一下');
stdin.write('\r');

// 等待并检查frames
await new Promise(r => setTimeout(r, 5000));

const frames = stdout.frames;
console.log('\n=== Frames分析 ===');
frames.forEach((f, i) => {
  const hasThink = f.includes('[思]');
  const hasReady = f.includes('Ready');
  const hasRunning = f.includes('Running');
  console.log(`Frame ${i}: Think=${hasThink} Ready=${hasReady} Running=${hasRunning}`);
  if (hasThink) {
    console.log(`  内容: ${f.substring(0, 100)}`);
  }
});

console.log('\n=== 结论 ===');
const thinkFrames = frames.filter(f => f.includes('[思]'));
console.log(`有[思]的frames: ${thinkFrames.length}`);
console.log(`thinking是否消失: ${thinkFrames.length === 0 || thinkFrames[thinkFrames.length-1].includes('Ready') || !thinkFrames[thinkFrames.length-1].includes('[思]')}`);

unmount();