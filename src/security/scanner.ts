import { ADDRESS_TOKENS, CLAUSE_SEP_CHAR, CLAUSE_SPLIT, RULES, STRUCTURED_REGION_KEYS, type RuleCategory } from './rules';

export interface SecurityFinding {
  category: RuleCategory | 'name-blacklist' | 'forbidden-field' | 'malformed-payload';
  label: string;
  field: string; // 字段路径，如 students[0].familySituation
  snippet: string; // 掩码片段，绝不包含完整敏感值
}

export interface SecurityScanResult {
  passed: boolean;
  findings: SecurityFinding[];
}

/** 掩码片段：首尾各留 2 位 */
export function maskSnippet(value: string): string {
  if (value.length <= 4) return '****';
  return `${value.slice(0, 2)}****${value.slice(-2)}`;
}

/** 禁止出现在 payload 中的字段名（序列化后的 JSON key 检查） */
const FORBIDDEN_FIELD_NAMES = [
  '姓名', '身份证', '电话', '手机', 'qq', '微信', '邮箱', '地址', '珍珠号', '教师', '审批人',
];

/** 数字字段适用的规则子集（scope 'both'） */
const BOTH_SCOPE_RULES = RULES.filter((r) => r.scope === 'both');

/** 遍历 payload 中的所有字段值（含嵌套），按字段路径应用规则 */
function walk(
  node: unknown,
  path: string,
  isStructuredRegion: boolean,
  isSchoolName: boolean,
  exemptAddressPaths: readonly string[],
  findings: SecurityFinding[],
): void {
  if (node == null) return;
  if (typeof node === 'string') {
    for (const rule of RULES) {
      rule.pattern.lastIndex = 0;
      const m = rule.pattern.exec(node);
      if (m) {
        findings.push({
          category: rule.category,
          label: rule.label,
          field: path,
          snippet: maskSnippet(m[0]),
        });
        return; // 每字段只报告第一个命中
      }
    }
    // 地址子句检测（与清洗器同源逻辑）：同一子句内互异地址词 ≥2 个 → 命中
    // 学校名/结构化地区字段豁免：省/市/县/籍贯含区域词属合法值，校名常含省市县字样
    // （均经用户确认发送）；其余规则照常扫描
    if (!isSchoolName && !isStructuredRegion && !exemptAddressPaths.includes(path)) {
      for (const seg of node.split(CLAUSE_SPLIT)) {
        if (CLAUSE_SEP_CHAR.test(seg)) continue;
        const tokens = new Set(seg.match(ADDRESS_TOKENS) ?? []);
        if (tokens.size >= 2) {
          findings.push({
            category: 'address',
            label: '详细地址',
            field: path,
            snippet: maskSnippet(seg.trim()),
          });
          break;
        }
      }
    }
    return;
  }
  if (typeof node === 'number') {
    const s = String(node);
    for (const rule of BOTH_SCOPE_RULES) {
      rule.pattern.lastIndex = 0;
      const m = rule.pattern.exec(s);
      if (m) {
        findings.push({
          category: rule.category,
          label: rule.label,
          field: path,
          snippet: maskSnippet(m[0]),
        });
        return;
      }
    }
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item, i) => walk(item, `${path}[${i}]`, false, false, exemptAddressPaths, findings));
    return;
  }
  if (typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      walk(
        v,
        path === '' ? k : `${path}.${k}`,
        STRUCTURED_REGION_KEYS.has(k),
        k === 'schoolName',
        exemptAddressPaths,
        findings,
      );
    }
  }
}

export interface ScanOptions {
  /** 豁免地址子句检测的字段路径（如出站 wire 结构的 'school.name'）。
   *  只豁免地址子句，其余规则（证件/电话/姓名模式/字段名）照常扫描。 */
  exemptAddressPaths?: readonly string[];
}

/**
 * 发送前安全硬闸：对完整 payload 做最后扫描。
 * 命中即 passed=false；调用方（AnalysisService）必须拒绝发送。
 */
export function scanPayload(
  payload: unknown,
  nameBlacklist: Set<string>,
  options: ScanOptions = {},
): SecurityScanResult {
  // 0. 结构性守卫：fail-closed，绝不抛异常
  if (payload === null || typeof payload !== 'object') {
    return {
      passed: false,
      findings: [{ category: 'malformed-payload', label: 'payload 结构异常，已拒绝发送', field: '(payload)', snippet: '****' }],
    };
  }

  const findings: SecurityFinding[] = [];
  const exemptAddressPaths = options.exemptAddressPaths ?? [];

  // 1. 姓名黑名单：全 payload 精确匹配
  let json: string;
  try {
    json = JSON.stringify(payload);
  } catch {
    // fail-closed：序列化异常（BigInt/循环引用等）一律按结构异常拒绝发送
    return {
      passed: false,
      findings: [{ category: 'malformed-payload', label: 'payload 序列化异常，已拒绝发送', field: '(payload)', snippet: '****' }],
    };
  }
  for (const name of nameBlacklist) {
    // 单字姓名跳过：与清洗器一致，避免常见单字（如「宁」「省」）误报
    if (name.length >= 2 && json.includes(name)) {
      findings.push({
        category: 'name-blacklist',
        label: '检测到名单中的姓名',
        field: '(全文)',
        snippet: maskSnippet(name),
      });
    }
  }

  // 2. 字段值规则扫描
  walk(payload, '', false, false, exemptAddressPaths, findings);

  // 3. 禁止字段名检查
  const keys = [...Object.keys(payload)];
  if (Array.isArray((payload as { students?: unknown }).students)) {
    for (const s of (payload as { students: unknown[] }).students) {
      if (s !== null && typeof s === 'object') keys.push(...Object.keys(s));
    }
  }
  for (const key of new Set(keys)) {
    if (FORBIDDEN_FIELD_NAMES.some((f) => key.includes(f))) {
      findings.push({
        category: 'forbidden-field',
        label: '存在禁止发送的字段名',
        field: key,
        snippet: maskSnippet(key),
      });
    }
  }

  return { passed: findings.length === 0, findings };
}
