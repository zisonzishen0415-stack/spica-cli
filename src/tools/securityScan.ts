// 安全基线扫描（USER-PROBLEM-ANALYSIS C1-C5）
//
// puttyon 项目史实证：2026-07-30 与 2026-08-14 两次审查发现同一类问题
// （凭证明文入库、SSRF、零鉴权、api_key 明文回显）——修复后新代码又犯。
// 人肉审查追不上生成速度，本模块把常见漏洞模式变成写代码时的自动检查。

import fs from 'fs';

export type SecuritySeverity = 'critical' | 'warning';

export interface SecurityIssue {
  severity: SecuritySeverity;
  type: 'hardcoded_secret' | 'api_key_literal' | 'ssrf_url' | 'unauthenticated_write' | 'cors_open';
  line: number;
  message: string;
}

// 环境变量引用形态（排除误报）
const ENV_REF = /\$\{[^}]*\}|process\.env\.|os\.environ|env\(|import\.meta\.env/;

/** 硬编码凭据：key=value 或 key: value，值 ≥6 字符且非环境引用。 */
const SECRET_KEYS = '(password|passwd|pwd|secret|api[_-]?key|apikey|access[_-]?key|secret[_-]?key|accessKeyId|accessKeySecret|token)';

function lineNumber(content: string, idx: number): number {
  return content.slice(0, idx).split('\n').length;
}

/** 扫描单文件内容，返回安全问题列表（按行排序）。 */
export function scanContent(content: string, filePath: string): SecurityIssue[] {
  const issues: SecurityIssue[] = [];
  const ext = filePath.split('.').pop()?.toLowerCase() || '';

  const push = (
    severity: SecuritySeverity,
    type: SecurityIssue['type'],
    idx: number,
    message: string
  ) => {
    issues.push({ severity, type, line: lineNumber(content, idx), message });
  };

  // 1. 硬编码凭据（key = "value" 形态）
  const secretRe = new RegExp(`${SECRET_KEYS}\\s*[:=]\\s*["'][^"']{6,}["']`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = secretRe.exec(content)) !== null) {
    const value = m[0];
    if (!ENV_REF.test(value)) {
      push('critical', 'hardcoded_secret', m.index, `明文凭据: ${m[0].slice(0, 60)}`);
    }
  }

  // 2. API key 字面量
  const keyRe = /\b(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g;
  while ((m = keyRe.exec(content)) !== null) {
    push('critical', 'api_key_literal', m.index, `API key 字面量: ${m[1].slice(0, 12)}...`);
  }

  // 3. SSRF 启发式（Java RestTemplate 请求变量 URL）
  const ssrfRe = /restTemplate\.(getForEntity|getForObject|postForEntity|exchange)\(\s*([a-zA-Z_]\w*)\s*,/g;
  while ((m = ssrfRe.exec(content)) !== null) {
    push('warning', 'ssrf_url', m.index,
      `SSRF 风险: ${m[2]} 是用户可控 URL，RestTemplate 直接请求——请加域名白名单（如 upload.escnsoft.com）与响应大小上限`);
  }

  // 4. 无鉴权写接口（文件级启发式：有写映射且文件无鉴权字眼）
  const hasWriteMapping = /@(Post|Put|Delete)Mapping/g.test(content) || /@RequestMapping[^)]*(POST|PUT|DELETE)/gi.test(content);
  const hasAuthToken = /@PreAuthorize|AuthInterceptor|X-Admin-Token|checkAuth|requireAuth|SecurityRequirement|@Secured|AuthorizeFilter|authenticate/i.test(content);
  if (hasWriteMapping && !hasAuthToken && (ext === 'java' || ext === 'kt')) {
    push('warning', 'unauthenticated_write', 0,
      `文件含写接口（POST/PUT/DELETE）但未见鉴权字眼——若整个 /api 面无拦截器，内网任意主机可写。参考 puttyon SEC-001 教训`);
  }

  // 5. CORS 任意源 + 凭证
  const corsOpenRe = /allowedOrigin(Patterns|s)?\s*\(\s*"\*"\s*\)/g;
  while ((m = corsOpenRe.exec(content)) !== null) {
    const hasCredentials = /allowCredentials\s*\(\s*true\s*\)/.test(content);
    if (hasCredentials) {
      push('critical', 'cors_open', m.index,
        'CORS 任意源 + allowCredentials(true)：浏览器成为攻击入口（puttyon SEC-005 教训）');
    }
  }

  return issues.sort((a, b) => a.line - b.line);
}

/** 扫描文件（不存在/过大时返回空）。 */
export async function scanFile(filePath: string): Promise<SecurityIssue[]> {
  try {
    const stat = await fs.promises.stat(filePath);
    if (stat.size > 512 * 1024) return []; // 超大文件跳过，避免内存压力
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return scanContent(content, filePath);
  } catch {
    return [];
  }
}
