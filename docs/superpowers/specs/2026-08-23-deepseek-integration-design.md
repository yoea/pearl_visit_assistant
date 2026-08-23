# 第二阶段设计文档：接入真实 AI 分析 API（DeepSeekAnalysisProvider）

- 日期：2026-08-23
- 状态：已与用户逐块确认（设计三块全部确认），待用户审阅本文档
- 上游需求：用户第二阶段需求全文（20 节），其安全要求为最高优先级

## 1. 背景与目标

第一阶段已完成纯前端闭环：本地 Excel 导入解析 → 脱敏 → 匿名 ID → 发送前安全检查 → Mock AI 分析 → 报告展示/下载 Markdown（44 提交，119/119 测试）。

第二阶段目标：**在不破坏第一阶段安全架构的前提下**接入真实 AI 分析（分析服务器端使用 DeepSeek 模型），同时保留 MockAnalysisProvider 作为默认与回退路径。

本文档是前端实现与**服务端开发者**的共同契约。第 4 节协议契约 + 第 4.5 节服务端提示词约束可直接交给服务端开发者实现。

## 2. 安全红线（最高优先级，不可妥协）

以下不变量在第二阶段**继续收紧、绝不放宽**。若现有代码与红线冲突，修改现有代码。

1. **原始学生数据永远不出本机**。只有经过本地脱敏和安全检查的数据才能发送给 AI。
2. **禁止发送字段**：姓名、身份证、电话、QQ、微信、邮箱、详细地址、教师姓名、珍珠号。
3. **不持久化**：无 localStorage/IndexedDB/Cookie/服务端日志落盘；临时匿名 ID 仅内存。
4. **间接识别数据通用化**：排名 → 区间等（第一阶段规则不变）。
5. **发送前强制 SecurityScanner，不可绕过**；命中即 fail-closed 拒绝发送。
6. **AI 绝不能输出「通过/淘汰/建议资助/建议淘汰」结论**（及任何等价筛选排序表述）。AI 只能分析、总结、核实、提问、建议；最终判断权在工作人员。
7. **原始对象绝不进入** fetch/XMLHttpRequest/WebSocket/URL/request body/headers/query parameters/console.log/analytics/error tracking/第三方 SDK。
8. **前端绝不保存 DeepSeek API Key**。不引入任何 `VITE_*_API_KEY` 类环境变量（浏览器环境变量会进构建产物）。Key 只配置在分析服务器端。
9. **不自动发送**。用户必须主动点击「确认并开始 AI 分析」。
10. **不信任调用方数据**。DeepSeekAnalysisProvider 内部必须再次执行 SecurityScanner；出站 payload 必须在构造后、fetch 前再扫描一次。

## 3. 范围

**做**：前端接入真实分析 API 的全部工作（协议、网络层、provider、UI、测试、文档）；协议契约与服务端提示词约束的书面定义（供服务端开发者实现）。

**不做**：分析服务器本身的实现/部署（服务器另备）；API Key 的任何前端配置；API 地址的运行时 UI 切换（仅环境变量，见 5.3）。

## 4. API 协议契约 v1.0

### 4.1 端点与请求

- 方法：`POST {VITE_ANALYSIS_API_URL}`（如 `https://analysis.example.org/api/analyze`）
- 请求头：`Content-Type: application/json`、`Accept: application/json`
- 超时：默认 30 秒，可用 `VITE_ANALYSIS_TIMEOUT_MS` 覆盖

```json
{
  "version": "1.0",
  "requestId": "7d2f9e1a-4b6c-4d8e-9f3a-2c5b8e0d7a41",
  "school": { "name": "已脱敏学校名称" },
  "cohort": "已脱敏届别",
  "students": [
    {
      "id": "student-001",
      "data": { "gender": "男", "familySituation": "…已清洗文本…", "perCapitaIncome": 8000, "distanceToSchoolKm": null }
    }
  ]
}
```

- `version`：协议版本，恒为 `"1.0"`。
- `requestId`：前端每次分析用 `crypto.randomUUID()` 生成，仅用于服务端日志关联（服务端日志可记录 requestId、耗时、学生数量、成功/失败——详见 7.2）。
- `school.name`：保持第一阶段规则不放开——即第一阶段已允许发送的学校名称形式；服务端**不得**据学校名扩展推断具体地址或要求更精确名称。
- `cohort`：第一阶段允许发送的届别形式。
- `students[].id`：临时匿名 ID（`student-001` 形式，仅本次会话内存有效）。
- `students[].data`：`AnonymizedStudent` 的 **34 个已脱敏数据字段**（不含 anonymousId，其作为外层 `id` 传输），字段全集如下，任何字段可为 `null`（`null` = 材料未提供，**不得臆测填值**）：

```
gender, ethnicity, householdType, height, weight, healthStatus,
difficultyLevel, enrollmentStatus, province, city, county,
ancestralHome, distanceToSchoolKm, zhongkaoFullScore, zhongkaoScore,
admissionRankBand, gradeSize, familySituation, visitMethod,
visitSummary, awardsAndInterests, applicationReason, approvalComment,
housingStatus, transportation, annualIncome, annualIncomeNote,
perCapitaIncome, schoolChildrenCount, difficultyReason,
elderlySupportStatus, elderlySupportNote, debtStatus, debtNote
```

（未来若 `AnonymizedStudent` 增加字段，**不会**自动进入 `data`——见 5.2 白名单拷贝。）

### 4.2 响应

```json
{
  "version": "1.0",
  "schoolAnalysis": {
    "overview": "全校整体情况概述段落",
    "studentCount": 12,
    "difficultyPatterns": ["低收入家庭 5 人，占 42%", "…"],
    "commonIssues": ["…"],
    "dataQualityIssues": ["…"],
    "keyVerificationTopics": ["…"],
    "interviewSuggestions": ["…"]
  },
  "students": [
    {
      "studentId": "student-001",
      "summary": "该生材料要点摘要",
      "familySituation": "家庭情况归纳（仅材料明确说明的事实）",
      "mainDifficultyFactors": [
        { "factor": "家庭负债", "evidence": "材料显示存在负债（引用原文摘录）", "importance": "high" }
      ],
      "informationToVerify": ["…面谈待核实点…"],
      "interviewQuestions": ["…5-8 个开放式中性问题…"],
      "interviewNotes": ["…面谈注意事项…"]
    }
  ]
}
```

契约约束（前端 zod 校验强制，违反即「结果格式错误」）：

- `version` 必须为 `"1.0"`。
- `schoolAnalysis` 七个字段全部必填：`overview`（非空字符串）、`studentCount`（非负整数）、`difficultyPatterns` / `commonIssues` / `dataQualityIssues` / `keyVerificationTopics` / `interviewSuggestions`（字符串数组，元素非空）。
- `students` 数组**必须与请求 `students` 一一对应**：数量一致且每个 `studentId` 都能在请求中找到（顺序不限）；多出、缺失、或出现请求中不存在的 `studentId` → 结果格式错误（宁可整次失败重试，不可静默丢学生）。
- `mainDifficultyFactors[].importance` 枚举：`"high" | "medium" | "low"`；`factor` / `evidence` 非空字符串。
- `interviewQuestions` **每个学生 5-8 个**（`z.string().array().min(5).max(8)`）。
- zod 校验**非严格模式**：未知多余键忽略（AI 可能附带额外键，不影响已知字段渲染）。
- 响应文本中**不得出现任何学生姓名**（服务端从未收到姓名，属服务端提示词约束，见 4.5）。

### 4.3 HTTP 状态码与前端错误分类

| HTTP 状态 | 前端错误类别 | 用户可见文案（不展示服务端错误原文） |
|---|---|---|
| fetch 异常（断网/DNS/拒绝） | `network` 网络错误 | 网络连接失败，请检查网络后重试。 |
| 超时（默认 30s） | `timeout` 超时 | 分析请求超时，请稍后重试。 |
| 400 / 401 / 403 / 404 | `configuration` 配置错误 | 分析服务配置有误，请联系系统管理员。 |
| 429 | `rate-limited` 限流 | 请求过于频繁，请稍候片刻再试。 |
| 500 / 其他 5xx | `server` 服务器错误 | 分析服务暂时不可用，请稍后重试。 |
| 2xx 但 JSON 修复+校验失败 / version 不匹配 / 学生集合不一致 | `format` 结果格式错误 | 分析结果格式异常，请重试；若反复出现请联系系统管理员。 |
| 三道扫描任一命中 | 安全检查失败（`SecurityViolationError`） | 数据未通过发送前安全检查，已阻止发送，请返回检查数据。 |

### 4.4 JSON 修复策略（前端侧）

服务端提示词要求严格 JSON（见 4.5），但 AI 输出仍可能带 markdown 围栏或前后缀。前端策略：

1. 响应文本尝试直接 `JSON.parse`；
2. 失败则修复一次：剥离 ``` ```json ``` / ``` ``` 围栏 → 提取**首个平衡的 `{...}`** 块；
3. 修复后重新解析 + zod 校验；
4. 仍失败 → `format` 错误，**绝不静默吞掉、绝不展示为正常结果**。

### 4.5 服务端实现须知（含提示词约束）

服务端职责：接收 4.1 请求 → 调 DeepSeek 模型 → 输出 4.2 响应。API Key 只存在于服务端。模型选择由服务端决定（前端不感知模型名、不传输模型名）。

提示词必须包含以下约束（前端无法替服务端执行，属**服务端必做**）：

- **角色**：走访面谈准备助手，不是资格审批器。严禁输出「通过/不通过/建议资助/建议淘汰/建议重点资助」及任何等价筛选、排序、结论性表述；最终判断权在基金会工作人员。
- **只能**：分析、总结、核实、提问、建议。
- **可追溯**：所有分析必须能追溯到学生申请材料；禁止编造材料中不存在的信息；`evidence` 必须引用材料原文摘录。
- **事实与推测分离**：`summary` / `familySituation` / `mainDifficultyFactors` 只写材料明确说明的事实；推测内容只允许出现在 `interviewNotes`（须以「推测：」标注）或 `informationToVerify`。禁止把推测写成事实。
- **面谈问题 5-8 个**：开放式、中性、尊重学生、不带诱导、不预设答案、避免让学生产生「基金会正在审查我」的压力、不重复材料已非常明确的信息。
  - 正例：「家里现在主要靠什么维持日常开支呢？」「平时上下学是怎么安排的？」
  - 反例：「你们家是不是很困难？」「你父亲是不是没有劳动能力了？」「家里这么困难，你有什么感受？」
- **输出格式**：严格 JSON（4.2 结构），不得输出 markdown 围栏以外的任何内容；简体中文。
- **逐生分析**：`students` 必须与请求一一对应，`studentId` 原样回显；学校级归纳不得包含任何学生姓名。
- **null 字段**：表示材料未提供，不得臆测填值；可列入 `dataQualityIssues` 或 `informationToVerify`。

## 5. 前端架构

### 5.1 模块分层与依赖方向

```
UI（App / 组件）
  │ AnalysisRequest + nameBlacklist
  ▼
AnalysisService（硬闸①：scanPayload + 姓名黑名单）—— 第一阶段既有，不改
  │ AnalysisRequest
  ▼
DeepSeekAnalysisProvider（重扫②：scanPayload 规则级；不信任调用方）
  │ AnalysisRequest
  ▼
payload.ts：createAnalysisPayload → WireAnalysisRequest（唯一出站构造点，字段显式白名单拷贝）
  │ WireAnalysisRequest
  ▼
payload.ts：scanOutboundPayload（最终扫描③：规则 + 禁止字段名 + 结构守卫）
  │
  ▼
analysis-client.ts：fetch（唯一网络出口，30s AbortController）
```

Mock 路径：`AnalysisService → MockAnalysisProvider`（本地确定性规则引擎，零网络）。

依赖方向单向向下：UI 不知道网络层存在；网络层只接受 `WireAnalysisRequest` 类型（原始 `RawStudentRecord` 类型不兼容，编译期即无法混入）。

### 5.2 三重扫描链（设计要点锁定）

| 层 | 位置 | 内容 |
|---|---|---|
| ① 硬闸 | `AnalysisService.analyze`（既有） | `scanPayload(request, nameBlacklist)`，含上下文姓名黑名单，UI 无法绕过 |
| ② 重扫 | `DeepSeekAnalysisProvider.analyze` | `scanPayload(request, 空黑名单)` 规则级重扫（不信任调用方；姓名黑名单上下文检查由①唯一负责，provider 接口签名保持第一阶段 `analyze(request)` 不变） |
| ③ 出站终扫 | `createAnalysisPayload` 之后、fetch 之前 | `scanPayload(payload, 空黑名单, { exemptAddressPaths: ['school.name'] })`——对最终 wire JSON 做规则 + 禁止字段名 + 结构守卫；`school.name` 豁免地址子句检测（与第一阶段 `schoolName` 豁免语义一致：校名合法含省市县字样，其余规则照常） |

任一命中 → 抛 `SecurityViolationError` → 不发 fetch。②③ 对 scanner 的豁免扩展通过 `scanPayload` 新增**可选**第三参数实现，默认行为不变（第一阶段调用不受影响）。

`createAnalysisPayload` 的 `data` 构造为**逐字段显式拷贝** 34 个白名单字段（不用 spread）：未来 `AnonymizedStudent` 新增字段不会自动扩散出站，新增字段必须显式加入白名单并经评审。

### 5.3 Provider 工厂与环境变量

新模块 `src/analysis/provider-factory.ts`：

```ts
export function createAnalysisService(options?: {
  apiUrl?: string;
  timeoutMs?: number;
}): AnalysisService
```

- provider 种类由 `import.meta.env.VITE_ANALYSIS_PROVIDER` 决定：`'mock'`（默认，含未设置与未知值）或 `'real'`。
- `real` 时 `VITE_ANALYSIS_API_URL` 必填；**未配置 → 回退 Mock + `console.warn` 常量提示**（绝不静默假装真实 AI）。
- `VITE_ANALYSIS_TIMEOUT_MS` 可选，默认 30000，解析非法按默认。
- 环境变量三件套（新增 `src/vite-env.d.ts` 类型声明）：`VITE_ANALYSIS_PROVIDER`、`VITE_ANALYSIS_API_URL`、`VITE_ANALYSIS_TIMEOUT_MS`。**绝不**新增任何 Key 类变量。
- 网络相关类（`DeepSeekAnalysisProvider`、`AnalysisClient`）**不从工厂模块公共导出**；对外只有 `createAnalysisService`、`AnalysisService`、`SecurityViolationError`。UI 唯一入口：`createAnalysisService()`。

### 5.4 统一新结果结构（无 adapter 层）

`src/analysis/provider.ts` 重构为（Mock 与真实 provider 共用同一结构，无中间转换层）：

```ts
export type Importance = 'high' | 'medium' | 'low';
export interface DifficultyFactor { factor: string; evidence: string; importance: Importance; }
export interface SchoolAnalysis {
  overview: string; studentCount: number;
  difficultyPatterns: string[]; commonIssues: string[];
  dataQualityIssues: string[]; keyVerificationTopics: string[];
  interviewSuggestions: string[];
}
export interface StudentAnalysis {
  studentId: string; summary: string; familySituation: string;
  mainDifficultyFactors: DifficultyFactor[];
  informationToVerify: string[]; interviewQuestions: string[]; interviewNotes: string[];
}
export interface AnalysisResult { schoolAnalysis: SchoolAnalysis; students: StudentAnalysis[]; }
export interface AnalysisProvider { readonly name: string; analyze(request: AnalysisRequest): Promise<AnalysisResult>; }
```

旧结构（`SchoolOverview` / `StudentInterviewGuide` / `basicInfo` / `weight` 等）删除。`basicInfo` 不再由分析结果携带——报告的基本信息表改由本地 `AnonymizedStudent` + `nameIndex` 渲染（数据已在内存中，无需 AI 回传）。

### 5.5 Mock 改造映射

`MockAnalysisProvider` 输出同步改造为新结构（无网络、无重扫，经①硬闸后调用）：

| 旧 | 新 | 规则 |
|---|---|---|
| `SchoolOverview.studentCount` | `SchoolAnalysis.studentCount` | 不变 |
| `difficultyDistribution` | `difficultyPatterns` | `「{困难类型}：{n}人」` 字符串数组，按人数降序 |
| `lowIncomeCount/ratio`、`majorIllnessCount`、`singleParentOrWeakLaborCount`、`highDebtCount`、`rentalCount`、`longDistanceCount`、`focusStudentIds` | 合并进 `overview` 统计句（「全校 12 人，低收入 5 人…建议重点关注 …」） | 由既有统计合成，不引入材料外事实 |
| `completeness` | `dataQualityIssues` | `「student-001 缺失 n/34 项材料」` 等字符串数组 |
| `suggestions` | `interviewSuggestions` | 不变 |
| —（新增） | `keyVerificationTopics` | 聚合各生 `informationToVerify` 主题去重 |
| —（新增） | `commonIssues` | 由既有统计合成共性描述 |
| `StudentInterviewGuide.anonymousId` | `StudentAnalysis.studentId` | 不变 |
| `basicInfo` | 删除 | 报告本地渲染 |
| `reasonSummary` | `summary` | 不变 |
| `familySummary` | `familySituation` | 不变 |
| `difficultyFactors{label,weight}` | `mainDifficultyFactors{factor,importance}` | `weight ≥3 → high`，`2 → medium`，`1 → low`；`evidence` 不变 |
| `verificationPoints` | `informationToVerify` | 不变 |
| `suggestedQuestions` | `interviewQuestions` | 必须满足 5-8 个：不足从 `question-templates.ts` 模板池补齐，超出截断 |
| `cautions` | `interviewNotes` | 不变 |

Mock 输出在测试中经 4.2 同构 zod schema 校验，保证两条 provider 路径的 UI 契约一致。

## 6. UI 流程

### 6.1 发送数据预览（SendPreviewStep）

`scanned` 阶段新增 confirm 视图子态（**不新增 Stage、pipeline reducer 不动**），与第一阶段 `anonymized` 阶段的 stats/preview 双子态模式一致：

- `SecurityStep` 原「开始分析」按钮改为「下一步：发送预览」（`onAnalyze` prop 改为 `onNext`）；扫描未通过时保持既有 findings 展示 + 重新处理。
- 点击后渲染新组件 `SendPreviewStep`：
  - **将发送摘要**：学校名称、届别、学生人数、每生 34 个已脱敏字段。
  - **未发送字段清单**（✓ 绿色对勾列表）：姓名、身份证号、电话号码、QQ、微信、邮箱、详细地址、教师/审批人姓名、珍珠号、原始 Excel 文件本身、未识别字段——来自 `field-policies.ts` 的 identity/third-party/unknown 分类。
  - 安全说明：已通过三道安全检查；匿名 ID 仅本次会话内存有效；仅发送至指定分析服务器。
  - 按钮：**[返回检查]**（回 SecurityStep 视图，scan 状态不变）与 **[确认并开始 AI 分析]**（primary）。
  - **不自动发送**：组件挂载本身零网络调用；只有点击确认才触发 `handleAnalyze`。
  - `analyzing` 时确认按钮禁用并显示「AI 分析中，请勿关闭页面…」，同时禁用 [返回检查]（防中途离开造成状态困惑）。
  - 失败时在按钮下方红色横幅显示 4.3 分类文案。
- `handleReset` 同步重置 confirm 子态。

### 6.2 报告展示（新结构渲染）

`ReportStep` 改造：

- **学校分析区**：`overview` 段落 + `difficultyPatterns` / `commonIssues` 列表 + `dataQualityIssues`（黄色提示样式）+ `keyVerificationTopics` + `interviewSuggestions`。
- **学生列表**：每行显示姓名（本地 `nameIndex` 映射）+ 匿名 ID + `summary` 摘要 + importance 徽标计数。
- **点击展开单生详情**：`mainDifficultyFactors` 表格（factor / evidence / importance Badge）、`informationToVerify`、`interviewQuestions`（编号展示）、`interviewNotes`。
- 报告**绝不保存**：内存态（既有行为），刷新即失；下载 Markdown 保留（`generateReport` 同步改造为新结构）。

## 7. 统计与日志

### 7.1 使用统计（内存态扩展）

`UsageEvent` 扩展为：`'imported' | 'analysisStarted' | 'analysisSucceeded' | 'analysisFailed'`（原 `'analysisCompleted'` 移除，由 succeeded/failed 取代；启动次数 = 两者之和）。`UsageSnapshot` 增加 `analysisFailures`。`analysisFailed` 的 meta 仅允许 `{ errorCategory?: string }`（错误类别枚举，**绝不含**服务端响应原文）。`trackEvent` 语义保持：绝不收集学生信息、匿名 ID、学校与学生的关系、申请理由、家庭信息、原始 Excel、AI prompt、AI response。

### 7.2 API 日志白名单

前端**不保留任何 API 请求/响应日志**（不输出完整 request body、不打印响应）。`console.warn` / `console.error` 仅允许常量文案（参数不含任何数据对象），且仅限 `src/analysis/` 目录内使用；`console.log` / `info` / `debug` / `trace` 全域禁止。服务端日志白名单：`requestId`、耗时、学生数量、成功/失败、错误类型（禁止姓名/证件/电话/家庭情况/申请理由/住址/完整 request body）。

## 8. 测试策略

### 8.1 新增测试

| 文件 | 覆盖 |
|---|---|
| `tests/payload.test.ts` | `createAnalysisPayload` 结构/版本/requestId 断言；**白名单拷贝**（给 AnonymizedStudent 挂额外属性 → 不进入 payload）；34 字段全集逐项比对；出站扫描拦截（payload 内塞假身份证/手机号/详细地址 → ③命中）；`school.name` 豁免地址子句但其余规则照常；zod schema 合法/非法响应判定（7 学校字段、importance 枚举、问题数 5-8 边界、学生集合一致性）；JSON 修复（围栏剥离、首 `{...}` 提取、修复失败） |
| `tests/analysis-client.test.ts` | mock fetch：2xx 合法 → 解析成功；400/401/403/404 → configuration；429 → rate-limited；5xx → server；网络 reject → network；Abort → timeout；非法 JSON → 修复成功 / 修复失败 → format；fake timers 验证 30s 超时；请求头/方法/body 断言 |
| `tests/deepseek-provider.test.ts` | 重扫②命中（塞假手机号）→ 抛 `SecurityViolationError` 且 fetch spy 零调用；通过后 fetch 恰一次且 body 为脱敏 payload；响应 → 新结构映射；学生集合不一致 → format |
| `tests/send-preview.test.tsx` | 组件测试（`@vitest-environment jsdom` + @testing-library/react）：挂载后零网络调用；点击确认 → `onConfirm`；点击返回 → `onBack`；未发送清单渲染；analyzing 态按钮禁用 |

### 8.2 既有测试修改

- `tests/no-persistence.test.ts`：守卫改造为**白名单机制**——全局禁止 `localStorage`、`sessionStorage`、`indexedDB`、`document.cookie`、`axios`、`XMLHttpRequest`、`sendBeacon`、`WebSocket`、`process.`、`console.log/info/debug/trace`；`fetch(` 仅允许出现在 `src/analysis/analysis-client.ts`；`console.warn/error` 仅允许出现在 `src/analysis/` 目录；新增子测试——`RawStudentRecord` 的 import 仅允许 `raw-store.ts`、`types/student.ts`、`excel-parser.ts`、`App.tsx`。
- `tests/mock-provider.test.ts`：新结构断言 + 映射表逐项 + 问题数 5-8 + zod 契约校验。
- `tests/report.test.ts`、`tests/analysis-service.test.ts`、`tests/usage-stats.test.ts`：随新结构/新事件更新。

### 8.3 特别安全测试（用户第十八节 7 项落地映射）

| # | 用户要求 | 落地 |
|---|---|---|
| 1 | 假身份证/手机号/姓名/地址必须被拦截 | scanner 既有用例 + `payload.test.ts` 出站扫描用例 + `deepseek-provider.test.ts` 重扫用例 |
| 2 | 绕过 UI 直接调 provider 也必须被扫描 | `deepseek-provider.test.ts`（重扫②命中即抛、fetch 零调用） |
| 3 | console.log 不得打印原始 Excel 数据 | 守卫禁止全部 `console.log` API + `RawStudentRecord` import 白名单子测试 |
| 4 | fetch 检查 | 守卫：`fetch(` 仅 `analysis-client.ts`；`AnalysisClient.analyze` 签名只接受 `WireAnalysisRequest`（原始类型编译期不兼容） |
| 5 | localStorage/indexedDB 不得接触数据 | 守卫全局禁止持久化 API |
| 6 | 逐项搜索 localStorage/indexedDB/fetch/axios/XMLHttpRequest/console.log | 守卫自动化（8.2 改造后的 `no-persistence.test.ts`） |
| 7 | 端到端：含敏感数据的输入经完整管线后出站 | 组合测试：AnonymizedStudent（含清洗后残留的假敏感串）→ createAnalysisPayload → ③扫描拦截，断言 fetch 不调用 |

### 8.4 依赖与配置

- 新增依赖：`zod`（响应校验）；devDependencies：`@testing-library/react`、`jsdom`（组件测试，测试文件顶部 `// @vitest-environment jsdom`，不改全局 vitest 配置）。
- 验收基线：现有 119 测试改造后全绿 + 新增测试全绿。

## 9. 文件清单

**新增（src）**：`src/analysis/payload.ts`、`src/analysis/analysis-client.ts`、`src/analysis/deepseek-provider.ts`、`src/analysis/provider-factory.ts`、`src/components/SendPreviewStep.tsx`、`src/vite-env.d.ts`。

**修改（src）**：`src/analysis/provider.ts`（新结构）、`src/analysis/mock-provider.ts`（5.5 映射）、`src/analysis/question-templates.ts`（问题池补齐至 5-8）、`src/security/scanner.ts`（`scanPayload` 可选第三参数：地址子句豁免路径）、`src/App.tsx`（工厂、confirm 子态、SendPreviewStep、统计事件）、`src/components/SecurityStep.tsx`（`onNext`）、`src/components/ReportStep.tsx`（新结构渲染）、`src/report/generator.ts` / `src/report/markdown.ts` / `src/report/types.ts`（新结构）、`src/stats/usage-stats.ts`（事件扩展）。

**新增（tests）**：`tests/payload.test.ts`、`tests/analysis-client.test.ts`、`tests/deepseek-provider.test.ts`、`tests/send-preview.test.tsx`。

**修改（tests）**：`tests/no-persistence.test.ts`、`tests/mock-provider.test.ts`、`tests/report.test.ts`、`tests/analysis-service.test.ts`、`tests/usage-stats.test.ts`。

**其他**：`package.json`（zod / testing-library / jsdom）、`.gitignore`（追加 `!.env.example` 例外）、新增 `.env.example`（仅三个变量说明，无任何 Key）、`README.md`（环境变量、协议摘要、服务端对接指引指向本文档）。

## 10. 用户决策记录（含控制器裁决）

1. 范围：只做前端 + 协议文档；分析服务器另备（用户裁决）。
2. 统一新结构：Mock 与真实 provider 共用 `AnalysisResult` 新结构，无 adapter（用户裁决）。
3. 统计：内存态，放弃「应用打开次数」（与不持久化红线冲突，用户裁决）。
4. 架构：四模块分层（deepseek-provider / analysis-client / payload / provider-factory）（用户裁决）。
5. provider 接口沿用第一阶段签名 `analyze(request: AnalysisRequest)`（用户：继续使用第一阶段已设计好的）；姓名黑名单上下文检查仅存在于 AnalysisService 硬闸①。
6. JSON 修复：剥 markdown 围栏 + 提取首个平衡 `{...}`，只修一次（控制器裁决）。
7. 超时默认 30s，可 `VITE_ANALYSIS_TIMEOUT_MS` 覆盖（控制器裁决）。
8. `requestId = crypto.randomUUID()`（控制器裁决）。
9. 学校级数组元素为 `string[]`；证据可追溯性落在学生级 `evidence` 字段 + 服务端提示词约束（控制器裁决）。
10. `real` 未配 URL → 回退 Mock + `console.warn`（控制器裁决）。
11. 响应学生集合必须与请求一致，否则 format 错误（控制器裁决）。
12. zod 非严格模式（未知键忽略）（控制器裁决）。
13. `interviewQuestions` 前端 zod 强制 5-8 个（契约级执行用户硬性要求）（控制器裁决）。
14. `console.warn/error` 允许（仅常量文案、限 `src/analysis/`）；其余 console API 全域禁止（控制器裁决）。
15. 组件测试引入 jsdom + @testing-library/react（保障「不自动发送」）（控制器裁决）。
16. `.env.example` 提供（含 gitignore 例外），不含任何 Key（控制器裁决）。
17. 出站扫描对 `school.name` 豁免地址子句检测，其余规则照常（与第一阶段 schoolName 豁免一致）（控制器裁决）。

## 11. 完成汇报（需求第二十节的 10 项）

实施完成后按以下 10 项汇报：

1. 新增/修改模块与文件清单（含测试文件）。
2. 数据流与三重安全扫描链验证结果（含哪些测试覆盖）。
3. 协议契约摘要（请求/响应/版本/错误码/JSON 修复）。
4. UI 流程说明（发送预览、手动确认机制、报告展开）。
5. 错误分类文案表落地情况（七类）。
6. 统计事件与日志白名单执行情况。
7. 测试结果：总数 / 新增数 / 失败数。
8. 特别安全测试 7 项逐项结果（8.3 表）。
9. 环境变量配置说明（三变量、无 Key、回退行为）。
10. 服务端实现须知与对接指引（指向 4.5 与本文档）。

## 12. 实施顺序建议（供实现计划参考）

1. 新结果结构 + Mock 改造 + report/统计改造（纯本地，先稳定新契约）。
2. `payload.ts` 协议层 + scanner 豁免参数 + 测试。
3. `analysis-client.ts` 网络层 + 测试。
4. `deepseek-provider.ts` + 重扫 + 测试。
5. `provider-factory.ts` + 环境变量 + 守卫白名单改造。
6. UI：SecurityStep `onNext` + SendPreviewStep + App 接线 + 组件测试。
7. 文档（README / `.env.example`）+ 全量回归 + 8.3 七项核对 + 10 项汇报。
