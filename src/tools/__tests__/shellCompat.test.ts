// Shell 兼容层（USER-PROBLEM-ANALYSIS A1/A2）
// Windows 无 Git Bash 时 bash 工具 fallback 到 PowerShell，bash 习语
// （2>/dev/null 等）会直接报错。此模块负责轻量翻译与输出编码自适应。
import { describe, it, expect } from 'vitest';
import {
  translateBashToPowerShell,
  decodeOutput,
  detectShellType,
  hasBashOnlySyntax,
  type ShellType,
} from '../shellCompat';

describe('translateBashToPowerShell', () => {
  it('翻译 stderr 丢弃: 2>/dev/null → 2>$null', () => {
    const r = translateBashToPowerShell('ls 2>/dev/null');
    expect(r.command).toBe('ls 2>$null');
    expect(r.translated).toBe(true);
  });

  it('翻译 stderr 丢弃: 2> /dev/null → 2> $null', () => {
    const r = translateBashToPowerShell('grep x file 2> /dev/null');
    expect(r.command).toBe('grep x file 2> $null');
    expect(r.translated).toBe(true);
  });

  it('翻译 stdout 丢弃: > /dev/null → > $null', () => {
    const r = translateBashToPowerShell('cat a.txt > /dev/null');
    expect(r.command).toBe('cat a.txt > $null');
  });

  it('翻译尾部 /dev/null 引用', () => {
    const r = translateBashToPowerShell('cmd < /dev/null');
    expect(r.command).toBe('cmd < $null');
  });

  it('纯 PowerShell 兼容命令不翻译', () => {
    const r = translateBashToPowerShell('npm run build');
    expect(r.command).toBe('npm run build');
    expect(r.translated).toBe(false);
  });

  it('保留命令其余部分', () => {
    const r = translateBashToPowerShell('npm test 2>/dev/null && echo done');
    expect(r.command).toBe('npm test 2>$null && echo done');
  });
});

describe('hasBashOnlySyntax', () => {
  it('检测 /dev/null 引用', () => {
    expect(hasBashOnlySyntax('ls 2>/dev/null')).toBe(true);
    expect(hasBashOnlySyntax('ls')).toBe(false);
  });
});

describe('decodeOutput', () => {
  it('UTF-8 内容正常解码', () => {
    const buf = Buffer.from('hello 世界', 'utf-8');
    expect(decodeOutput(buf)).toBe('hello 世界');
  });

  it('GBK 编码内容回退解码（Windows 控制台输出）', () => {
    // "中文输出" 的 GBK 字节（Windows 默认代码页 936）
    const gbkBuf = Buffer.from([0xd6, 0xd0, 0xce, 0xc4, 0xca, 0xe4, 0xb3, 0xf6]);
    const decoded = decodeOutput(gbkBuf);
    expect(decoded).toBe('中文输出');
  });

  it('无效 UTF-8 字节不崩溃', () => {
    const bad = Buffer.from([0xff, 0xfe, 0x00, 0x41]);
    expect(() => decodeOutput(bad)).not.toThrow();
  });
});

describe('detectShellType', () => {
  it('识别三类 shell', () => {
    expect(['bash', 'powershell', 'cmd']).toContain(detectShellType());
  });

  it('返回合法 ShellType', () => {
    const t = detectShellType();
    expect(t satisfies ShellType).toBeDefined();
  });
});
