import { describe, it, expect } from 'vitest';
import { anonymize, rankBand } from '../src/anonymization/anonymizer';
import { mapFields } from '../src/anonymization/field-mapper';
import type { RawStudentRecord } from '../src/types/student';
import { MASK } from '../src/security/rules';

const HEADERS = [
  '珍珠生姓名', '身份证号', '电话', 'qq', '微信', '邮箱', '详细地址', '珍珠号',
  '家访教师姓名', '审批人', '性别', '住址省', '州市', '县区', '录取高中全校排名',
  '全年级人数', '年收入', '人均年收入', '家庭情况', '住房状况',
];
const { mappedColumns } = mapFields(HEADERS);

const rec = (values: Record<string, string | number | null>): RawStudentRecord => ({
  sourceRow: 1,
  values,
});

describe('rankBand', () => {
  it('按比例区间化', () => {
    expect(rankBand(46, 923)).toBe('前5%');
    expect(rankBand(100, 923)).toBe('5%-15%');
    expect(rankBand(160, 923)).toBe('15%-30%');
    expect(rankBand(300, 923)).toBe('30%-50%');
    expect(rankBand(600, 923)).toBe('后50%');
  });
});

describe('anonymize', () => {
  it('敏感字段绝不出现在输出中', () => {
    const out = anonymize(
      [
        rec({
          珍珠生姓名: '测试学生甲',
          身份证号: '110101200001011234',
          电话: '13800138000',
          qq: '123456789',
          微信: 'wxid_abc123',
          邮箱: 'abc@example.com',
          详细地址: '某村一组8号',
          珍珠号: 'HEI-2026-001',
          家访教师姓名: '刘玉坤',
          审批人: '张磊',
          性别: '女',
          家庭情况: '母亲心脏病',
        }),
      ],
      mappedColumns,
    );
    const json = JSON.stringify(out.students[0]);
    expect(json).not.toContain('测试学生甲');
    expect(json).not.toContain('110101200001011234');
    expect(json).not.toContain('13800138000');
    expect(json).not.toContain('123456789');
    expect(json).not.toContain('wxid_abc123');
    expect(json).not.toContain('abc@example.com');
    expect(json).not.toContain('某村一组8号');
    expect(json).not.toContain('HEI-2026-001');
    expect(json).not.toContain('刘玉坤');
    expect(json).not.toContain('张磊');
    expect(out.students[0].gender).toBe('女');
    expect(out.students[0].familySituation).toBe('母亲心脏病');
  });

  it('生成连续匿名 ID 与姓名索引', () => {
    const out = anonymize(
      [rec({ 珍珠生姓名: '测试甲' }), rec({ 珍珠生姓名: '测试乙' })],
      mappedColumns,
    );
    expect(out.students.map((s) => s.anonymousId)).toEqual(['student-001', 'student-002']);
    expect(out.nameIndex.get('student-001')).toBe('测试甲');
  });

  it('排名泛化为区间；缺排名或年级人数时输出 null', () => {
    const withRank = anonymize([rec({ 录取高中全校排名: '160', 全年级人数: '923' })], mappedColumns);
    expect(withRank.students[0].admissionRankBand).toBe('15%-30%');
    const noGrade = anonymize([rec({ 录取高中全校排名: '160' })], mappedColumns);
    expect(noGrade.students[0].admissionRankBand).toBeNull();
  });

  it('数字字段解析（含带单位字符串）', () => {
    const out = anonymize([rec({ 年收入: '30000', 人均年收入: '10000.00' })], mappedColumns);
    expect(out.students[0].annualIncome).toBe(30000);
    expect(out.students[0].perCapitaIncome).toBe(10000);
  });

  it('叙事字段内嵌 PII 被掩码', () => {
    const out = anonymize(
      [rec({ 家庭情况: '父亲电话13800138000，住南湖回迁一号楼六单元701室' })],
      mappedColumns,
    );
    expect(out.students[0].familySituation).toBe(`父亲电话${MASK}，${MASK}`);
  });

  it('统计数字正确', () => {
    const out = anonymize(
      [rec({ 珍珠生姓名: '测试甲', 性别: '女' }), rec({ 珍珠生姓名: '测试乙' })],
      mappedColumns,
    );
    expect(out.stats.rawStudentCount).toBe(2);
    expect(out.stats.rawFieldCount).toBe(20);
    expect(out.stats.sensitiveFieldCount).toBe(10); // 8 身份 + 2 第三方
    expect(out.stats.droppedFieldCount).toBe(10);
    expect(out.stats.sentFieldCount).toBe(10);
  });
});
