// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import SendPreviewStep from '../src/components/SendPreviewStep';
import type { AnonymizationOutput } from '../src/types/student';

const output: AnonymizationOutput = {
  students: [],
  stats: {
    rawStudentCount: 0, rawFieldCount: 0, sensitiveFieldCount: 0,
    droppedFieldCount: 0, generalizedFieldCount: 0, sentFieldCount: 0,
  },
  nameIndex: new Map(),
};

const meta = { schoolName: '某中学', cohort: '2026级' };

const renderPreview = (props: Record<string, unknown> = {}) =>
  render(
    <SendPreviewStep output={output} meta={meta} providerName="mock" analyzing={false}
      onBack={() => {}} onConfirm={() => {}}
      {...(props as Partial<Parameters<typeof SendPreviewStep>[0]>)} />,
  );

describe('SendPreviewStep', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('挂载时零回调零网络（绝不自动发送）', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const onConfirm = vi.fn();
    render(<SendPreviewStep output={output} meta={meta} providerName="mock" analyzing={false}
      onBack={() => {}} onConfirm={onConfirm} />);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('渲染将发送摘要与绝不发送清单', () => {
    renderPreview();
    expect(screen.getByText('发送数据预览（发送前最终确认）')).toBeTruthy();
    expect(screen.getByText(/学校名称（脱敏）：某中学/)).toBeTruthy();
    expect(screen.getByText('学生姓名')).toBeTruthy();
    expect(screen.getByText('珍珠号')).toBeTruthy();
  });

  it('点击确认 → 触发 onConfirm（唯一分析入口）；点击返回 → 触发 onBack', () => {
    const onConfirm = vi.fn();
    const onBack = vi.fn();
    render(<SendPreviewStep output={output} meta={meta} providerName="mock" analyzing={false}
      onBack={onBack} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText('确认并开始 AI 分析'));
    fireEvent.click(screen.getByText('返回检查'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('analyzing 时按钮禁用且展示进行中文案（不会重复触发）', () => {
    const onConfirm = vi.fn();
    render(<SendPreviewStep output={output} meta={meta} providerName="mock" analyzing
      onBack={() => {}} onConfirm={onConfirm} />);
    const confirm = screen.getByText('AI 分析中，请勿关闭页面…') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('mock 模式显示本地模拟徽标；deepseek 模式显示真实 AI 徽标（绝不静默假装真实 AI）', () => {
    renderPreview();
    expect(screen.getByText(/本地模拟分析（数据不出本机，不会上传）/)).toBeTruthy();
    render(<SendPreviewStep output={output} meta={meta} providerName="deepseek" analyzing={false}
      onBack={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText(/真实 AI 分析（经三道安全检查后直接发送至 DeepSeek）/)).toBeTruthy();
  });

  it('error 文案渲染（分类文案直显，不二次包装）', () => {
    render(<SendPreviewStep output={output} meta={meta} providerName="mock" analyzing={false}
      error="分析请求超时，请稍后重试。" onBack={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText('分析请求超时，请稍后重试。')).toBeTruthy();
  });
});
