import type {
  AnonymizedStudent, AnonymizationOutput, CellValue, MappedColumn, RawStudentRecord,
} from '../types/student';
import { scrubText } from './text-scrubber';
import { collectNameBlacklist } from './raw-store';
import { toNumber, toText } from '../utils/number';

/** 排名 → 区间（降低校内公示排名的间接识别风险） */
export function rankBand(rank: number, total: number): string {
  const pct = rank / total;
  if (pct <= 0.05) return '前5%';
  if (pct <= 0.15) return '5%-15%';
  if (pct <= 0.3) return '15%-30%';
  if (pct <= 0.5) return '30%-50%';
  return '后50%';
}

/** 需要解析为数字的 keep 字段 */
const NUMBER_KEYS: (keyof AnonymizedStudent)[] = [
  'distanceToSchoolKm', 'zhongkaoFullScore', 'zhongkaoScore', 'gradeSize',
  'annualIncome', 'perCapitaIncome', 'schoolChildrenCount',
];

const EMPTY_STUDENT: AnonymizedStudent = {
  anonymousId: '', gender: null, ethnicity: null, householdType: null, height: null,
  weight: null, healthStatus: null, difficultyLevel: null, enrollmentStatus: null,
  province: null, city: null, county: null, ancestralHome: null, distanceToSchoolKm: null,
  zhongkaoFullScore: null, zhongkaoScore: null, admissionRankBand: null, gradeSize: null,
  familySituation: null, visitMethod: null, visitSummary: null, awardsAndInterests: null,
  applicationReason: null, approvalComment: null, housingStatus: null, transportation: null,
  annualIncome: null, annualIncomeNote: null, perCapitaIncome: null, schoolChildrenCount: null,
  difficultyReason: null, elderlySupportStatus: null, elderlySupportNote: null, debtStatus: null,
  debtNote: null,
};

/**
 * 脱敏组装：RawStudentRecord[] → AnonymizedStudent[]。
 * drop 字段不进入输出；scrub 字段先文本清洗；generalize 字段变换后输出。
 */
export function anonymize(
  records: readonly RawStudentRecord[],
  mappedColumns: MappedColumn[],
): AnonymizationOutput {
  const byAction = (a: string) => mappedColumns.filter((c) => c.action.action === a);
  const keepCols = byAction('keep').filter((c) => c.canonicalKey);
  const scrubCols = byAction('scrub').filter((c) => c.canonicalKey);
  const generalizeCols = byAction('generalize');
  const droppedCols = byAction('drop');
  const sensitiveCount = droppedCols.filter(
    (c) => c.action.action === 'drop' && (c.action.reason === 'identity' || c.action.reason === 'third-party'),
  ).length;

  const nameBlacklist = collectNameBlacklist(records);
  const nameIndex = new Map<string, string>();

  const students = records.map((rec, i) => {
    const anonymousId = `student-${String(i + 1).padStart(3, '0')}`;
    const student: AnonymizedStudent = { ...EMPTY_STUDENT, anonymousId };

    // 姓名索引（仅本地内存，绝不进入 payload）
    const nameCol = mappedColumns.find(
      (c) => c.action.action === 'drop' && c.action.reason === 'identity' && c.normalizedHeader === '珍珠生姓名',
    );
    if (nameCol) {
      const n = toText(rec.values[nameCol.header]);
      if (n) nameIndex.set(anonymousId, n);
    }

    const setField = (key: string, value: CellValue) => {
      (student as unknown as Record<string, unknown>)[key] = value;
    };

    for (const col of keepCols) {
      const key = col.canonicalKey!;
      if ((NUMBER_KEYS as string[]).includes(key)) {
        setField(key, toNumber(rec.values[col.header]));
      } else {
        setField(key, toText(rec.values[col.header]));
      }
    }
    for (const col of scrubCols) {
      const rawText = toText(rec.values[col.header]);
      setField(col.canonicalKey!, rawText ? scrubText(rawText, nameBlacklist) : null);
    }
    for (const col of generalizeCols) {
      if (col.canonicalKey === 'admissionRank') {
        const rank = toNumber(rec.values[col.header]);
        const gradeHeader = mappedColumns.find((c) => c.canonicalKey === 'gradeSize')?.header;
        const grade = gradeHeader ? toNumber(rec.values[gradeHeader]) : null;
        setField('admissionRankBand', rank != null && grade != null && grade > 0 ? rankBand(rank, grade) : null);
      }
    }

    return student;
  });

  const sentFieldCount =
    keepCols.length + scrubCols.length + generalizeCols.length;

  return {
    students,
    nameIndex,
    stats: {
      rawStudentCount: records.length,
      rawFieldCount: mappedColumns.length,
      sensitiveFieldCount: sensitiveCount,
      droppedFieldCount: droppedCols.length,
      generalizedFieldCount: generalizeCols.length,
      sentFieldCount,
    },
  };
}
