import type { AnonymizedStudent } from '../types/student';

/**
 * 数字字段常识/单位校验（身高体重、收入、负债等易错字段）。
 * 脱敏阶段（ProcessStep 数字校验卡）与报告页（基本情况标注）共用同一套规则。
 * 单位常识：年收入/人均年收入/负债单位为「元」；身高为 cm；体重为 kg。
 * 值常为「数字+单位」（105kg / 174cm / 8.00元 / 5万元 / 300000.00元），
 * 解析时全角转半角、去千分位、识别「万」，保证混合格式可靠匹配。
 * 规则刻意保守（宁缺勿误伤）：只标违背常识的数量级/单位/范围错误，
 * 正常值（身高 174cm、体重 56kg、年收入 30000 元等）绝不标注。
 */

/** 校验不通过时的统一提示文案 */
export const NUMERIC_ERROR_LABEL = '疑似填写错误待核实';

export interface NumericIssue {
  /** AnonymizedStudent 字段名（如 'weight'） */
  key: string;
  /** 字段中文名（如 '体重'） */
  label: string;
  /** 原始值（如 '105kg'） */
  value: string;
}

/**
 * 从「数字+单位」混合值提取数值（元/厘米/千克等）：
 * 全角转半角 → 去千分位逗号 → 识别「万」（5万元 → 50000）。
 * 提取不到数字返回 NaN。
 */
export function parseAmount(v: string): number {
  const half = v.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  const s = half.replace(/,/g, '').trim();
  const m = /^([0-9]+(?:\.[0-9]+)?)\s*(万|w|W)?/.exec(s);
  if (!m) return NaN;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return NaN;
  return m[2] ? n * 10000 : n;
}

/** 对学生逐字段做校验，返回全部疑似错误（空数组 = 无问题） */
export function checkNumericIssues(s: AnonymizedStudent): NumericIssue[] {
  const out: NumericIssue[] = [];
  const check = (key: string, label: string, pred: (n: number) => boolean) => {
    const v = (s as unknown as Record<string, unknown>)[key];
    if (v == null || String(v).trim() === '') return;
    const n = parseAmount(String(v));
    if (!Number.isFinite(n)) return;
    if (pred(n)) out.push({ key, label, value: String(v) });
  };

  check('height', '身高', (n) => (n > 0 && n < 100) || n > 250); // 1.65（米）/ 16.5（漏0）/ 1800（多0）
  check('weight', '体重', (n) => (n > 0 && n < 20) || n > 100); // 105 多为斤/单位混淆
  check('annualIncome', '年收入', (n) => n > 0 && n < 500); // 填 1/2/3 元（漏「万」）
  check('perCapitaIncome', '人均年收入', (n) => n > 0 && n < 100); // 0.2 元
  check('debtStatus', '负债情况', (n) => n > 0 && n < 100); // 8.00 元负债不现实
  check('distanceToSchoolKm', '距离高中路程', (n) => n > 100);
  check('schoolChildrenCount', '上学子女人数', (n) => n > 0 && !Number.isInteger(n));
  check('zhongkaoScore', '中考成绩', (n) => {
    const full = s.zhongkaoFullScore;
    return full != null && full > 0 && n > full; // 成绩高于满分
  });

  // 人均年收入高于年收入（逻辑矛盾）
  const annual = s.annualIncome;
  const perCapita = s.perCapitaIncome;
  if (
    annual != null && Number(annual) > 0
    && perCapita != null && String(perCapita).trim() !== ''
    && parseAmount(String(perCapita)) > Number(annual)
  ) {
    out.push({ key: 'perCapitaIncome', label: '人均年收入', value: String(perCapita) });
  }

  return out;
}
