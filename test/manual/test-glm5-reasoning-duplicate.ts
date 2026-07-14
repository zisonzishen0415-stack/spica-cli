import { OpenAICompatibleProvider } from './src/llm/providers/OpenAICompatible';

const provider = new OpenAICompatibleProvider({
  apiKey: 'sk-sp-64b7b9f29b1942049aa3edad30818b0d',
  baseUrl: 'https://coding.dashscope.aliyuncs.com/v1',
  model: 'glm-5',
  name: 'GLM-5',
});

const chunks: any[] = [];
provider.on('reasoning', (content) => {
  chunks.push({ time: Date.now(), content });
  console.log(`Chunk #${chunks.length}: "${content}"`);
});

provider.on('chunk', (chunk) => {
  console.log(`[STREAM] "${chunk}"`);
});

console.log('=== 测试GLM-5 reasoning重复 ===\n');

try {
  await provider.generate('思考一下为什么天空是蓝色的');
  
  console.log('\n=== 分析重复 ===');
  const uniqueChunks = new Set(chunks.map(c => c.content));
  console.log(`总chunks: ${chunks.length}`);
  console.log(`唯一chunks: ${uniqueChunks.size}`);
  console.log(`重复: ${chunks.length > uniqueChunks.size}`);
  
  if (chunks.length > uniqueChunks.size) {
    console.log('\n重复内容:');
    chunks.forEach((c, i) => {
      const duplicates = chunks.filter(other => other.content === c.content);
      if (duplicates.length > 1) {
        console.log(`  Chunk ${i}: "${c.content}" 出现${duplicates.length}次`);
      }
    });
  }
} catch (err) {
  console.error('Error:', err.message);
}