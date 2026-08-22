import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

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
  'fetch(', 'axios', 'XMLHttpRequest', 'sendBeacon', 'console.log',
];

describe('隐私红线静态守卫', () => {
  it('src 源码中不出现持久化/网络上传/日志输出 API', () => {
    const files = collectSourceFiles(join(process.cwd(), 'src'));
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
