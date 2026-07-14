#!/bin/bash
# 压力测试脚本 - 测试 session 截断和压缩

echo "=== 压力测试开始 ==="

# 测试 1: 大量消息截断
echo "Test 1: 创建大量消息测试截断..."
cd /home/zison/development/spica/spica-cli

# 模拟大量消息的 session
cat > .spica/session.json << 'SESSIONEOF'
{
  "workspacePath": "/home/zison/development/spica/spica-cli",
  "messages": [
SESSIONEOF

# 生成 100 条消息
for i in {1..100}; do
  echo "{\"role\":\"user\",\"content\":\"Message $i with long content: $(echo 'A' | tr 'A' 'A' | head -c 5000)\"}," >> .spica/session.json
  echo "{\"role\":\"assistant\",\"content\":\"Response $i\"}," >> .spica/session.json
done

echo "{\"role\":\"user\",\"content\":\"Final message\"}" >> .spica/session.json
echo "]," >> .spica/session.json
echo "\"lastActivity\": \"$(date -Iseconds)\"" >> .spica/session.json
echo "}" >> .spica/session.json

# 检查 session 大小
echo "Session file size: $(ls -lh .spica/session.json | awk '{print $5}')"

# 启动 CLI 测试加载
timeout 15 ./bin/spica --no-tui 2>&1 &
PID=$!
sleep 5
kill $PID 2>/dev/null || true

# 检查保存后的 session 大小
echo "Session size after load/save: $(ls -lh .spica/session.json 2>/dev/null | awk '{print $5}')"

# 测试 2: 清空并重新测试
rm .spica/session.json 2>/dev/null

echo ""
echo "Test 2: 测试新 session..."
timeout 15 ./bin/spica --fresh --no-tui 2>&1 &
sleep 5
kill %1 2>/dev/null || true

echo ""
echo "=== 压力测试完成 ==="