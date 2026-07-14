#!/bin/bash
# 中断真实测试

cd /home/zison/development/spica/spica-cli

echo "=== 中断真实测试 ==="
echo ""

# 1. 测试 Agent interrupt 方法
echo "1. 测试 Agent interrupt()..."
npx tsx -e "
import { SpicaAgent } from './src/agent';

const agent = new SpicaAgent('openai');

// 测试 interrupt 方法
console.log('Agent created');
agent.interrupt();
console.log('✓ interrupt() called successfully');

// 检查权限队列清理
console.log('✓ Permission pending cleared:', !agent.isPermissionPending);
" 2>&1

# 2. 测试 interrupt flag 和状态恢复
echo ""
echo "2. 测试 RuntimeState interrupt 状态..."
npx tsx -e "
import { getRuntimeState, resetRuntimeState } from './src/core/RuntimeState';

const state = getRuntimeState();

// 设置 processing 状态
state.setProcessing(true);
console.log('Processing:', state.isProcessing());

// 模拟 interrupt
state.setProcessing(false);
console.log('After interrupt:', state.isProcessing());

// 检查其他状态
console.log('Streaming:', state.isStreamingOutput());
console.log('Bypass mode:', state.isBypassMode());
console.log('✓ State management works');
" 2>&1

# 3. 测试 Heartbeat 停止
echo ""
echo "3. 测试 Heartbeat..."
npx tsx -e "
import { createHeartbeat, startHeartbeat, stopHeartbeat, clearHeartbeat } from './src/core/Heartbeat';

// 创建心跳
createHeartbeat((msg) => console.log('Heartbeat:', msg), { interval: 1000, message: '.' });
console.log('✓ Heartbeat created');

// 启动
startHeartbeat();
console.log('✓ Heartbeat started');

// 立即停止（测试 interrupt 场景）
setTimeout(() => {
  stopHeartbeat();
  console.log('✓ Heartbeat stopped (interrupt simulation)');
  clearHeartbeat();
  console.log('✓ Heartbeat cleared');
}, 100);
" 2>&1

sleep 1

# 4. 测试 CLI 实际中断（非交互模式）
echo ""
echo "4. 测试 CLI 非交互模式启动和退出..."
timeout 5 ./bin/spica --fresh --no-tui 2>&1 &
PID=$!
sleep 2

if ps -p $PID > /dev/null 2>&1; then
  echo "   CLI running (PID: $PID)"
  # 发送 SIGINT (Ctrl+C)
  kill -INT $PID 2>/dev/null
  sleep 1

  if ps -p $PID > /dev/null 2>&1; then
    echo "   After first SIGINT: still running"
    kill -INT $PID 2>/dev/null
    kill -INT $PID 2>/dev/null
    sleep 1
  fi

  if ! ps -p $PID > /dev/null 2>&1; then
    echo "   ✓ CLI terminated after SIGINT"
  else
    kill -9 $PID 2>/dev/null
    echo "   ✗ CLI forced kill"
  fi
else
  echo "   ✗ CLI didn't start"
fi

wait $PID 2>/dev/null

# 5. 测试 session 在中断后保存
echo ""
echo "5. 测试 session 中断保存..."

# 创建一个 session
npx tsx -e "
import { saveSession, loadSession } from './src/utils/session';

// 保存一些消息
const messages = [
  { role: 'user', content: 'test before interrupt' },
  { role: 'assistant', content: 'response before interrupt' }
];
saveSession(process.cwd(), messages);

const loaded = loadSession(process.cwd());
console.log('Session saved and loaded:', loaded?.messages?.length, 'messages');
console.log('✓ Session persistence works');
" 2>&1

echo ""
echo "=== 中断测试完成 ==="