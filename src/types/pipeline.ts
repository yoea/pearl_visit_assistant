import type { AnonymizationOutput, MappedColumn } from './student';
import type { SecurityScanResult } from '../security/scanner';
import type { AnalysisResult } from '../analysis/provider';
import type { Report } from '../report/types';

export type Stage = 'idle' | 'parsed' | 'anonymized' | 'scanned' | 'analyzed';

/** parsed 阶段：只含摘要与映射，绝不包含原始行数据 */
export interface ParsedState {
  schoolName: string;
  cohort: string;
  sheetName: string;
  rowCount: number;
  fieldCount: number;
  headerRowIndex: number;
  mappedColumns: MappedColumn[];
}

export type PipelineState =
  | { stage: 'idle' }
  | (ParsedState & { stage: 'parsed' })
  | { stage: 'anonymized'; output: AnonymizationOutput }
  | { stage: 'scanned'; output: AnonymizationOutput; scan: SecurityScanResult }
  | {
      stage: 'analyzed';
      output: AnonymizationOutput;
      scan: SecurityScanResult;
      result: AnalysisResult;
      report: Report;
    };

export type PipelineEvent =
  | { type: 'PARSE_SUCCEEDED'; parsed: ParsedState }
  | { type: 'ANONYMIZE_SUCCEEDED'; output: AnonymizationOutput }
  | { type: 'SCAN_SUCCEEDED'; output: AnonymizationOutput; scan: SecurityScanResult }
  | {
      type: 'ANALYSIS_SUCCEEDED';
      output: AnonymizationOutput;
      scan: SecurityScanResult;
      result: AnalysisResult;
      report: Report;
    }
  | { type: 'RETURN_TO_SCAN' }
  | { type: 'RESET' };
