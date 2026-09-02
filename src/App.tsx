import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
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
import { recordTokenUsage, type CumulativeTokenUsage } from './stats/token-usage-store';
import { saveReport, loadReport, deleteReport } from './stats/report-store';
import { reportOpen, reportAnalysisSucceeded, reportAnalysisFailed, usageStatsUrl } from './stats/usage-reporter';
import { APP_TITLE, APP_VERSION } from './app-config';
import type { TokenUsage } from './analysis/provider';
import type { MappedColumn, RawStudentRecord } from './types/student';
import type { ParsedState, Stage } from './types/pipeline';
import type { Report } from './report/types';
import Stepper from './components/Stepper';
import ImportStep from './components/ImportStep';
import ProcessStep from './components/ProcessStep';
import ReportStep from './components/ReportStep';
import ReportArchiveList from './components/ReportArchiveList';
import HelpPage from './components/HelpPage';

const usageStats = new InMemoryUsageStats();
// provider 种类由环境变量决定（mock 默认 / real），网络 provider 仅工厂内部构造
const analysisService = createAnalysisService();

/** 阶段 → 步骤条序号（与 Stage 联合类型编译期锁定，漏配即报错） */
const STAGE_TO_STEP: Record<Stage, number> = {
  idle: 1, parsed: 1, anonymized: 2, scanned: 2, analyzed: 3,
};

export default function App() {
  const [state, dispatch] = useReducer(pipelineReducer, { stage: 'idle' });
  // 使用统计：打开工具上报一次（白名单计数，未配置接口地址时静默）
  useEffect(() => {
    reportOpen(APP_VERSION);
  }, []);
  // 帮助页视图：仅切换显示层，不影响流水线状态（帮助页返回后原进度原样保留）
  const [showHelp, setShowHelp] = useState(false);
  const [importError, setImportError] = useState<string | undefined>();
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | undefined>();
  // 最近一次分析的 token 用量 + 本机累计快照（仅真实 AI；mock 为 null 不展示）
  const [tokenStats, setTokenStats] = useState<{
    usage: TokenUsage; cumulative: CumulativeTokenUsage;
  } | null>(null);
  // 当前报告在本地存档中的 id（删除存档用）；从存档读取的旧报告视图（含其存档 id）
  const [currentReportId, setCurrentReportId] = useState<string | null>(null);
  const [archivedView, setArchivedView] = useState<{
    id: string; report: Report; nameIndex: Map<string, string>;
  } | null>(null);
  const [archiveNotice, setArchiveNotice] = useState<string | null>(null);
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
      // token 累计：仅真实 AI 有 usage；本机持久化只存计数数字（见 token-usage-store 白名单）
      const cumulative = result.usage ? recordTokenUsage(result.usage) : undefined;
      setTokenStats(
        result.usage && cumulative
          ? { usage: result.usage, cumulative }
          : null,
      );
      // 使用统计上报：分析成功（学生数 + token 用量；仅白名单计数，绝无学生数据）
      reportAnalysisSucceeded(APP_VERSION, state.output.students.length, result.usage, cumulative);
      // 报告自动存档到本浏览器（含姓名映射，仅本机；30 天未访问自动过期）
      const saved = saveReport(report, state.output.nameIndex);
      if (saved.ok) {
        setCurrentReportId(saved.id);
        setArchiveNotice(null);
      } else {
        setCurrentReportId(null);
        setArchiveNotice(saved.reason === 'quota'
          ? '本地存档空间不足，本次报告未存档（可删除旧报告后重新分析）。'
          : '当前浏览器不支持本地存档，本次报告仅本次会话可见。');
      }
      setArchivedView(null);
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
      // 使用统计上报：分析失败（仅类别枚举名）
      reportAnalysisFailed(APP_VERSION, category);
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
    setTokenStats(null);
    setCurrentReportId(null);
    setArchivedView(null);
    setArchiveNotice(null);
    dispatch({ type: 'RESET' });
  }, []);

  /** 步骤条点击跳转：1=导入页（重新开始）；2=脱敏及检查（仅本次分析有数据时回检查页，否则回导入页） */
  const handleStepClick = useCallback((step: number) => {
    if (step === 1) {
      handleReset();
    } else if (step === 2) {
      if (state.stage === 'analyzed') {
        setArchivedView(null);
        setTokenStats(null);
        dispatch({ type: 'RETURN_TO_SCAN' });
      } else {
        handleReset(); // 无本次分析数据（如正在查看存档）：回导入页
      }
    }
  }, [handleReset, state.stage]);

  /** 从主页存档列表打开一份旧报告（读档即续期 30 天） */
  const handleOpenArchived = useCallback((id: string) => {
    const loaded = loadReport(id);
    if (!loaded) return; // 已过期/不存在：列表下次挂载会自动刷新
    setArchivedView({ id: loaded.id, report: loaded.report, nameIndex: new Map(Object.entries(loaded.nameIndex)) });
    setTokenStats(null);
    setArchiveNotice(null);
  }, []);

  /** 彻底删除报告存档（报告页底部按钮；confirm 确认已由 ReportStep 完成）：
   *  分析完成页删除「当前报告」存档；存档查看页删除正在查看的报告。 */
  const handleDeleteReport = useCallback(() => {
    if (archivedView) {
      deleteReport(archivedView.id);
    } else if (currentReportId) {
      deleteReport(currentReportId);
    }
    setCurrentReportId(null);
    setArchiveNotice(null);
  }, [archivedView, currentReportId]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <h1 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
              {APP_TITLE}
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">{APP_VERSION}</span>
            </h1>
            <button
              type="button"
              onClick={() => setShowHelp(!showHelp)}
              title={showHelp ? '返回工具' : '帮助'}
              aria-label={showHelp ? '返回工具' : '帮助'}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 text-sm text-slate-400 hover:border-emerald-300 hover:text-emerald-700"
            >
              {showHelp ? '←' : '?'}
            </button>
          </div>
          <div className="mt-3">
            {/* 查看存档报告时视为「报告页」（步骤 3）；已完成步骤可点击跳转 */}
            <Stepper
              current={archivedView ? 3 : STAGE_TO_STEP[state.stage]}
              onStepClick={handleStepClick}
            />
          </div>
        </div>
      </header>
      <main className={`mx-auto w-full max-w-5xl flex-1 px-4 py-6 ${state.stage === 'analyzed' ? 'rounded-xl bg-emerald-50/60' : ''}`}>
        {showHelp && <HelpPage onBack={() => setShowHelp(false)} />}
        {/* 查看存档报告时独占主区域（首页列表不再堆叠显示） */}
        {!showHelp && state.stage === 'idle' && !archivedView && (
          <>
            <ImportStep onFile={handleFile} error={importError} />
            <div className="mt-4"><ReportArchiveList onOpen={handleOpenArchived} /></div>
          </>
        )}
        {!showHelp && archivedView && state.stage !== 'analyzed' && (
          <ReportStep
            report={archivedView.report}
            nameIndex={archivedView.nameIndex}
            tokenStats={null}
            archived
            onDelete={handleDeleteReport}
            onReset={handleReset}
          />
        )}
        {!showHelp && (state.stage === 'anonymized' || state.stage === 'scanned') && (
          <ProcessStep
            output={state.output}
            scan={'scan' in state ? state.scan : undefined}
            mappedColumns={mappingRef.current}
            meta={metaRef.current}
            providerName={analysisService.providerName}
            modelName={analysisService.modelName}
            analyzing={analyzing}
            error={analyzeError}
            onAnalyze={() => void handleAnalyze()}
            onReset={handleReset}
          />
        )}
        {!showHelp && state.stage === 'analyzed' && (
          <ReportStep
            report={state.report}
            nameIndex={state.output.nameIndex}
            tokenStats={tokenStats}
            onDelete={currentReportId ? handleDeleteReport : undefined}
            onReset={handleReset}
          />
        )}
        {!showHelp && archiveNotice && state.stage === 'analyzed' && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
            {archiveNotice}
          </div>
        )}
      </main>

      {/* 页脚：快速菜单（外链新窗口 + 帮助页内部切换）+ 版权 */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-4">
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
            <a
              href="https://boss.xhef.org/login"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-500 transition-colors hover:text-emerald-700"
            >
              项目管理平台
            </a>
            <button
              type="button"
              onClick={() => setShowHelp(!showHelp)}
              className="text-slate-500 transition-colors hover:text-emerald-700"
            >
              帮助页面
            </button>
            <a
              href="https://www.xhef.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-500 transition-colors hover:text-emerald-700"
            >
              基金会官网
            </a>
          </nav>
          <p className="mt-2 text-center text-xs text-slate-400">
            Copyright © 新华教育基金会 All Rights Reserved.
            {/* 不明显的使用统计入口：仅配置了上报接口时显示 */}
            {usageStatsUrl() && (
              <a
                href={usageStatsUrl()!}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-3 text-slate-300 hover:text-slate-500"
                title="使用情况统计"
              >
                使用统计
              </a>
            )}
          </p>
        </div>
      </footer>
    </div>
  );
}
