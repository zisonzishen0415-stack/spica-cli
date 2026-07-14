import React from 'react';
import { Box, Text, render } from 'ink';
import TextInput from 'ink-text-input';
import { SpicaAgent } from './src/agent';

function TestApp() {
  const [input, setInput] = React.useState('');
  const [output, setOutput] = React.useState<string[]>([]);
  const [running, setRunning] = React.useState(false);
  
  const agentRef = React.useRef<SpicaAgent | null>(null);
  
  React.useEffect(() => {
    agentRef.current = new SpicaAgent();
    
    agentRef.current.on('stream', (d: any) => {
      console.log('[React stream]', d.chunk);
      setOutput(prev => [...prev, d.chunk]);
    });
    
    agentRef.current.on('message', (d: any) => {
      console.log('[React msg]', d.role);
      setOutput(prev => [...prev, `${d.role}: ${d.content?.substring(0, 20)}`]);
    });
    
    agentRef.current.on('error', (d: any) => {
      console.error('[React err]', d);
      setOutput(prev => [...prev, `ERROR: ${d.message}`]);
    });
    
    return () => agentRef.current?.removeAllListeners();
  }, []);
  
  const handleSubmit = async () => {
    if (!input.trim() || running) return;
    
    setOutput([]);
    setRunning(true);
    
    try {
      await agentRef.current?.init();
      await agentRef.current?.runLoop(input);
    } catch (e: any) {
      setOutput(prev => [...prev, `FATAL: ${e.message}`]);
    }
    
    setRunning(false);
    setInput('');
  };
  
  return (
    <Box flexDirection="column">
      <Box padding={1}>
        {output.slice(-5).map((o, i) => <Text key={i}>{o}</Text>)}
        {running && <Text color="yellow">Running...</Text>}
      </Box>
      <Box borderStyle="single">
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          placeholder="Type and Enter"
        />
      </Box>
    </Box>
  );
}

render(<TestApp />);