# 珍珠生走访智能面谈辅助工具 — 设计文档

日期：2026-08-21
状态：已与用户逐节确认（字段策略表 / 数据模型与项目结构 / UI 与 Mock 分析）

## 1. 背景与目标

公益基金会每年 9–11 月走访「捡回珍珠计划」合作学校，对每校约 40–50 名候选珍珠生进行一对一面谈。工作人员从 BOSS 平台下载候选学生 Excel，希望在出发前由本工具完成：

1. Excel 本地读取、清洗、脱敏；
2. 脱敏数据调用大模型 API 做整体分析；
3. 生成「走访参考报告」：学校整体分析 + 单个学生面谈参考。

**核心定位**：AI 只提供分析参考，绝不输出「建议通过/淘汰」类结论；最终资格判断由工作人员综合申请材料、现场面谈、学校情况决定。

## 2. 安全边界（最高优先级，已确认采用方案一：分阶段安全流水线）

### 2.1 红线（不可协商）

- 纯前端：无后端、无数据库、无文件服务器、无用户系统、无真实 API 调用（v1）。
- 以下数据**绝对禁止**离开本机浏览器：学生姓名、身份证号、手机号、QQ、微信、邮箱、详细家庭住址、家访教师姓名、审批人、原始珍珠号、任何个人唯一编号。
- Excel 文件本身绝对不上传；不实现任何文件上传接口。
- 原始数据不写入 localStorage、IndexedDB、Cookie、console、错误监控、URL query；页面关闭后不留存。
- 发送前必须经过安全检查；命中即阻止发送，无绕过入口。

### 2.2 三道防线

1. **类型防线**：`AnonymizedStudent` 类型从定义上就不存在敏感字段——编译期无法把身份证号等写进 payload。
2. **数据访问防线**：解析后的原始数据只存放于受控 `RawStore`（仅内存、无序列化方法、刷新即失）。UI 组件只能拿到匿名视图与统计数字（字段名可展示、字段值不外泄）。
3. **运行时硬闸**：`AnalysisService.analyze()` 是唯一发请求的位置，`SecurityScanner` 在构造请求的最后一刻对完整 payload 扫描，命中即抛错拒绝。校验在数据层而非 UI 层，无法绕过。

### 2.3 关键架构决策

- **规则单一来源**：`TextScrubber`（发送前把叙事文本中的敏感片段掩码为 `[已隐藏]`）与 `SecurityScanner`（发送前硬闸）共用 `security/rules.ts` 同一套规则，杜绝两套规则不一致。
- **姓名黑名单**：从原始数据自身提取「珍珠生姓名 + 家访教师姓名 + 审批人」精确值集合，payload 出现任一精确姓名即拒绝（比模糊姓名正则可靠得多）。
- **间接识别防护**：全校排名泛化为区间（校内公示成绩排名是间接识别最强字段）；详细地址删除；叙事文本内嵌 PII 掩码。
- **扫描结果回显安全**：命中时只显示类别 + 掩码片段（如 `身份证号（2306****…）`），不回显完整敏感值。

## 3. 真实 Excel 结构发现（2026-08-21 检查）

文件：`examples/原始珍珠生信息（脱敏前）20260821163817457.xlsx`（含真实学生数据，仅作结构检查，已从项目内删除解包产物）。

- 单 Sheet「高中段珍珠生信息」，32 条学生数据。
- **第 1 行是合并标题（A1:H1），表头在第 2 行** → 解析器必须自动探测表头行，不能写死第一行。
- 表头 60 列（A–BH），与需求第三节列表一致；差异：`qq` 为小写、联系方式字段名为「电话」。
- 大量单元格为空（珍珠号、QQ、微信、邮箱、资金池名称、就读状态等）；结对捐方值为数字占位 `0`。
- 推断：字段名匹配必须做归一化（trim + 小写）；解析须容忍空单元格与列错位（SheetJS 按列字母对齐，本项目不自行按位置对齐）。

## 4. 数据模型

```ts
// 原始行：仅存在于受控 RawStore
type CellValue = string | number | boolean | null;
interface RawStudentRecord {
  sourceRow: number;
  values: Record<string, CellValue>;   // key = 归一化字段名
}

// 字段策略
type FieldAction =
  | { action: 'drop'; reason: 'identity' | 'third-party' | 'internal' | 'unknown' }
  | { action: 'keep' }
  | { action: 'scrub' }                 // 保留 + 文本级清洗
  | { action: 'generalize'; kind: 'rank-band' };

// 脱敏后的学生（类型上不含任何敏感字段）
interface AnonymizedStudent {
  anonymousId: string;              // student-001，与真实身份的对应仅存内存
  gender: string | null;
  ethnicity: string | null;         // 民族
  householdType: string | null;     // 户口（农村/城镇）
  height: string | null;
  weight: string | null;
  healthStatus: string | null;      // 健康情况
  difficultyLevel: string | null;   // 困难度
  enrollmentStatus: string | null;  // 就读状态
  province: string | null;          // 住址省
  city: string | null;              // 州市
  county: string | null;            // 县区
  ancestralHome: string | null;     // 籍贯
  distanceToSchoolKm: number | null;
  zhongkaoFullScore: number | null;
  zhongkaoScore: number | null;
  admissionRankBand: string | null; // 录取高中全校排名 → 已泛化为区间
  gradeSize: number | null;         // 全年级人数
  familySituation: string | null;           // scrub
  visitMethod: string | null;               // 家访方式
  visitSummary: string | null;              // scrub
  awardsAndInterests: string | null;        // scrub
  applicationReason: string | null;         // scrub
  approvalComment: string | null;           // scrub（用户确认保留审批意见）
  housingStatus: string | null;
  transportation: string | null;
  annualIncome: number | null;
  annualIncomeNote: string | null;          // scrub
  perCapitaIncome: number | null;
  schoolChildrenCount: number | null;       // 上学子女人数
  difficultyReason: string | null;          // scrub
  elderlySupportStatus: string | null;      // 需赡养老人情况
  elderlySupportNote: string | null;        // scrub
  debtStatus: string | null;
  debtNote: string | null;                  // scrub
}

interface AnalysisRequest {
  meta: { schoolName: string; cohort: string };
  students: AnonymizedStudent[];
}
```

### 4.1 流水线状态机

```
idle → parsed → anonymized → scanned → analyzed
```

每阶段只持有对应层级的数据：原始数据在 RawStore（与状态机解耦），匿名数据进入流程状态，报告在内存。任何阶段不可逆回退到原始数据视图。

## 5. 字段策略表（60 字段，已逐项确认）

匹配方式：表头名归一化（trim + 小写）→ 查策略表；**未命中 = 未知字段 = 默认不发送**（计入统计）。

### 5.1 删除（不发送）

| 原因 | 字段 |
|---|---|
| 直接身份信息 | 珍珠生姓名、身份证号、电话、qq、微信、邮箱、详细地址、珍珠号 |
| 第三方姓名 | 家访教师姓名、审批人、结对捐方 |
| 内部编号/常量/无分析价值 | 序号、学校编号、珍珠班名称、珍珠班编号、资助项目名称、拨款金额、期数、状态、就读状态变更时间、就读状态变更原因、结对要求、资金池名称、初中就读学校 |

### 5.2 泛化后发送

- 录取高中全校排名 → 区间：前 5% / 5–15% / 15–30% / 30–50% / 后 50%。

### 5.3 原样保留（结构化安全字段）

性别、民族、户口、身高、体重、健康情况、困难度、就读状态、住址省、州市、县区、籍贯、距离高中路程、中考满分、中考成绩、全年级人数、家访方式、住房状况、交通工具、年收入、人均年收入、上学子女人数、需赡养老人情况、负债情况。

（地区保留到县区级为 2026-08-21 用户确认的决策：走访人员本就知道所去县区，不构成额外识别风险。）

### 5.4 保留但需文本清洗（scrub）

家庭情况、家访总结、获奖经历及兴趣爱好、申请理由、审批意见、年收入说明、困难原因、需赡养老人情况说明、负债情况说明。

清洗内容：内嵌身份证号、手机号、固话、邮箱、上下文绑定的 QQ/微信号、详细地址片段、珍珠号关键词、教师姓名/审批人姓名（黑名单精确匹配）、明显姓名+称呼模式 → 全部替换为 `[已隐藏]`。

### 5.5 学校名称

作为请求级元数据（`meta.schoolName`）发送——机构名非个人信息，报告需要它。

## 6. 安全流水线模块职责

| 模块 | 职责 |
|---|---|
| `excel/excel-parser.ts` | SheetJS 读取 → 原始 sheet 数据；容忍空单元格 |
| `excel/header-detector.ts` | 自动探测表头行：扫描前 5 行，取「命中已知字段名最多」的行；未命中则取非空单元格最多的行 |
| `anonymization/raw-store.ts` | 原始数据唯一存放处：私有 Map、受限读取 API、无序列化、刷新即失 |
| `anonymization/field-mapper.ts` | 归一化字段名 → 规范字段 → 策略；产出逐列映射结果（含未知字段标记） |
| `anonymization/field-policies.ts` | 第 5 节策略表的数据化定义 |
| `anonymization/text-scrubber.ts` | 叙事文本模式掩码（与 scanner 共用规则） |
| `anonymization/anonymizer.ts` | 组装：RawStudentRecord → AnonymizedStudent（生成 student-001… 序号，仅存内存映射） |
| `security/scanner.ts` | 最终 payload 扫描：命中即拒绝，返回结构化 Finding（类别 + 字段路径 + 掩码片段） |
| `analysis/analysis-service.ts` | **唯一发请求处**：先扫描 → 不通过则抛错；通过才调用 provider |
| `analysis/provider.ts` | `interface AnalysisProvider { analyze(data: AnonymizedStudent[]): Promise<AnalysisResult> }` |
| `analysis/mock-provider.ts` | 确定性规则引擎模拟 AI（见第 8 节） |
| `report/*` | 报告模型 → Markdown 序列化 → 下载 |
| `stats/usage-stats.ts` | 使用统计接口 + 内存实现（见第 9 节） |

### 6.1 SecurityScanner 规则（security/rules.ts）

- **按字段类型扫描**：结构化数字字段不做 QQ/姓名匹配（防误报：年收入 30000 ≠ QQ 号；中考成绩 701 ≠ 手机号）；叙事文本字段全量扫描。
- 身份证：`\d{17}[\dXx]` + 带出生日期校验的完整版。
- 手机号 `1[3-9]\d{9}`；固话 `0\d{2,3}-?\d{7,8}`；邮箱标准模式。
- QQ/微信：上下文绑定模式（`QQ[号]?[:：]?\s*[1-9]\d{4,10}`、`微信[:：]?\s*[a-zA-Z][\w-]{5,19}`），不做裸数字猜测。
- 详细地址片段：`省/市/县/镇/乡/村/路/街/巷/号/栋/单元/室` 组合强度 ≥ 阈值。
- 珍珠号：`珍珠号` 关键词后跟值。
- 姓名黑名单：原始数据提取的精确姓名集合（珍珠生姓名、家访教师姓名、审批人）。

### 6.2 DeepSeek 未来接入预留

- `DeepSeekAnalysisProvider implements AnalysisProvider`：API 地址由用户配置（如 `http://localhost:xxxx/api/analyze`），JSON 请求。
- API Key 绝不写入前端源码；由用户输入、仅存当前会话内存（或未来由用户自己的后端代理）。
- 接入时必须走 `AnalysisService`（扫描硬闸自动生效），UI 无需改动。

## 7. UI 流程（单页 Stepper）

| 步骤 | 内容 |
|---|---|
| ① 导入 | 标题「珍珠生走访智能面谈辅助工具」；副标题「隐私优先：原始学生信息仅在本地浏览器处理」；拖拽/点击选择 Excel；读取后显示学校名称、候选学生人数、字段数量；使用步骤说明（导入→脱敏→检查→分析→查看→下载） |
| ② 字段映射 | 展示检测到的表头行与每列策略（保留/清洗/泛化/删除/未知-不发送）；v1 只读预览，无手动调整（保持安全边界简单） |
| ③ 脱敏统计 | 原始学生数/字段数、敏感字段数、已删除/已泛化字段数、最终发送字段数；四个 ✓（姓名/身份证号/联系方式/详细地址未发送） |
| ④ 匿名预览 | 表格展示 `学生-001…`，可展开查看单个学生全部脱敏字段；绝不显示真实姓名 |
| ⑤ 安全检查 | 逐项清单（身份证/手机号/姓名/邮箱/微信/QQ/详细地址/教师姓名/其他高风险）；通过后「✓ 未发现禁止发送的个人身份信息」+「开始 AI 分析」按钮；命中则阻止 + 掩码回显 + 无绕过入口 |
| ⑥ 报告 | 学校整体分析 + 单个学生面谈参考（可折叠）+「下载走访参考报告」 |

风格：简洁、专业、公益组织内部工具；不炫技；强调「安全、可靠、易用」。

## 8. Mock 分析器（确定性规则引擎）

不随机、不编造，输出由输入数据规则推导，可测试可复现。

### 8.1 学校级（SchoolOverview）

1. 困难类型分布（优先用「困难度」字段；该字段为空时回退为「困难原因」关键词分类：疾病/单亲/弱劳动/低收入/多子女/负债/赡养老人等）；2. 低收入家庭数量及比例（人均年收入低于阈值，默认 10000 元/年，常量可调）；3. 重大疾病家庭数（关键词：癌/残疾/手术/慢性/住院/重症等）；4. 单亲/弱劳动能力家庭（困难原因关键词）；5. 高负债家庭（负债说明非空或金额 > 5 万）；6. 住房情况（租房比例）；7. 远距通学（距离 > 5km）；8. 材料完整度（缺失字段计数分布）；9. 值得重点关注的学生数（困难因素 ≥ 3 条）；10. 整体面谈建议。

### 8.2 学生级（StudentInterviewGuide）

1. 基本情况（仅脱敏信息）；2. 申请原因概括；3. 家庭情况概括（人口/收入/劳动/疾病/住房/负债）；4. 主要困难因素（权重排序：重大疾病 > 高负债 > 低收入 > 多子女上学 > 赡养老人 > 租房陪读）；5. 需要重点核实（规则触发：如收入来源说明缺失、负债说明为空但负债存在、住房与陪读待确认）；6. 推荐面谈问题（按该生实际情况从模板库选 5–8 个，中性、不诱导、不给结论、避免重复已明确信息）；7. 面谈注意事项（涉及疾病/变故/负债时提示开放式提问）。

### 8.3 输出约束

严禁输出「建议通过/建议淘汰/取消资格」等结论性表述；只输出分析、核实事项与建议问题。

## 9. 使用统计接口（v1 仅设计 + 内存实现）

```ts
interface UsageStats {
  record(event: 'imported' | 'analysisCompleted', meta: { studentCount?: number }): void;
  getSnapshot(): { imports: number; analyses: number; totalStudents: number };
}
```

- 只允许计数：使用次数、导入次数、分析次数、学生人数总和（平均人数由此推导）、功能使用情况。
- 绝对禁止统计：姓名、学生 ID、家庭情况、申请内容、学校与学生对应关系、API 请求中的学生数据。
- v1 不持久化、不上报；未来如需上报只能上报上述白名单计数。

## 10. 报告

- 内存生成，不落盘、不上传、不自动保存；提供 Markdown 下载（文件名含学校名 + 日期）。
- 结构：① 学校整体分析（10 项）→ ② 单个学生面谈参考（按 student-001… 排列，每生 7 小节）→ ③ 附录：通用面谈指南（需求第七节固化内容：家庭情况/学校状况/项目了解/其他关怀）。
- 报告中不出现任何真实身份信息。

## 11. 项目结构

```
pearl_visit_assistant/
├─ examples/                  # 真实 Excel（.gitignore 排除，绝不参与测试）
├─ src/
│  ├─ excel/                  # excel-parser.ts, header-detector.ts
│  ├─ anonymization/          # raw-store.ts, field-mapper.ts, field-policies.ts,
│  │                          #   text-scrubber.ts, anonymizer.ts
│  ├─ security/               # scanner.ts, rules.ts
│  ├─ analysis/               # provider.ts, mock-provider.ts, analysis-service.ts
│  ├─ report/                 # generator.ts, markdown.ts, question-templates.ts
│  ├─ stats/                  # usage-stats.ts
│  ├─ types/                  # student.ts, pipeline.ts, report.ts
│  ├─ utils/                  # format.ts, download.ts
│  ├─ components/             # Stepper, ImportStep, MappingStep, AnonymizeStep,
│  │                          #   PreviewStep, SecurityStep, ReportStep, ui/
│  ├─ App.tsx / main.tsx / index.css
├─ scripts/                   # 合成测试数据生成脚本
├─ tests/                     # Vitest 单元 + 端到端
└─ docs/superpowers/specs/
```

## 12. 技术栈

Vite + React 19 + TypeScript（strict）+ Tailwind CSS + SheetJS(xlsx) + Zod（解析结果校验）+ Vitest。流程状态用 useReducer，不引入状态管理库。

## 13. 测试策略

- **合成数据**：脚本生成与真实表头（60 列）结构一致的 .xlsx，全部虚构数据；真实 Excel 不进入测试。
- **单元测试**：header-detector（标题行/无标题行）、field-mapper（qq 小写、未知字段默认不发送）、anonymizer（禁止字段绝不出现在输出、排名区间化）、text-scrubber（内嵌手机号/姓名被掩码）、scanner（各规则 + 姓名黑名单 + 误报防护）、mock-provider（确定性）、markdown（输出不含敏感值）。
- **端到端**：合成数据 → 全流水线 → 断言 payload 不含任何敏感值、扫描通过、报告生成。
- **反向测试**：构造含身份证/手机号/教师姓名的恶意 payload → 扫描必须拒绝。

## 14. 范围外（v1 不做）

真实 AI API、后端、用户登录、数据库、云端存储、报告自动保存、字段策略手动编辑、PDF/HTML 导出、analytics 上报。
