// 安全基线扫描（USER-PROBLEM-ANALYSIS C1-C5）
// puttyon 两次审计同一类问题（凭证明文/SSRF/零鉴权）——人肉审查追不上
// 生成速度。此模块在写代码时自动检测常见漏洞模式。
import { describe, it, expect } from 'vitest';
import { scanContent } from '../securityScan';

describe('scanContent 安全基线', () => {
  it('检测硬编码密码', () => {
    const issues = scanContent('const password = "mypassword123";', 'config.ts');
    expect(issues.some(i => i.type === 'hardcoded_secret')).toBe(true);
  });

  it('检测硬编码 api_key', () => {
    const issues = scanContent('api_key: "sk-abcdefghijklmnopqrstuvwxyz123456"', 'config.yml');
    expect(issues.some(i => i.type === 'hardcoded_secret')).toBe(true);
  });

  it('不误报环境变量引用', () => {
    const ok = [
      'password: "${DB_PASSWORD}"',
      'const pwd = process.env.DB_PASSWORD;',
      'api_key = os.environ.get("API_KEY")',
      'const s = `password=${process.env.PW}`;',
    ];
    for (const c of ok) {
      const issues = scanContent(c, 'config.ts');
      expect(issues.filter(i => i.type === 'hardcoded_secret'), c).toHaveLength(0);
    }
  });

  it('检测 OpenAI 风格 API key 字面量', () => {
    const issues = scanContent('const key = "sk-abcdefghijklmnopqrstuvwxyz1234567890";', 'a.ts');
    expect(issues.some(i => i.type === 'api_key_literal')).toBe(true);
  });

  it('检测 AWS AK 字面量', () => {
    const issues = scanContent('AKIAIOSFODNN7EXAMPLE', 'a.ts');
    expect(issues.some(i => i.type === 'api_key_literal')).toBe(true);
  });

  it('检测 SSRF 启发式（RestTemplate 请求用户可控 URL）', () => {
    const code = 'restTemplate.getForEntity(imageUrl, byte[].class);';
    const issues = scanContent(code, 'ErpServiceImpl.java');
    expect(issues.some(i => i.type === 'ssrf_url')).toBe(true);
  });

  it('SSRF 启发式不误报常量 URL', () => {
    const code = 'restTemplate.getForEntity("https://upload.escnsoft.com/" + key, byte[].class);';
    const issues = scanContent(code, 'ErpServiceImpl.java');
    expect(issues.filter(i => i.type === 'ssrf_url')).toHaveLength(0);
  });

  it('检测无鉴权写接口（文件级启发式）', () => {
    const code = '@PostMapping("/api/products")\npublic void create() {}';
    const issues = scanContent(code, 'ProductController.java');
    expect(issues.some(i => i.type === 'unauthenticated_write')).toBe(true);
  });

  it('有鉴权字眼时不报无鉴权', () => {
    const code = '@PostMapping("/api/products")\n@PreAuthorize("hasRole")\npublic void create() {}';
    const issues = scanContent(code, 'ProductController.java');
    expect(issues.filter(i => i.type === 'unauthenticated_write')).toHaveLength(0);
  });

  it('检测 CORS 任意源 + 凭证', () => {
    const code = 'allowedOriginPatterns("*"); allowCredentials(true);';
    const issues = scanContent(code, 'CorsConfig.java');
    expect(issues.some(i => i.type === 'cors_open')).toBe(true);
  });

  it('安全代码零发现', () => {
    const code = `
export function add(a: number, b: number): number {
  return a + b;
}
    `;
    expect(scanContent(code, 'math.ts')).toEqual([]);
  });

  it('返回行号', () => {
    const issues = scanContent('line1\nconst password = "secret123";', 'a.ts');
    const issue = issues.find(i => i.type === 'hardcoded_secret');
    expect(issue?.line).toBe(2);
  });
});
