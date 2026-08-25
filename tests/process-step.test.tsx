// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ProcessStep from '../src/components/ProcessStep';
import type { SecurityScanResult } from '../src/security/scanner';
import type { AnonymizationOutput, MappedColumn } from '../src/types/student';

const output: AnonymizationOutput = {
  students: [],
  stats: {
    rawStudentCount: 0, rawFieldCount: 0, sensitiveFieldCount: 0,
    droppedFieldCount: 0, generalizedFieldCount: 0, sentFieldCount: 0,
  },
  nameIndex: new Map(),
};

const meta = { schoolName: '某中学', cohort: '2026级' };
const mappedColumns: MappedColumn[] = [{ header: '性别', normalizedHeader: '性别', canonicalKey: 'gender', action: { action: 'keep' } }];

const passedScan: SecurityScanResult = { passed: true, findings: [] };
const failedScan: SecurityScanResult = {
  passed: false,
  findings: [{ category: 'mobile', label: '手机号', field: 'students[0].familySituation', snippet: '13****00' }],
};

const renderStep = (props: Record<string, unknown> = {}) =>
  render(
    <ProcessStep output={output} scan={passedScan} mappedColumns={mappedColumns} meta={meta}
      providerName="mock" analyzing={false} onAnalyze={() => {}} onReset={() => {}}
      {...(props as Partial<Parameters<typeof ProcessStep>[0]>)} />,
  );

describe('ProcessStep（脱敏及检查合并页，安全红线）', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('挂载时零回调零网络（绝不自动发送）', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const onAnalyze = vi.fn();
    render(
      <ProcessStep output={output} scan={passedScan} mappedColumns={mappedColumns} meta={meta}
        providerName="mock" analyzing={false} onAnalyze={onAnalyze} onReset={() => {}} />,
    );
    expect(onAnalyze).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('扫描通过 → 绿色摘要 + 发送区渲染（确认按钮是唯一分析入口）', () => {
    renderStep();
    expect(screen.getByText('✓ 未发现禁止发送的个人身份信息，可以开始分析')).toBeTruthy();
    expect(screen.getByText('确认并开始 AI 分析')).toBeTruthy();
    expect(screen.getByText('发送前检查与确认')).toBeTruthy();
  });

  it('点击确认 → 恰好一次 onAnalyze（绝不重复触发）', () => {
    const onAnalyze = vi.fn();
    renderStep({ onAnalyze });
    fireEvent.click(screen.getByText('确认并开始 AI 分析'));
    expect(onAnalyze).toHaveBeenCalledTimes(1);
  });

  it('analyzing 时确认按钮替换为进行中反馈，重新开始禁用（不会重复触发）', () => {
    const onAnalyze = vi.fn();
    renderStep({ analyzing: true, onAnalyze });
    expect(screen.queryByText('确认并开始 AI 分析')).toBeNull();
    const reset = screen.getByText('重新开始') as HTMLButtonElement;
    expect(reset.disabled).toBe(true);
    fireEvent.click(reset);
    expect(onAnalyze).not.toHaveBeenCalled();
  });

  it('mock 模式显示本地模拟徽标；deepseek 模式显示真实 AI 徽标（绝不静默假装真实 AI）', () => {
    renderStep();
    expect(screen.getByText(/本地模拟分析（数据不出本机，不会上传）/)).toBeTruthy();
    render(
      <ProcessStep output={output} scan={passedScan} mappedColumns={mappedColumns} meta={meta}
        providerName="deepseek" analyzing={false} onAnalyze={() => {}} onReset={() => {}} />,
    );
    expect(screen.getByText(/真实 AI 分析（经三道安全检查后直接发送至 DeepSeek）/)).toBeTruthy();
  });

  it('error 文案直显（分类文案不二次包装）', () => {
    renderStep({ error: '分析请求超时，请稍后重试。' });
    expect(screen.getByText('分析请求超时，请稍后重试。')).toBeTruthy();
  });

  it('绝不发送清单默认收起，展开后渲染（避免顶部长卡把按钮推远）', () => {
    renderStep();
    expect(screen.getByText('以下内容绝不会发送')).toBeTruthy();
    fireEvent.click(screen.getByText('查看绝不发送清单'));
    expect(screen.getByText('学生姓名')).toBeTruthy();
    expect(screen.getAllByText('珍珠号').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('原始 Excel 文件本身')).toBeTruthy();
  });

  it('analyzing 时显示明显进行中反馈（动画 + 预估时间 + 已等待秒数）', () => {
    const onAnalyze = vi.fn();
    renderStep({ analyzing: true, onAnalyze });
    expect(screen.getByText(/AI 正在分析/)).toBeTruthy();
    expect(screen.getByText(/预计 \d+(-\d+)?/)).toBeTruthy();
    expect(screen.getByText(/已等待 \d+ 秒/)).toBeTruthy();
    const confirm = screen.getByText('AI 正在分析 0 名学生，请勿关闭页面…');
    expect(confirm).toBeTruthy();
    expect(onAnalyze).not.toHaveBeenCalled();
  });

  it('扫描失败 → 红色详情 + 发送区不渲染 + 重新开始触发 onReset', () => {
    const onReset = vi.fn();
    renderStep({ scan: failedScan, onReset });
    expect(screen.getByText(/发现疑似敏感信息，已阻止发送/)).toBeTruthy();
    expect(screen.queryByText('确认并开始 AI 分析')).toBeNull();
    fireEvent.click(screen.getByText('重新开始'));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('scan undefined（半态防御）→ 正在处理文案 + 发送区不渲染', () => {
    renderStep({ scan: undefined });
    expect(screen.getByText('正在处理…')).toBeTruthy();
    expect(screen.queryByText('确认并开始 AI 分析')).toBeNull();
  });
});
