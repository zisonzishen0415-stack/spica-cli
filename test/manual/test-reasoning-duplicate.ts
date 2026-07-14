import { SpicaAgent } from './src/agent';
import { EventEmitter } from 'events';

// 监听所有reasoning事件
const agent = new SpicaAgent();
const reasoningEvents: any[] = [];

agent.on('reasoning', (data) => {
  reasoningEvents.push({
    time: Date.now(),
    content: data.content,
    length: data.content.length
  });
  console.log(`[REASONING] #${reasoningEvents.length}: ${data.content.substring(0, 30)}...`);
});

agent.on('message', (msg) => {
  console.log(`[MESSAGE] ${msg.role}: ${msg.content?.substring(0, 50)}...`);
  console.log(`[TOTAL_REASONING_EVENTS] ${reasoningEvents.length}`);
  
  // 分析重复
  const uniqueContents = new Set(reasoningEvents.map(e => e.content));
  console.log(`[UNIQUE_REASONING] ${uniqueContents.size}`);
  
  if (uniqueContents.size < reasoningEvents.length) {
    console.log('[DUPLICATE_FOUND]');
    reasoningEvents.forEach((e, i) => {
      const duplicates = reasoningEvents.filter(other => other.content === e.content);
      if (duplicates.length > 1) {
        console.log(`  Event ${i}: ${e.content.substring(0, 20)} appears ${duplicates.length} times`);
      }
    });
  }
});

await agent.init();
await agent.runLoop('思考一下为什么天空是蓝色的');

console.log('\n=== SUMMARY ===');
console.log(`Total reasoning events: ${reasoningEvents.length}`);
console.log(`Unique reasoning: ${new Set(reasoningEvents.map(e => e.content)).size}`);
console.log(`Has duplicates: ${new Set(reasoningEvents.map(e => e.content)).size < reasoningEvents.length}`);