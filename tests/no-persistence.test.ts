import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 隐私红线静态守卫（绊线）。
 * 本守卫只做子串匹配，可被刻意绕过（如 `fetch (` 带空格）；其定位是防「意外引入」，
 * 恶意代码由运行时硬闸（AnalysisService 发送前安全扫描）兜底。
 * 未来接入 DeepSeek 时 `fetch(` 会进入 src/（预期落在 analysis 模块），
 * 届时必须显式修改本守卫，为该文件增加单文件白名单，不得绕过守卫。
 */

/** 收集 src/ 下所有 .ts/.tsx 源码 */
function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...collectSourceFiles(p));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(p);
  }
  return out;
}

const FORBIDDEN_TOKENS = [
  'localStorage', 'sessionStorage', 'indexedDB', 'document.cookie',
  'fetch(', 'axios', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'console.',
];

describe('隐私红线静态守卫', () => {
  it('src 源码中不出现持久化/网络上传/日志输出 API', () => {
    const srcDir = fileURLToPath(new URL('../src', import.meta.url));
    const files = collectSourceFiles(srcDir);
    expect(files.length).toBeGreaterThan(0);
    const hits: string[] = [];
    for (const f of files) {
      const content = readFileSync(f, 'utf8');
      for (const token of FORBIDDEN_TOKENS) {
        if (content.includes(token)) hits.push(`${f}: ${token}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
