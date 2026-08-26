// 环境预检（USER-PROBLEM-ANALYSIS A4/A5）
// Codex 日志实证：`cmake: CommandNotFoundException` 反复出现、JUCE 编译
// C1088 磁盘满。agent 在缺失依赖/磁盘耗尽上反复试错的成本极高，
// `/doctor` 让用户/模型一眼看到环境短板。

import { execa } from 'execa';
import fs from 'fs';
import os from 'os';

export interface ToolStatus {
  name: string;
  found: boolean;
  version?: string;
  hint?: string;
}

export interface DiskStatus {
  freeGB: number;
  warning: boolean;
}

const TOOL_CHECKS: Array<{ name: string; args: string[]; hint: string }> = [
  { name: 'node', args: ['--version'], hint: 'Node.js 是 spica 运行基础' },
  { name: 'npm', args: ['--version'], hint: 'npm 缺失则无法安装前端依赖' },
  { name: 'git', args: ['--version'], hint: 'git 缺失则无法做版本管理' },
  { name: 'python', args: ['--version'], hint: 'python 缺失则无法跑 Python 项目/脚本' },
  { name: 'java', args: ['-version'], hint: 'java 缺失则无法编译 Spring Boot 后端' },
  { name: 'mvn', args: ['-version'], hint: 'mvn 缺失则无法构建 Maven 项目' },
  { name: 'cmake', args: ['--version'], hint: 'cmake 缺失则无法构建 C/C++ 项目（JUCE 等）' },
  { name: 'docker', args: ['--version'], hint: 'docker 缺失则无法启动容器化服务' },
];

/** 检测单个工具：存在返回版本，缺失返回提示（不抛异常）。 */
export async function checkTool(
  name: string,
  args: string[]
): Promise<ToolStatus> {
  try {
    const { stdout, stderr, exitCode } = await execa(name, args, {
      timeout: 8000,
      reject: false,
      // 保留原始字节，避免 GBK 版本输出乱码
      encoding: 'buffer',
    } as never);
    const decode = (b: unknown): string => {
      if (Buffer.isBuffer(b)) return b.toString('utf-8').trim();
      if (b instanceof Uint8Array) return Buffer.from(b).toString('utf-8').trim();
      return String(b ?? '').trim();
    };
    const version = decode(stdout) || decode(stderr) || '';
    // Windows 上不存在的命令不抛异常（cmd 报错文本是 GBK 乱码，非空但无数字）
    // 版本号必然含数字——用 exitCode + 数字双重判定
    if (exitCode !== 0 && !/\d/.test(version)) {
      return { name, found: false, hint: `${name} 未安装或不在 PATH 中` };
    }
    // java -version 输出到 stderr 且带引号，清洗
    return { name, found: true, version: version.replace(/"/g, '').split('\n')[0] };
  } catch {
    return { name, found: false, hint: `${name} 未安装或不在 PATH 中` };
  }
}

/** 检查工作磁盘可用空间（GB）。 */
export async function checkDiskSpace(): Promise<DiskStatus> {
  try {
    let freeBytes = 0;
    if (process.platform === 'win32') {
      // wmic 已废弃（Windows 11 输出为空），用 PowerShell
      const driveLetter = process.cwd().split(':')[0];
      const { stdout } = await execa(
        'powershell',
        ['-NoProfile', '-Command', `(Get-PSDrive ${driveLetter}).Free`],
        { timeout: 8000, reject: false }
      );
      freeBytes = parseInt(stdout.trim(), 10) || 0;
    } else {
      const { stdout } = await execa('df', ['-k', '/'], { timeout: 8000, reject: false });
      const lines = stdout.split('\n');
      if (lines.length > 1) {
        const parts = lines[1].trim().split(/\s+/);
        freeBytes = (parseInt(parts[3] || '0', 10) || 0) * 1024;
      }
    }
    const freeGB = freeBytes / (1024 * 1024 * 1024);
    return { freeGB, warning: freeGB >= 0 && freeGB < 2 };
  } catch {
    return { freeGB: -1, warning: false };
  }
}

/** 全量环境预检：工具清单 + 磁盘。 */
export async function runEnvCheck(): Promise<ToolStatus[]> {
  const results: ToolStatus[] = [];
  for (const t of TOOL_CHECKS) {
    results.push(await checkTool(t.name, t.args));
  }
  const disk = await checkDiskSpace();
  results.push({
    name: 'disk',
    found: disk.freeGB >= 0,
    version: disk.freeGB >= 0 ? `${disk.freeGB.toFixed(1)} GB free` : 'unknown',
    hint: disk.warning ? '可用磁盘 < 2GB，编译/下载可能失败' : undefined,
  });
  return results;
}

export { os as _os };
