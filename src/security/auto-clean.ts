import { RULES, type RuleCategory } from './rules';
import { maskSnippet, type SecurityFinding } from './scanner';
import { STUDENT_FIELD_LABELS } from '../utils/field-labels';
import type { AnonymizedStudent } from '../types/student';

/**
 * 发送前自动清洗（用户授权策略）：扫描发现疑似敏感信息时，不再一律阻止——
 * 对「文本中混入的敏感片段」（证件号/电话/邮箱/QQ/微信/珍珠号/名单姓名）自动剥除后继续；
 * 剥除后若剩余内容是无意义的碎片（无中文且过短），整个字段置空，绝不发送残缺数据。
 * 兜底不变：地址类命中与清洗后仍命中的字段仍会阻止（fail-closed），需人工处理。
 * 清洗过程全程本地，清洗结果在检查页可见。
 */

const CATEGORY_TO_RULE = new Map(RULES.map((r) => [r.category, r]));

/** 需要人工处理、不做自动清洗的类别（结构/语义性敏感，自动删会破坏数据） */
const MANUAL_CATEGORIES = new Set(['address', 'forbidden-field', 'malformed-payload']);

export interface AutoCleanResult {
  /** 清洗后的学生列表（未清洗字段原样） */
  students: AnonymizedStudent[];
  /** 实际发生清洗的字段数（0 = 无可自动处理项） */
  cleanedCount: number;
  /** 每处清洗的记录（供检查页/报告标出；值均为掩码，绝不含完整敏感内容） */
  issues: CleanedIssue[];
}

/** 一处被自动清洗的敏感误填记录 */
export interface CleanedIssue {
  /** 学生匿名编号（student-001） */
  studentId: string;
  /** 字段中文名（如 '籍贯'） */
  fieldLabel: string;
  /** 清洗前原值的掩码（如 'G65****83'），绝不包含完整敏感内容 */
  originalMasked: string;
  /** 处理说明（已清除混入信息 / 整项置空） */
  note: string;
}

/** 剥除后剩余是否为无意义碎片：不含任何中文字符 → 视为敏感内容主体被删除（残留纯字母数字），整个字段置空 */
function isFragment(trimmed: string): boolean {
  return !/[一-龥]/.test(trimmed);
}

/** 对单个字符串字段剥除名单中的姓名（≥2 字，与扫描器一致） */
function stripNames(value: string, nameBlacklist: ReadonlySet<string>): string {
  let out = value;
  for (const name of nameBlacklist) {
    if (name.length >= 2) out = out.split(name).join('');
  }
  return out;
}

/**
 * 对扫描命中的字段执行自动清洗。address / forbidden-field / malformed-payload 不清洗
 * （返回原列表），调用方仅在仍有未处理命中时保持阻止。
 * name-blacklist 命中无法定位字段（扫描为全文匹配）→ 对所有学生的全部字符串字段剥离名单姓名。
 */
export function autoCleanStudents(
  students: AnonymizedStudent[],
  findings: SecurityFinding[],
  nameBlacklist: ReadonlySet<string>,
): AutoCleanResult {
  const out = students.map((s) => ({ ...s }));
  let cleanedCount = 0;
  const issues: CleanedIssue[] = [];

  /** 回写单个字段的清洗结果（空/碎片 → null）；返回 null=未变化，否则返回处理说明 */
  const applyClean = (stu: AnonymizedStudent, key: string, stripped: string): string | null => {
    const record = stu as unknown as Record<string, unknown>;
    const current = record[key];
    if (current == null || String(current).trim() === '') return null;
    const trimmed = stripped.trim();
    const next: string | null = trimmed === '' || isFragment(trimmed) ? null : trimmed;
    if (String(next) !== String(current)) {
      record[key] = next;
      return next === null
        ? '整项疑似为敏感信息，已置空（不发送残缺数据）'
        : '混入的敏感信息已清除';
    }
    return null;
  };

  for (const f of findings) {
    if (MANUAL_CATEGORIES.has(f.category)) continue;

    // 姓名黑名单：全文命中无法定位 → 全学生全文本字段剥离名单姓名
    if (f.category === 'name-blacklist') {
      for (const stu of out) {
        for (const [key, value] of Object.entries(stu)) {
          if (typeof value !== 'string') continue;
          const note = applyClean(stu, key, stripNames(value, nameBlacklist));
          if (note !== null) {
            cleanedCount += 1;
            issues.push({
              studentId: stu.anonymousId,
              fieldLabel: STUDENT_FIELD_LABELS[key as keyof typeof STUDENT_FIELD_LABELS] ?? key,
              originalMasked: maskSnippet(value),
              note,
            });
          }
          void issues;
        }
      }
      continue;
    }

    const m = /students\[(\d+)\]\.(\w+)/.exec(f.field);
    if (!m) continue;
    const stu = out[Number(m[1])];
    const key = m[2];
    if (!stu || !(key in stu)) continue;
    const record = stu as unknown as Record<string, unknown>;
    const current = record[key];
    if (current == null || String(current).trim() === '') continue;
    const before = String(current);

    const rule = CATEGORY_TO_RULE.get(f.category as RuleCategory);
    if (!rule) continue; // 无法映射（如结构类）→ 不自动清洗
    rule.pattern.lastIndex = 0;
    const note = applyClean(stu, key, before.replace(rule.pattern, ''));
    if (note !== null) {
      cleanedCount += 1;
      issues.push({
        studentId: stu.anonymousId,
        fieldLabel: STUDENT_FIELD_LABELS[key as keyof typeof STUDENT_FIELD_LABELS] ?? key,
        originalMasked: maskSnippet(before),
        note,
      });
    }
  }

  return { students: out, cleanedCount, issues };
}
