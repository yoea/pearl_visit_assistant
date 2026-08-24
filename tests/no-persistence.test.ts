import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 隐私红线静态守卫（绊线）。
 * 本守卫只做子串匹配，可被刻意绕过；其定位是防「意外引入」，
 * 恶意代码由运行时硬闸（AnalysisService 发送前安全扫描）兜底。
 * 第二阶段改造：fetch( 从全局禁止改为单文件白名单（analysis-client.ts 是唯一网络出口）；
 * console 拆分为「数据日志禁止（log/info/debug/trace）/ 警告允许（warn/error，仅 src/analysis/ 目录，
 * 且约定参数仅常量文案——语义由代码评审把关）」。
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

const srcDir = fileURLToPath(new URL('../src', import.meta.url));
const files = collectSourceFiles(srcDir);
const relOf = (f: string) => relative(srcDir, f).split('\\').join('/');

/** 全局禁止：持久化/第三方网络库/Node 全局/数据日志 */
const FORBIDDEN_TOKENS = [
  'localStorage', 'sessionStorage', 'indexedDB', 'document.cookie',
  'axios', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'process.',
];

/** console 除 warn/error（仅 analysis/ 目录允许，见第三个 it）外全禁——
 *  正则负向前瞻杜绝 console.table/dir/group/count/time/assert 等数据日志方法漏网 */
const FORBIDDEN_CONSOLE_RE = /console\.(?!warn|error)/;

/** fetch( 唯一白名单文件（相对 src/） */
const FETCH_WHITELIST = new Set(['analysis/analysis-client.ts']);

/** console.warn/error 允许目录（相对 src/） */
const CONSOLE_WARN_DIR = 'analysis/';

/** RawStudentRecord 引用白名单（原始行类型不得扩散到其他模块） */
const RAW_TYPE_WHITELIST = new Set([
  'types/student.ts',          // 定义处
  'anonymization/raw-store.ts', // 受控仓库
  'anonymization/anonymizer.ts', // 脱敏流水线
  'App.tsx',                    // 解析后唯一构造点
]);

describe('隐私红线静态守卫', () => {
  it('src 源码中不出现持久化/第三方网络库/Node 全局/数据日志 API', () => {
    expect(files.length).toBeGreaterThan(0);
    const hits: string[] = [];
    for (const f of files) {
      const content = readFileSync(f, 'utf8');
      for (const token of FORBIDDEN_TOKENS) {
        if (content.includes(token)) hits.push(`${relOf(f)}: ${token}`);
      }
      if (FORBIDDEN_CONSOLE_RE.test(content)) hits.push(`${relOf(f)}: console.<非warn/error>`);
    }
    expect(hits).toEqual([]);
  });

  it('fetch( 只允许出现在网络白名单文件（唯一网络出口）', () => {
    const hits: string[] = [];
    for (const f of files) {
      const content = readFileSync(f, 'utf8');
      if (content.includes('fetch(') && !FETCH_WHITELIST.has(relOf(f))) {
        hits.push(relOf(f));
      }
    }
    expect(hits).toEqual([]);
  });

  it('console.warn/error 只允许出现在 src/analysis/ 目录（且约定仅常量文案）', () => {
    const hits: string[] = [];
    for (const f of files) {
      const content = readFileSync(f, 'utf8');
      if ((content.includes('console.warn') || content.includes('console.error')) && !relOf(f).startsWith(CONSOLE_WARN_DIR)) {
        hits.push(relOf(f));
      }
    }
    expect(hits).toEqual([]);
  });

  it('RawStudentRecord 类型引用只允许出现在白名单文件（原始行不扩散）', () => {
    const hits: string[] = [];
    for (const f of files) {
      const content = readFileSync(f, 'utf8');
      if (content.includes('RawStudentRecord') && !RAW_TYPE_WHITELIST.has(relOf(f))) {
        hits.push(relOf(f));
      }
    }
    expect(hits).toEqual([]);
  });

  it('网络/真实分析类只允许工厂与链路内部引用（UI 唯一入口）', () => {
    const IMPORT_WHITELIST: Record<string, Set<string>> = {
      'analysis-client': new Set(['analysis/deepseek-provider.ts', 'analysis/provider-factory.ts']),
      'deepseek-provider': new Set(['analysis/provider-factory.ts']),
    };
    const hits: string[] = [];
    for (const f of files) {
      const rel = relOf(f);
      const content = readFileSync(f, 'utf8');
      for (const [mod, allowed] of Object.entries(IMPORT_WHITELIST)) {
        const re = new RegExp(`from\\s+['"](?:\\.\\./analysis/|\\./)?${mod}['"]`);
        if (re.test(content) && !allowed.has(rel)) hits.push(`${rel}: imports ${mod}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
