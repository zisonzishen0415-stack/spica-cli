import { OpenAI } from 'openai';

const client = new OpenAI({
  apiKey: 'sk-sp-64b7b9f29b1942049aa3edad30818b0d',
  baseURL: 'https://coding.dashscope.aliyuncs.com/v1',
});

console.log('=== GLM-5 API原始数据测试 ===\n');

const stream = await client.chat.completions.create({
  model: 'glm-5',
  messages: [{ role: 'user', content: 'hello' }],
  stream: true,
});

let chunkIndex = 0;
let reasoningChunks: string[] = [];
let contentChunks: string[] = [];

for await (const chunk of stream) {
  const delta = chunk.choices[0]?.delta;
  
  if (delta?.reasoning_content) {
    reasoningChunks.push(delta.reasoning_content);
    console.log(`Chunk ${chunkIndex}: reasoning="${delta.reasoning_content}"`);
  }
  
  if (delta?.content) {
    contentChunks.push(delta.content);
    console.log(`Chunk ${chunkIndex}: content="${delta.content}"`);
  }
  
  chunkIndex++;
}

console.log('\n=== 分析 ===');
console.log('总chunk数:', chunkIndex);
console.log('reasoning chunks数:', reasoningChunks.length);
console.log('content chunks数:', contentChunks.length);

console.log('\n完整reasoning:', reasoningChunks.join(''));
console.log('完整content:', contentChunks.join(''));

// 检查是否有重复
const fullReasoning = reasoningChunks.join('');
const duplicates = fullReasoning.match(/(.{5,})\1+/g);
if (duplicates) {
  console.log('\n⚠️ 发现重复模式:', duplicates);
} else {
  console.log('\n✓ 无重复');
}