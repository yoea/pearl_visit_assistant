// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import Stepper from '../src/components/Stepper';

describe('Stepper（步骤条 + 已完成步骤点击跳转）', () => {
  afterEach(() => cleanup());

  it('current=3：点「导入Excel」跳 1、点「脱敏及检查」跳 2，当前步不可点', () => {
    const onStepClick = vi.fn();
    render(<Stepper current={3} onStepClick={onStepClick} />);
    fireEvent.click(screen.getByTitle('跳转到导入Excel'));
    expect(onStepClick).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByTitle('跳转到脱敏及检查'));
    expect(onStepClick).toHaveBeenCalledWith(2);
    // 当前步骤（AI分析报告）不可点：无跳转按钮
    expect(screen.queryByTitle('跳转到AI分析报告')).toBeNull();
  });

  it('current=2：只可点「导入Excel」（跳 1）', () => {
    const onStepClick = vi.fn();
    render(<Stepper current={2} onStepClick={onStepClick} />);
    fireEvent.click(screen.getByTitle('跳转到导入Excel'));
    expect(onStepClick).toHaveBeenCalledWith(1);
    expect(screen.queryByTitle('跳转到脱敏及检查')).toBeNull();
  });

  it('current=1 无可点步骤；未传 onStepClick 时纯展示', () => {
    render(<Stepper current={1} onStepClick={() => {}} />);
    expect(screen.queryByTitle(/跳转到/)).toBeNull();
    cleanup();
    render(<Stepper current={3} />);
    expect(screen.queryByTitle(/跳转到/)).toBeNull();
    expect(screen.getByText('AI分析报告')).toBeTruthy();
  });
});
