import { describe, it, expect } from 'vitest';
import { pipelineReducer } from '../src/state/pipeline';
import type { ParsedState, PipelineState } from '../src/types/pipeline';
import type { AnonymizationOutput } from '../src/types/student';

const parsed: ParsedState = {
  schoolName: '某中学', cohort: '2026级', sheetName: '高中段珍珠生信息',
  rowCount: 1, fieldCount: 60, headerRowIndex: 2, mappedColumns: [],
};

const output: AnonymizationOutput = {
  students: [], nameIndex: new Map(),
  stats: { rawStudentCount: 1, rawFieldCount: 60, sensitiveFieldCount: 10, droppedFieldCount: 24, generalizedFieldCount: 1, sentFieldCount: 35 },
};

const scan = { passed: true, findings: [] };
const result = {
  schoolAnalysis: {
    overview: '本校共 0 名候选学生。', studentCount: 0,
    difficultyPatterns: [], commonIssues: [], dataQualityIssues: [],
    keyVerificationTopics: [], interviewSuggestions: [],
  },
  students: [],
};
const report = {
  title: '走访参考报告', schoolName: '某中学', cohort: '2026级',
  generatedAt: '2026-08-21 10:00',
  schoolAnalysis: result.schoolAnalysis, students: [], studentsData: [],
};

describe('pipelineReducer', () => {
  it('合法链路 idle→parsed→anonymized→scanned→analyzed', () => {
    let s: PipelineState = { stage: 'idle' };
    s = pipelineReducer(s, { type: 'PARSE_SUCCEEDED', parsed });
    expect(s.stage).toBe('parsed');
    s = pipelineReducer(s, { type: 'ANONYMIZE_SUCCEEDED', output });
    expect(s.stage).toBe('anonymized');
    s = pipelineReducer(s, { type: 'SCAN_SUCCEEDED', output, scan });
    expect(s.stage).toBe('scanned');
    s = pipelineReducer(s, { type: 'ANALYSIS_SUCCEEDED', output, scan, result, report });
    expect(s.stage).toBe('analyzed');
  });

  it('非法跳转被忽略（不能跳过阶段）', () => {
    const idle: PipelineState = { stage: 'idle' };
    expect(pipelineReducer(idle, { type: 'ANONYMIZE_SUCCEEDED', output })).toBe(idle);
    expect(pipelineReducer(idle, { type: 'ANALYSIS_SUCCEEDED', output, scan, result, report })).toBe(idle);

    const parsedState: PipelineState = { stage: 'parsed', ...parsed };
    expect(pipelineReducer(parsedState, { type: 'PARSE_SUCCEEDED', parsed })).toBe(parsedState);
    expect(pipelineReducer(parsedState, { type: 'SCAN_SUCCEEDED', output, scan })).toBe(parsedState);
  });

  it('RESET 任意阶段回到 idle', () => {
    const analyzed: PipelineState = { stage: 'analyzed', output, scan, result, report };
    expect(pipelineReducer(analyzed, { type: 'RESET' })).toEqual({ stage: 'idle' });
  });
});
