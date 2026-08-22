import { useCallback, useReducer, useRef, useState } from 'react';
import { pipelineReducer } from './state/pipeline';
import { parseExcel } from './excel/excel-parser';
import { mapFields } from './anonymization/field-mapper';
import { rawStore } from './anonymization/raw-store';
import { anonymize } from './anonymization/anonymizer';
import { scanPayload } from './security/scanner';
import { AnalysisService } from './analysis/analysis-service';
import { MockAnalysisProvider } from './analysis/mock-provider';
import { generateReport } from './report/generator';
import { InMemoryUsageStats } from './stats/usage-stats';
import type { RawStudentRecord } from './types/student';
import type { ParsedState, Stage } from './types/pipeline';
import Stepper from './components/Stepper';
import ImportStep from './components/ImportStep';
import MappingStep from './components/MappingStep';
import AnonymizeStep from './components/AnonymizeStep';
import PreviewStep from './components/PreviewStep';
import SecurityStep from './components/SecurityStep';
import ReportStep from './components/ReportStep';

const usageStats = new InMemoryUsageStats();
const analysisService = new AnalysisService(new MockAnalysisProvider());

/** 阶段 → 步骤条序号（与 Stage 联合类型编译期锁定，漏配即报错） */
const STAGE_TO_STEP: Record<Stage, number> = {
  idle: 1, parsed: 2, anonymized: 3, scanned: 5, analyzed: 6,
};

export default function App() {
  const [state, dispatch] = useReducer(pipelineReducer, { stage: 'idle' });
  const [anonymizedView, setAnonymizedView] = useState<'stats' | 'preview'>('stats');
  const [importError, setImportError] = useState<string | undefined>();
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | undefined>();
  const metaRef = useRef<{ schoolName: string; cohort: string }>({ schoolName: '', cohort: '' });
  const nameBlacklistRef = useRef<Set<string>>(new Set());

  const handleFile = useCallback(async (buffer: ArrayBuffer) => {
    setImportError(undefined);
    try {
      const parsed = parseExcel(buffer);
      const records: RawStudentRecord[] = parsed.rows.map((values, i) => ({
        sourceRow: parsed.rowNumbers[i], // Task 4 保留的真实工作表行号（跳过空行后仍准确）
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
      dispatch({ type: 'PARSE_SUCCEEDED', parsed: parsedState });
    } catch (e) {
      setImportError(e instanceof Error ? e.message : '文件解析失败');
    }
  }, []);

  const handleAnonymize = useCallback(() => {
    if (state.stage !== 'parsed') return;
    // 姓名黑名单只提取一次（O(n)），脱敏/扫描/分析全程复用；
    // 不能派生自 nameIndex：教师/审批人列可含多个姓名（按标点拆分），与学生全名集不同。
    nameBlacklistRef.current = rawStore.collectNameBlacklist();
    const output = anonymize(rawStore.snapshot(), state.mappedColumns, nameBlacklistRef.current);
    setAnonymizedView('stats');
    dispatch({ type: 'ANONYMIZE_SUCCEEDED', output });
  }, [state]);

  const handleScan = useCallback(() => {
    if (state.stage !== 'anonymized') return;
    const request = { meta: metaRef.current, students: state.output.students };
    const scan = scanPayload(request, nameBlacklistRef.current);
    dispatch({ type: 'SCAN_SUCCEEDED', output: state.output, scan });
  }, [state]);

  const handleAnalyze = useCallback(async () => {
    if (state.stage !== 'scanned' || !state.scan.passed || analyzing) return;
    setAnalyzing(true);
    setAnalyzeError(undefined);
    try {
      const request = { meta: metaRef.current, students: state.output.students };
      const result = await analysisService.analyze(request, nameBlacklistRef.current);
      const report = generateReport(result, metaRef.current, new Date());
      // 注意：analysisCompleted 不带人数——totalStudents 语义为「导入学生人数总和」，
      // 同一批学生已在 imported 计过，若此处再计会虚高一倍（Task 12 复审裁决）。
      usageStats.record('analysisCompleted');
      dispatch({
        type: 'ANALYSIS_SUCCEEDED',
        output: state.output,
        scan: state.scan,
        result,
        report,
      });
    } catch (e) {
      setAnalyzeError(e instanceof Error ? e.message : 'AI 分析失败');
    } finally {
      setAnalyzing(false);
    }
  }, [state, analyzing]);

  const handleReset = useCallback(() => {
    rawStore.clear();
    nameBlacklistRef.current = new Set();
    metaRef.current = { schoolName: '', cohort: '' };
    setImportError(undefined);
    setAnalyzeError(undefined);
    setAnonymizedView('stats');
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
      <main className="mx-auto max-w-5xl px-4 py-6">
        {state.stage === 'idle' && <ImportStep onFile={handleFile} error={importError} />}
        {state.stage === 'parsed' && <MappingStep state={state} onAnonymize={handleAnonymize} />}
        {state.stage === 'anonymized' && anonymizedView === 'stats' && (
          <AnonymizeStep output={state.output} onNext={() => setAnonymizedView('preview')} />
        )}
        {state.stage === 'anonymized' && anonymizedView === 'preview' && (
          <PreviewStep output={state.output} onNext={handleScan} onBack={() => setAnonymizedView('stats')} />
        )}
        {state.stage === 'scanned' && (
          <SecurityStep
            output={state.output}
            scan={state.scan}
            onAnalyze={() => void handleAnalyze()}
            analyzing={analyzing}
            error={analyzeError}
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
