import { describe, it, expect } from 'vitest';
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

  it('无学校名称列时 schoolName 为 null', () => {
    const buf = workbookFromMatrix([['性别'], ['女']]);
    expect(parseExcel(buf).schoolName).toBeNull();
  });

  it('前 5 行找不到表头时抛错', () => {
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
