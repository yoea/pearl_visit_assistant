import { useCallback, useReducer, useRef, useState } from 'react';
import { pipelineReducer } from './state/pipeline';
import { parseExcel } from './excel/excel-parser';
import { mapFields } from './anonymization/field-mapper';
import { rawStore } from './anonymization/raw-store';
import { anonymize } from './anonymization/anonymizer';
import { scanPayload } from './security/scanner';
import { createAnalysisService } from './analysis/provider-factory';
import { AnalysisClientError, SecurityViolationError } from './analysis/analysis-service';
import { generateReport } from './report/generator';
import { InMemoryUsageStats } from './stats/usage-stats';
import type { MappedColumn, RawStudentRecord } from './types/student';
import type { ParsedState, Stage } from './types/pipeline';
import Stepper from './components/Stepper';
import ImportStep from './components/ImportStep';
import ProcessStep from './components/ProcessStep';
import ReportStep from './components/ReportStep';

const usageStats = new InMemoryUsageStats();
// provider 种类由环境变量决定（mock 默认 / real），网络 provider 仅工厂内部构造
const analysisService = createAnalysisService();

/** 阶段 → 步骤条序号（与 Stage 联合类型编译期锁定，漏配即报错） */
const STAGE_TO_STEP: Record<Stage, number> = {
  idle: 1, parsed: 1, anonymized: 2, scanned: 2, analyzed: 3,
};

export default function App() {
  const [state, dispatch] = useReducer(pipelineReducer, { stage: 'idle' });
  const [importError, setImportError] = useState<string | undefined>();
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | undefined>();
  const metaRef = useRef<{ schoolName: string; cohort: string }>({ schoolName: '', cohort: '' });
  const nameBlacklistRef = useRef<Set<string>>(new Set());
  const mappingRef = useRef<MappedColumn[]>([]);

  /**
   * 导入即自动串联：解析 → 映射 → 脱敏 → 扫描，一次点击直达合并检查页（scanned）。
   * 关键：全程局部变量驱动，禁用 state.stage 守卫——批处理下读旧值会丢事件导致白屏。
   * 自动流转 ≠ 自动发送：AI 分析仍必须用户在检查页手动点击确认。
   */
  const handleFile = useCallback(async (buffer: ArrayBuffer) => {
    setImportError(undefined);
    setAnalyzeError(undefined);
    let parsed;
    try {
      parsed = parseExcel(buffer);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : '文件解析失败');
      return;
    }
    try {
      const records: RawStudentRecord[] = parsed.rows.map((values, i) => ({
        sourceRow: parsed.rowNumbers[i], // 保留真实工作表行号（跳过空行后仍准确）
        values,
      }));
      rawStore.setRecords(records);
      usageStats.record('imported', { studentCount: records.length });
      const mapping = mapFields(parsed.headers);
      const parsedState: ParsedState = {
        schoolName: parsed.schoolName ?? '未识别学校',
        cohort: parsed.cohort ?? '未填写',
        sheetName: parsed.sheetName,
        rowCount: parsed.rows.length,
        fieldCount: parsed.headers.filter((h) => h !== '').length,
        headerRowIndex: parsed.headerRowIndex,
        mappedColumns: mapping.mappedColumns,
      };
      metaRef.current = { schoolName: parsedState.schoolName, cohort: parsedState.cohort };
      mappingRef.current = mapping.mappedColumns;
      dispatch({ type: 'PARSE_SUCCEEDED', parsed: parsedState });
      // 姓名黑名单只提取一次（O(n)），脱敏/扫描/分析全程复用；
      // 不能派生自 nameIndex：教师/审批人列可含多个姓名（按标点拆分），与学生全名集不同。
      const blacklist = rawStore.collectNameBlacklist();
      nameBlacklistRef.current = blacklist;
      const output = anonymize(rawStore.snapshot(), mapping.mappedColumns, blacklist);
      dispatch({ type: 'ANONYMIZE_SUCCEEDED', output });
      // 扫描失败不是异常：仍 dispatch SCAN_SUCCEEDED，检查页显示红区并阻止发送
      const scan = scanPayload({ meta: metaRef.current, students: output.students }, blacklist);
      dispatch({ type: 'SCAN_SUCCEEDED', output, scan });
    } catch {
      // 意外异常兜底：固定文案 + 重置，绝不含技术错误细节
      rawStore.clear();
      setImportError('文件处理失败，请检查文件后重新导入。');
      dispatch({ type: 'RESET' });
    }
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (state.stage !== 'scanned' || !state.scan.passed || analyzing) return;
    setAnalyzing(true);
    setAnalyzeError(undefined);
    usageStats.record('analysisStarted');
    try {
      const request = { meta: metaRef.current, students: state.output.students };
      const result = await analysisService.analyze(request, nameBlacklistRef.current);
      const report = generateReport(result, metaRef.current, new Date(), state.output.students);
      usageStats.record('analysisSucceeded');
      dispatch({
        type: 'ANALYSIS_SUCCEEDED',
        output: state.output,
        scan: state.scan,
        result,
        report,
      });
    } catch (e) {
      // 统计只记录错误类别（白名单），绝不含服务端错误原文
      const category =
        e instanceof AnalysisClientError ? e.category
          : e instanceof SecurityViolationError ? 'security'
            : 'unknown';
      usageStats.record('analysisFailed', { errorCategory: category });
      // 错误文案：client 与安全检查错误的消息即分类文案，直显不包装；
      // 其他异常（编程错误/环境异常）一律用固定文案，绝不泄漏原始错误细节
      setAnalyzeError(
        e instanceof AnalysisClientError || e instanceof SecurityViolationError
          ? e.message
          : 'AI 分析失败，请重试。',
      );
    } finally {
      setAnalyzing(false);
    }
  }, [state, analyzing]);

  const handleReset = useCallback(() => {
    rawStore.clear();
    nameBlacklistRef.current = new Set();
    mappingRef.current = [];
    metaRef.current = { schoolName: '', cohort: '' };
    setImportError(undefined);
    setAnalyzeError(undefined);
    dispatch({ type: 'RESET' });
  }, []);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-4">
          <div className="flex items-center gap-2">
            <span className="rounded bg-emerald-700 px-2 py-0.5 text-xs font-medium text-white">隐私优先</span>
            <p className="text-xs text-slate-500">原始学生信息仅在本地浏览器处理，不存储、不上传。</p>
          </div>
          <div className="mt-3">
            <Stepper current={STAGE_TO_STEP[state.stage]} />
          </div>
        </div>
      </header>
      <main className={`mx-auto max-w-5xl px-4 py-6 ${state.stage === 'analyzed' ? 'rounded-xl bg-emerald-50/60' : ''}`}>
        {state.stage === 'idle' && <ImportStep onFile={handleFile} error={importError} />}
        {(state.stage === 'anonymized' || state.stage === 'scanned') && (
          <ProcessStep
            output={state.output}
            scan={'scan' in state ? state.scan : undefined}
            mappedColumns={mappingRef.current}
            meta={metaRef.current}
            providerName={analysisService.providerName}
            analyzing={analyzing}
            error={analyzeError}
            onAnalyze={() => void handleAnalyze()}
            onReset={handleReset}
          />
        )}
        {state.stage === 'analyzed' && (
          <ReportStep report={state.report} nameIndex={state.output.nameIndex} onReset={handleReset} />
        )}
      </main>
    </div>
  );
}
