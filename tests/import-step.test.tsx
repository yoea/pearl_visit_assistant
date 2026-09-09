// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import ImportStep from '../src/components/ImportStep';
import { parseExcel, type ParsedExcel } from '../src/excel/excel-parser';

vi.mock('../src/excel/excel-parser', () => ({
  parseExcel: vi.fn(),
}));

const parseMock = vi.mocked(parseExcel);

/** 依据文件内容（sch-A / sch-B）返回对应学校的解析结果 */
const excelOf = (tag: string): ParsedExcel => ({
  schoolName: tag === 'sch-A' ? '学校A' : '学校B',
  cohort: '2026级', sheetName: 'Sheet1',
  headers: ['序号', '学校名称'],
  rows: [] as ParsedExcel['rows'], rowNumbers: [], headerRowIndex: 1,
});

const fileA = new File(['sch-A'], '名单A.xlsx');
const fileB = new File(['sch-B'], '名单B.xlsx');

beforeEach(() => {
  parseMock.mockReset();
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('ImportStep（多文件同校校验）', () => {
  it('选第二个不同学校的文件：即时提示并忽略，按钮锁定；确认后恢复', async () => {
    parseMock.mockImplementation((buf: ArrayBuffer) => excelOf(new TextDecoder().decode(buf)));

    const onFiles = vi.fn();
    const { container } = render(<ImportStep onFiles={onFiles} error={undefined} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;

    fireEvent.change(input, { target: { files: [fileA] } }); // 先选 A（学校A）
    await waitFor(() => expect(screen.getByText('学校A')).toBeTruthy());
    fireEvent.change(input, { target: { files: [fileB] } }); // 再选 B（学校B，跨校）
    // 即时拒绝提示：B 被忽略，队列只有 A
    await waitFor(() => {
      expect(screen.getByText(/不是同一所学校/)).toBeTruthy();
    });
    expect(screen.queryByText(/📄 名单B\.xlsx/)).toBeNull();
    // 按钮锁定：提示期间显示「请先处理上方提示」且禁用
    const btn = screen.getByRole('button', { name: /请先处理上方提示/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    // 点「知道了」→ 按钮恢复可用 → 提交只含 A
    fireEvent.click(screen.getByText(/知道了/));
    const goBtn = screen.getByRole('button', { name: /分析这 1 份表格/ }) as HTMLButtonElement;
    expect(goBtn.disabled).toBe(false);
    fireEvent.click(goBtn);
    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(onFiles.mock.calls[0][0].map((f: File) => f.name)).toEqual(['名单A.xlsx']);
  });

  it('同校多份正常入队合并', async () => {
    parseMock.mockImplementation((buf: ArrayBuffer) => excelOf(new TextDecoder().decode(buf)));
    const onFiles = vi.fn();
    const { container } = render(<ImportStep onFiles={onFiles} error={undefined} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const fileA2 = new File(['sch-A'], '名单A2.xlsx');
    fireEvent.change(input, { target: { files: [fileA] } });
    fireEvent.change(input, { target: { files: [fileA2] } });
    await waitFor(() => {
      expect(screen.getByText(/名单A\.xlsx/)).toBeTruthy();
      expect(screen.getByText(/名单A2\.xlsx/)).toBeTruthy();
    });
    expect(screen.getByText('（2 份表格）')).toBeTruthy();
    expect(screen.queryByText(/不是同一所学校/)).toBeNull();
  });

  it('解析失败的表格即时提示并忽略', async () => {
    parseMock.mockRejectedValue(new Error('表头重复'));
    const onFiles = vi.fn();
    const { container } = render(<ImportStep onFiles={onFiles} error={undefined} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [fileB] } });
    await waitFor(() => {
      expect(screen.getByText(/名单B.xlsx.*解析失败/)).toBeTruthy();
    });
    expect(screen.queryByText(/📄 名单B\.xlsx/)).toBeNull(); // 文件行未入队（提示文本含文件名不受影响）
  });
});
