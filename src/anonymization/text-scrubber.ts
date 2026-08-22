import { ADDRESS_TOKENS, CLAUSE_SEP_CHAR, CLAUSE_SPLIT, MASK, RULES } from '../security/rules';

/** 地址子句掩码：按标点切分，子句内互异地址词 ≥2 个则整句替换 */
function scrubAddressClauses(text: string): string {
  return text
    .split(CLAUSE_SPLIT)
    .map((seg) => {
      if (CLAUSE_SEP_CHAR.test(seg)) return seg;
      const tokens = new Set(seg.match(ADDRESS_TOKENS) ?? []);
      return tokens.size >= 2 ? MASK : seg;
    })
    .join('');
}

/**
 * 叙事文本清洗：发送前把内嵌 PII 掩码为 [已隐藏]。
 * 规则顺序：身份证 → 手机 → 固话 → 邮箱 → QQ → 微信 → 珍珠号 → 姓名模式 → 地址子句。
 */
export function scrubText(text: string, nameBlacklist: ReadonlySet<string>): string {
  let out = text;
  // 1. 黑名单姓名（学生姓名/教师姓名/审批人的精确值）
  for (const name of nameBlacklist) {
    if (name.length >= 2) out = out.split(name).join(MASK);
  }
  // 2. 规则模式掩码（text 规则；数字规则对文本同样生效由 both 规则覆盖）
  for (const rule of RULES) {
    out = out.replace(rule.pattern, MASK);
  }
  // 3. 地址子句
  return scrubAddressClauses(out);
}
