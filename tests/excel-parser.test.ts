import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { utils, write } from 'xlsx';
import { parseExcel } from '../src/excel/excel-parser';
import { detectHeaderRow } from '../src/excel/header-detector';

/** 用矩阵构造内存 xlsx，返回 ArrayBuffer（不落盘、不使用真实数据） */
function workbookFromMatrix(rows: unknown[][]): ArrayBuffer {
  const ws = utils.aoa_to_sheet(rows);
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, '测试表');
  return write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

describe('detectHeaderRow', () => {
  it('识别合并标题行之后的表头行', () => {
    const idx = detectHeaderRow([
      ['高中段珍珠生信息'],
      ['序号', '性别', '家庭情况', '录取高中全校排名'],
      ['1', '女', '三口人', '160'],
    ]);
    expect(idx).toBe(1);
  });

  it('表头在第一行时返回 0', () => {
    const idx = detectHeaderRow([
      ['序号', '性别'],
      ['1', '女'],
    ]);
    expect(idx).toBe(0);
  });

  it('前 5 行全为空时返回 -1', () => {
    const idx = detectHeaderRow([
      ['', null],
      ['', ''],
      [null, null],
      ['', null],
      ['', null],
    ]);
    expect(idx).toBe(-1);
  });
});

describe('parseExcel', () => {
  it('跳过标题行，按表头名组织数据，容忍空单元格', () => {
    const buf = workbookFromMatrix([
      ['高中段珍珠生信息'],
      ['性别', 'qq', '家庭情况'],
      ['女', '123456789', '家里有电话 13800138000'],
      ['男', null, ''],
    ]);
    const parsed = parseExcel(buf);
    expect(parsed.sheetName).toBe('测试表');
    expect(parsed.headerRowIndex).toBe(2);
    expect(parsed.headers).toEqual(['性别', 'qq', '家庭情况']);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rowNumbers).toEqual([3, 4]);
    expect(parsed.rows[0]['性别']).toBe('女');
    expect(parsed.rows[1]['qq']).toBeNull();
  });

  it('跳过全空行', () => {
    const buf = workbookFromMatrix([
      ['性别'],
      ['女'],
      ['', null],
      ['男'],
    ]);
    const parsed = parseExcel(buf);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rowNumbers).toEqual([2, 4]);
  });

  it('提取学校名称与期数', () => {
    const buf = workbookFromMatrix([
      ['学校名称', '期数', '性别'],
      ['某县第一中学', '2026级', '女'],
    ]);
    const parsed = parseExcel(buf);
    expect(parsed.schoolName).toBe('某县第一中学');
    expect(parsed.cohort).toBe('2026级');
  });

  it('期数列为数字 0 时视为未填写（cohort 为 null，不显示「（0）」）', () => {
    const buf = workbookFromMatrix([
      ['学校名称', '期数', '性别'],
      ['某县第一中学', 0, '女'],
    ]);
    const parsed = parseExcel(buf);
    expect(parsed.cohort).toBeNull();
    const buf2 = workbookFromMatrix([
      ['学校名称', '期数', '性别'],
      ['某县第一中学', '0', '女'],
    ]);
    expect(parseExcel(buf2).cohort).toBeNull();
  });

  it('无学校名称列时 schoolName 为 null', () => {
    const buf = workbookFromMatrix([['性别'], ['女']]);
    expect(parseExcel(buf).schoolName).toBeNull();
  });

  it('系统导出文件：标题行 + 导出参数行 + 空行后表头在第 6 行，也能识别', () => {
    const idx = detectHeaderRow([
      ['高中段珍珠生信息'],
      [],
      ['导出时间', '导出条件', '学校名称/编号', '珍珠生姓名/编号'],
      ['2026-08-27', '巍山', '滇-11', '熊毅林'],
      [],
      ['序号', '学校名称', '珍珠班名称', '珍珠班编号', '珍珠号', '珍珠生姓名', '资助项目名称', '期数', '性别', '困难度', '状态'],
      ['1', '某中学', '班名待定', '滇-11-26', '·', '熊毅林', '2026级捡回珍珠计划-高中段', '0', '男', '-3', '草稿'],
    ]);
    expect(idx).toBe(5);
  });

  it('前 12 行都找不到表头时抛错', () => {
    const buf = workbookFromMatrix([
      ['内容一'],
      ['内容二'],
      ['内容三'],
      ['内容四'],
      ['内容五'],
      ['内容六'],
    ]);
    expect(() => parseExcel(buf)).toThrow('表头');
  });

  it('表头重复时抛错', () => {
    const buf = workbookFromMatrix([
      ['性别', '性别'],
      ['女', '男'],
    ]);
    expect(() => parseExcel(buf)).toThrow('表头重复');
  });

  it('空工作表时抛错', () => {
    const buf = workbookFromMatrix([]);
    expect(() => parseExcel(buf)).toThrow('表头');
  });
});

describe('parseExcel：系统导出文件结构适配（表头第 6 行 + 子表头行）', () => {
  /** 模拟基金会系统导出的完整结构：标题/参数/空行/主表头/子表头/数据 */
  const exportMatrix = (): unknown[][] => [
    ['高中段珍珠生信息'],
    [],
    ['导出时间', '导出条件', '学校名称/编号', '珍珠班名称/编号', '珍珠生姓名/编号', '年级', '状态'],
    ['2026-08-27 12:35:30', '学校名称/编号', '巍山', '滇-11', '熊毅林', '26', '草稿'],
    [],
    ['序号', '学校名称', '学校编号', '珍珠班名称', '珍珠班编号', '珍珠号', '珍珠生姓名', '资助项目名称', '期数', '困难度', '状态', '籍贯', '家庭地址', '详细地址', '住房状况', '交通工具', '年收入', '人均年收入'],
    ['', '', '', '', '', '', '', '', '', '', '', '省', '市', '区', '住房状况', '交通工具', '年收入', '人均年收入'],
    [1, '云南省巍山彝族回族自治县第一中学', '滇-11', '班名待定', '滇-11-26', '', '熊毅林', '2026级捡回珍珠计划-高中段', 0, -3, '草稿', '云南省', '大理白族自治州', '巍山彝族回族自治县', '农村自建房/两层', '无', 30000, 10000],
    [2, '某县第二中学', '滇-12', '班名待定', '滇-12-26', '', '李四', '2026级捡回珍珠计划-高中段', 0, -2, '草稿', '云南省', '大理白族自治州', '洱源县', '租房', '无', 20000, 5000],
  ];

  it('表头第 6 行识别、子表头行跳过、字段完整拿到、学生行正确', () => {
    const parsed = parseExcel(workbookFromMatrix(exportMatrix()));
    expect(parsed.headerRowIndex).toBe(6);
    expect(parsed.schoolName).toBe('云南省巍山彝族回族自治县第一中学');
    // 子表头行（省/市/区 + 尾部重复字段名）被跳过，真实学生行 2 条
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rowNumbers).toEqual([8, 9]);
    expect(parsed.headers).toContain('珍珠班编号');
    expect(parsed.headers).toContain('资助项目名称');
    expect(parsed.headers).toContain('详细地址');
    // 子表头行的值不得混入学生数据（raw:false 下数字 0 输出为字符串 '0'）
    expect(parsed.rows[0]['籍贯']).toBe('云南省');
    expect(parsed.rows[0]['期数']).toBe('0');
    expect(parsed.rows[1]['珍珠生姓名']).toBe('李四');
  });

  it('届别提取：期数为 0 时从珍珠班编号尾段提取（滇-11-26 → 2026级）', () => {
    const parsed = parseExcel(workbookFromMatrix(exportMatrix()));
    expect(parsed.cohort).toBe('2026级');
  });

  it('届别提取：无珍珠班编号时从资助项目名称提取（2026级捡回珍珠计划-高中段）', () => {
    const matrix = exportMatrix();
    matrix[7][4] = ''; // 清空珍珠班编号
    const parsed = parseExcel(workbookFromMatrix(matrix));
    expect(parsed.cohort).toBe('2026级');
  });

  it('届别提取：两者皆无 → null；非 20-29 尾段不猜测', () => {
    const matrix = exportMatrix();
    matrix[7][4] = ''; matrix[8][4] = '';
    matrix[7][7] = ''; matrix[8][7] = '';
    expect(parseExcel(workbookFromMatrix(matrix)).cohort).toBeNull();
    // 珍珠班编号无级数（滇-11 是学校编号）：不得误判为 2011 级，
    // 届别由资助项目名称兜底为 2026级（若误判会得到 2011级，断言即失败）
    const m2 = exportMatrix();
    m2[7][4] = '滇-11'; m2[8][4] = '滇-12';
    expect(parseExcel(workbookFromMatrix(m2)).cohort).toBe('2026级');
  });

  it('期数显式填写时优先于珍珠班编号', () => {
    const matrix = exportMatrix();
    matrix[7][8] = '2027级';
    expect(parseExcel(workbookFromMatrix(matrix)).cohort).toBe('2027级');
  });
});

describe('parseExcel：用户提供的真实导出文件回归', () => {
  const sample = fileURLToPath(new URL('../examples/测试专用珍珠生信息20260827123534083.xlsx', import.meta.url));
  it('真实导出文件：字段完整、学生行正确、届别提取 2026级', () => {
    if (!existsSync(sample)) return; // 样例文件缺失时跳过（不依赖外部文件才能跑测试）
    const parsed = parseExcel(readFileSync(sample) as unknown as ArrayBuffer);
    expect(parsed.headerRowIndex).toBe(6);
    expect(parsed.rows.length).toBeGreaterThan(0);
    expect(parsed.rows.length).toBeLessThan(100); // 子表头行已被跳过
    expect(parsed.headers).toContain('珍珠班编号');
    expect(parsed.headers).toContain('资助项目名称');
    expect(parsed.headers).toContain('珍珠生姓名');
    expect(parsed.cohort).toBe('2026级');
    expect(parsed.schoolName).toBe('云南省巍山彝族回族自治县第一中学');
  });
});
