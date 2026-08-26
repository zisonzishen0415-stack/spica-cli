// 大文件读取保护（USER-PROBLEM-ANALYSIS B5）
// CatalogBeta.tsx 4874 行、TryonResult.tsx 3668 行——整文件进 context
// 既浪费 token 又稀释注意力。超长自动截断 + offset/limit 分页。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { executeFileRead } from '../impl/file_read';
import { setWorkspace } from '../helpers';

const TEST_DIR = path.join(os.tmpdir(), 'spica-test-fileread');

async function writeLines(name: string, count: number): Promise<string> {
  const p = path.join(TEST_DIR, name);
  const content = Array.from({ length: count }, (_, i) => `line-${i + 1}`).join('\n');
  await fs.writeFile(p, content, 'utf-8');
  return p;
}

describe('file_read 大文件保护', () => {
  beforeEach(async () => {
    await fs.ensureDir(TEST_DIR);
    setWorkspace(TEST_DIR);
  });

  afterEach(async () => {
    setWorkspace(process.cwd());
    for (let i = 0; i < 5; i++) {
      try { await fs.remove(TEST_DIR); break; }
      catch { await new Promise(r => setTimeout(r, 250)); }
    }
  });

  it('小文件完整读取（不受影响）', async () => {
    const p = await writeLines('small.ts', 10);
    const r = await executeFileRead({ path: p });
    expect(r.success).toBe(true);
    expect(r.content).toContain('line-1');
    expect(r.content).toContain('line-10');
  });

  it('超 2000 行自动截断并提示', async () => {
    const p = await writeLines('big.ts', 2500);
    const r = await executeFileRead({ path: p });
    expect(r.success).toBe(true);
    expect(r.content).toContain('line-1');
    expect(r.content).toContain('line-2000');
    expect(r.content).not.toContain('line-2500');
    expect(r.output).toContain('truncated');
    expect(r.output).toContain('offset');
  });

  it('limit 参数控制读取行数', async () => {
    const p = await writeLines('mid.ts', 100);
    const r = await executeFileRead({ path: p, limit: 30 });
    expect(r.content).toContain('line-1');
    expect(r.content).toContain('line-30');
    expect(r.content).not.toContain('line-31');
  });

  it('offset + limit 组合分页', async () => {
    const p = await writeLines('page.ts', 100);
    const r = await executeFileRead({ path: p, offset: 40, limit: 20 });
    expect(r.content).toContain('line-40');
    expect(r.content).toContain('line-59');
    expect(r.content).not.toContain('line-39');
    expect(r.content).not.toContain('line-60');
  });

  it('offset 超出文件范围不崩溃', async () => {
    const p = await writeLines('short.ts', 5);
    const r = await executeFileRead({ path: p, offset: 999 });
    expect(r.success).toBe(true);
    expect(r.content).toBe('');
  });

  it('大文件 + offset 组合也受截断保护', async () => {
    const p = await writeLines('big2.ts', 3000);
    const r = await executeFileRead({ path: p, offset: 1500 });
    // 从 1500 行起最多读 2000 行 → 读到 3500，但文件只有 3000 → 全读（未超限）
    expect(r.content).toContain('line-1500');
    expect(r.content).toContain('line-3000');
  });
});
