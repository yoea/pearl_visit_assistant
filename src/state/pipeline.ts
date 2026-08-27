import type { PipelineEvent, PipelineState } from '../types/pipeline';

/**
 * 流水线状态机（纯 reducer）。
 * 阶段严格单向推进；原始数据不进入本状态（RawStore 单独持有）。
 */
export function pipelineReducer(state: PipelineState, event: PipelineEvent): PipelineState {
  switch (event.type) {
    case 'PARSE_SUCCEEDED':
      return state.stage === 'idle' ? { stage: 'parsed', ...event.parsed } : state;
    case 'ANONYMIZE_SUCCEEDED':
      return state.stage === 'parsed' ? { stage: 'anonymized', output: event.output } : state;
    case 'SCAN_SUCCEEDED':
      return state.stage === 'anonymized'
        ? { stage: 'scanned', output: event.output, scan: event.scan }
        : state;
    case 'ANALYSIS_SUCCEEDED':
      return state.stage === 'scanned'
        ? { stage: 'analyzed', output: event.output, scan: event.scan, result: event.result, report: event.report }
        : state;
    case 'RETURN_TO_SCAN':
      // 步骤条从报告页（3）跳回「脱敏及检查」（2）：复用已脱敏数据回到检查确认页
      return state.stage === 'analyzed'
        ? { stage: 'scanned', output: state.output, scan: state.scan }
        : state;
    case 'RESET':
      return { stage: 'idle' };
  }
}
