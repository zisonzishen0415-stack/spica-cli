// Compression frequency analysis
// How often will compression trigger after being compressed?

const contextWindow = 128000;  // GPT-4o
const triggerThreshold = 0.8;   // 80%

// Different target percentages
const targets = [0.4, 0.5, 0.6];

// Average tokens per turn
const avgTokensPerTurn = {
  simple: 500,       // Simple Q&A
  moderate: 1000,    // With some tool calls
  heavy: 2000,       // Many tool calls, large outputs
};

console.log('=== Compression Frequency Analysis ===\n');
console.log(`Context Window: ${contextWindow.toLocaleString()}`);
console.log(`Trigger Threshold: ${triggerThreshold * 100}% = ${Math.floor(contextWindow * triggerThreshold).toLocaleString()} tokens\n`);

for (const target of targets) {
  const targetTokens = Math.floor(contextWindow * target);
  const triggerTokens = Math.floor(contextWindow * triggerThreshold);
  const tokensUntilTrigger = triggerTokens - targetTokens;

  console.log(`--- Target: ${target * 100}% (${targetTokens.toLocaleString()} tokens) ---`);
  console.log(`Tokens until next trigger: ${tokensUntilTrigger.toLocaleString()}`);

  for (const [scenario, avgTokens] of Object.entries(avgTokensPerTurn)) {
    const turnsUntilTrigger = Math.floor(tokensUntilTrigger / avgTokens);
    console.log(`  ${scenario} (${avgTokens} tokens/turn): ~${turnsUntilTrigger} turns until next compression`);
  }
  console.log();
}

// Analysis: Does min=5 guarantee cause early re-trigger?
console.log('=== Min=5 Guarantee Impact ===\n');
console.log('When compression happens with few messages:');
console.log('- Min=5 means even if tokens exceed target, at least 5 messages retained');
console.log('- This may leave more tokens than pure percentage calculation');
console.log('\nExample: 5 messages * 1500 chars each ≈ 1875 tokens per message ≈ 7500 tokens');
console.log('Target 50% = 64,000 tokens, so 5 messages likely still under target');
console.log('But with toolCalls, 5 messages could be ~15,000 tokens');

// Simulation: 5 messages with toolCalls
const fiveMsgsWithTools = [
  { role: 'user', content: 'Question' },
  { role: 'assistant', content: 'A'.repeat(1500), toolCalls: Array(4).fill({ name: 'file_read', arguments: { path: '/file.txt' } }) },
  { role: 'tool', content: 'X'.repeat(2000), toolCallId: 'tc1' },
  { role: 'assistant', content: 'B'.repeat(1500) },
  { role: 'user', content: 'Next question' },
];

// Estimate tokens for 5 messages with toolCalls
const estimate5Msgs = 5 * 100 + // structure overhead
  1500 * 3 / 4 + // content (3 assistant messages)
  2000 / 4 + // tool result
  4 * 50; // toolCalls (4 per message * 50 tokens each)

console.log(`\nEstimated tokens for 5 messages with toolCalls: ~${Math.floor(estimate5Msgs)} tokens`);
console.log(`This is ${Math.floor(estimate5Msgs / contextWindow * 100)}% of context window`);

console.log('\n=== Recommendation ===');
console.log('Target 50% + min=5 is acceptable:');
console.log('- Simple scenarios: ~64+ turns before next compression');
console.log('- Heavy tool scenarios: ~19+ turns before next compression');
console.log('- This is reasonable - not too frequent');
console.log('\nIf you want even less frequent compression:');
console.log('- Option A: Increase target to 60% (but risk hitting trigger more)');
console.log('- Option B: Increase trigger threshold from 80% to 85%');