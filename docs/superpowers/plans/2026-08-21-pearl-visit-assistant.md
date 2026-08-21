# 珍珠生走访智能面谈辅助工具 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从零构建纯前端「珍珠生走访智能面谈辅助工具」：Excel 本地读取 → 字段映射 → 本地脱敏 → 匿名预览 → 发送前安全检查 → Mock AI 分析 → 报告展示与 Markdown 下载。

**Architecture:** 单向安全流水线 `导入 → 映射 → 脱敏 → 扫描 → 分析 → 报告`。原始数据仅存于受控内存 RawStore；`AnonymizedStudent` 类型上不存在敏感字段；`AnalysisService.analyze()` 是唯一发请求处，内部强制 `SecurityScanner` 硬闸。TextScrubber 与 SecurityScanner 共用 `security/rules.ts` 规则集。

**Tech Stack:** Vite 7 + React 19 + TypeScript(strict) + Tailwind CSS 4 + SheetJS(xlsx 0.18.5) + Zod + Vitest 3。

**设计文档：** `docs/superpowers/specs/2026-08-21-pearl-visit-assistant-design.md`（实现前必读）

**安全红线（每个任务都适用）：**
- 原始数据绝不写 localStorage/IndexedDB/Cookie/console/URL；
- src/ 下不出现 fetch/axios/XHR（v1 无真实 API）；测试强制（Task 13 静态守卫测试）；
- examples/ 中真实 Excel 已被 .gitignore 排除，绝不进入测试；测试只用程序构造的合成数据。

---

## 文件结构（本计划将创建的全部文件）

```
package.json / vite.config.ts / tsconfig.json / index.html / .gitignore(已有)
src/
├─ main.tsx / App.tsx / index.css
├─ types/student.ts / types/pipeline.ts
├─ utils/number.ts / utils/field-labels.ts / utils/download.ts
├─ excel/excel-parser.ts / excel/header-detector.ts
├─ anonymization/field-policies.ts / anonymization/field-mapper.ts
│                / anonymization/raw-store.ts / anonymization/text-scrubber.ts
│                / anonymization/anonymizer.ts
├─ security/rules.ts / security/scanner.ts
├─ analysis/provider.ts / analysis/analysis-service.ts
│            / analysis/mock-provider.ts / analysis/question-templates.ts
├─ report/types.ts / report/generator.ts / report/general-guide.ts / report/markdown.ts
├─ stats/usage-stats.ts
├─ state/pipeline.ts
└─ components/Stepper.tsx / ImportStep.tsx / MappingStep.tsx / AnonymizeStep.tsx
              / PreviewStep.tsx / SecurityStep.tsx / ReportStep.tsx
              / ui/Card.tsx / ui/Button.tsx / ui/Badge.tsx / ui/StatCard.tsx / ui/CheckItem.tsx
scripts/generate-sample-xlsx.mjs
tests/（每个逻辑模块对应一个测试文件）
README.md
```

模块依赖方向（禁止反向依赖）：`excel → anonymization → security → analysis → report`；`components` 只依赖 types/state/utils；`state/pipeline.ts` 是纯 reducer，不含原始数据。

---

## Task 1: 项目脚手架

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/index.css`, `src/App.tsx`

- [ ] **Step 1: 写入 package.json**

```json
{
  "name": "pearl-visit-assistant",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "xlsx": "^0.18.5",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.1.11",
    "@types/react": "^19.1.8",
    "@types/react-dom": "^19.1.6",
    "@vitejs/plugin-react": "^4.6.0",
    "tailwindcss": "^4.1.11",
    "typescript": "~5.8.3",
    "vite": "^7.0.0",
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 2: 写入 vite.config.ts**

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 3: 写入 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src", "tests", "vite.config.ts"]
}
```

- [ ] **Step 4: 写入 index.html**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>珍珠生走访智能面谈辅助工具</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: 写入 src/main.tsx / src/index.css / src/App.tsx（占位）**

src/main.tsx:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

src/index.css:
```css
@import "tailwindcss";

body {
  font-family: system-ui, -apple-system, "Segoe UI", "PingFang SC",
    "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
}
```

src/App.tsx（占位，Task 14 重写）:
```tsx
export default function App() {
  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <h1 className="text-xl font-semibold text-slate-800">珍珠生走访智能面谈辅助工具</h1>
    </div>
  );
}
```

- [ ] **Step 6: 安装依赖并验证**

Run: `npm install`
Expected: 安装成功（xlsx 0.18.5 会有 npm audit 提示，属已知情况：该包官方新版本通过 cdn.sheetjs.com 分发；本工具只读取基金会工作人员自己的 Excel，风险可接受，README 中说明）。

Run: `npm run build`
Expected: `✓ built in ...` 无 TypeScript 错误

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vite.config.ts tsconfig.json index.html src/
git commit -m "chore: 初始化 Vite + React + TS + Tailwind 脚手架"
```

---

## Task 2: 核心类型定义

**Files:**
- Create: `src/types/student.ts`, `src/types/pipeline.ts`

说明：纯类型任务，无单元测试；由 `tsc` 编译验证。本任务定义的类型是全项目契约，后续所有任务引用它。

- [ ] **Step 1: 写入 src/types/student.ts**

```ts
// 核心数据类型。安全不变量：AnonymizedStudent 类型上不存在任何敏感字段
// （姓名/身份证/电话/QQ/微信/邮箱/详细地址/珍珠号/教师姓名），编译期即无法写入 payload。

export type CellValue = string | number | boolean | null;

/** 解析出的原始行：仅存在于受控 RawStore */
export interface RawStudentRecord {
  sourceRow: number; // 数据所在工作表行号（从 1 开始）
  values: Record<string, CellValue>; // key = 原始表头名
}

export type FieldAction =
  | { action: 'drop'; reason: 'identity' | 'third-party' | 'internal' | 'unknown' }
  | { action: 'keep' }
  | { action: 'scrub' }
  | { action: 'generalize'; kind: 'rank-band' };

/** 一列（一个字段）的映射结果 */
export interface MappedColumn {
  header: string; // 原始表头名
  normalizedHeader: string;
  canonicalKey: string | null; // null = 未知字段（不发送）
  action: FieldAction;
}

/** 脱敏后的学生：发送给 AI 的唯一学生数据结构 */
export interface AnonymizedStudent {
  anonymousId: string; // student-001 …
  gender: string | null;
  ethnicity: string | null; // 民族
  householdType: string | null; // 户口
  height: string | null;
  weight: string | null;
  healthStatus: string | null;
  difficultyLevel: string | null; // 困难度
  enrollmentStatus: string | null; // 就读状态
  province: string | null;
  city: string | null;
  county: string | null;
  ancestralHome: string | null; // 籍贯
  distanceToSchoolKm: number | null;
  zhongkaoFullScore: number | null;
  zhongkaoScore: number | null;
  admissionRankBand: string | null; // 排名已泛化为区间
  gradeSize: number | null;
  familySituation: string | null; // 已清洗
  visitMethod: string | null;
  visitSummary: string | null; // 已清洗
  awardsAndInterests: string | null; // 已清洗
  applicationReason: string | null; // 已清洗
  approvalComment: string | null; // 已清洗
  housingStatus: string | null;
  transportation: string | null;
  annualIncome: number | null;
  annualIncomeNote: string | null; // 已清洗
  perCapitaIncome: number | null;
  schoolChildrenCount: number | null;
  difficultyReason: string | null; // 已清洗
  elderlySupportStatus: string | null;
  elderlySupportNote: string | null; // 已清洗
  debtStatus: string | null;
  debtNote: string | null; // 已清洗
}

export interface AnonymizationStats {
  rawStudentCount: number;
  rawFieldCount: number;
  sensitiveFieldCount: number; // identity + third-party 删除字段数
  droppedFieldCount: number; // 全部删除字段数
  generalizedFieldCount: number;
  sentFieldCount: number; // 最终发送字段数（keep + scrub + generalize）
}

export interface AnonymizationOutput {
  students: AnonymizedStudent[];
  stats: AnonymizationStats;
  /** anonymousId → 真实姓名。仅内存本地查询用，绝不进入 payload、绝不序列化 */
  nameIndex: Map<string, string>;
}

/** 发送给 AI 的完整请求 */
export interface AnalysisRequest {
  meta: { schoolName: string; cohort: string };
  students: AnonymizedStudent[];
}
```

- [ ] **Step 2: 写入 src/types/pipeline.ts**

```ts
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
  | { type: 'RESET' };
```

- [ ] **Step 3: 编译验证**

Run: `npx tsc --noEmit`
Expected: 报错——`../security/scanner`、`../analysis/provider`、`../report/types` 模块尚不存在（TS2307）。这是预期的"测试先失败"：记录下这三个缺失模块，后续任务创建它们。

- [ ] **Step 4: Commit**

```bash
git add src/types/
git commit -m "feat: 定义核心数据模型（RawStudentRecord/AnonymizedStudent/流水线状态）"
```

注意：此时 `tsc` 仍报错属正常（Task 3/8/9/11 补齐依赖类型模块），不要在本任务创建任何其他文件。

---

## Task 3: 字段策略表与字段映射

**Files:**
- Create: `src/anonymization/field-policies.ts`, `src/anonymization/field-mapper.ts`
- Test: `tests/field-mapper.test.ts`

- [ ] **Step 1: 写失败测试 tests/field-mapper.test.ts**

```ts
import { describe, it, expect } from 'vitest';
import { classifyHeader, normalizeHeader } from '../src/anonymization/field-policies';
import { mapFields } from '../src/anonymization/field-mapper';

describe('normalizeHeader', () => {
  it('去空格并转小写（兼容真实文件中的小写 qq）', () => {
    expect(normalizeHeader('  QQ ')).toBe('qq');
    expect(normalizeHeader('家庭情况')).toBe('家庭情况');
  });
});

describe('classifyHeader', () => {
  it('直接身份信息 → drop/identity', () => {
    expect(classifyHeader('身份证号')).toEqual({ canonicalKey: null, action: { action: 'drop', reason: 'identity' } });
    expect(classifyHeader('qq').action).toEqual({ action: 'drop', reason: 'identity' });
    expect(classifyHeader('电话').action).toEqual({ action: 'drop', reason: 'identity' });
  });

  it('第三方姓名 → drop/third-party', () => {
    expect(classifyHeader('家访教师姓名').action).toEqual({ action: 'drop', reason: 'third-party' });
    expect(classifyHeader('审批人').action).toEqual({ action: 'drop', reason: 'third-party' });
    expect(classifyHeader('结对捐方').action).toEqual({ action: 'drop', reason: 'third-party' });
  });

  it('内部字段 → drop/internal', () => {
    expect(classifyHeader('序号').action).toEqual({ action: 'drop', reason: 'internal' });
    expect(classifyHeader('学校名称').action).toEqual({ action: 'drop', reason: 'internal' });
  });

  it('保留字段 → keep', () => {
    expect(classifyHeader('性别')).toMatchObject({ canonicalKey: 'gender', action: { action: 'keep' } });
    expect(classifyHeader('住址省')).toMatchObject({ canonicalKey: 'province', action: { action: 'keep' } });
  });

  it('排名 → generalize/rank-band', () => {
    expect(classifyHeader('录取高中全校排名')).toMatchObject({
      canonicalKey: 'admissionRank',
      action: { action: 'generalize', kind: 'rank-band' },
    });
  });

  it('叙事字段 → scrub', () => {
    expect(classifyHeader('家庭情况')).toMatchObject({ canonicalKey: 'familySituation', action: { action: 'scrub' } });
    expect(classifyHeader('审批意见')).toMatchObject({ canonicalKey: 'approvalComment', action: { action: 'scrub' } });
  });

  it('未知字段 → 默认不发送', () => {
    expect(classifyHeader('未来新增字段XYZ')).toEqual({
      canonicalKey: null,
      action: { action: 'drop', reason: 'unknown' },
    });
  });
});

describe('mapFields', () => {
  it('产出逐列映射并识别学校名称列', () => {
    const { mappedColumns, schoolNameColumn } = mapFields(['性别', '未知列', '学校名称']);
    expect(mappedColumns).toHaveLength(3);
    expect(mappedColumns[0].canonicalKey).toBe('gender');
    expect(mappedColumns[1].action).toEqual({ action: 'drop', reason: 'unknown' });
    expect(schoolNameColumn).toBe('学校名称');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/field-mapper.test.ts`
Expected: FAIL — 模块不存在（Cannot find module）。

- [ ] **Step 3: 实现 src/anonymization/field-policies.ts**

```ts
import type { FieldAction } from '../types/student';

/** 规范化字段 key：与 AnonymizedStudent 属性名一一对应 */
export type CanonicalKey =
  | 'gender' | 'ethnicity' | 'householdType' | 'height' | 'weight' | 'healthStatus'
  | 'difficultyLevel' | 'enrollmentStatus' | 'province' | 'city' | 'county' | 'ancestralHome'
  | 'distanceToSchoolKm' | 'zhongkaoFullScore' | 'zhongkaoScore' | 'admissionRank'
  | 'gradeSize' | 'familySituation' | 'visitMethod' | 'visitSummary' | 'awardsAndInterests'
  | 'applicationReason' | 'approvalComment' | 'housingStatus' | 'transportation'
  | 'annualIncome' | 'annualIncomeNote' | 'perCapitaIncome' | 'schoolChildrenCount'
  | 'difficultyReason' | 'elderlySupportStatus' | 'elderlySupportNote' | 'debtStatus' | 'debtNote';

interface PolicyEntry {
  aliases: string[]; // 归一化后的表头别名
  action: FieldAction;
}

/** 字段策略表：已与用户逐项确认（设计文档第 5 节） */
export const FIELD_POLICIES: Record<CanonicalKey, PolicyEntry> = {
  gender: { aliases: ['性别'], action: { action: 'keep' } },
  ethnicity: { aliases: ['民族'], action: { action: 'keep' } },
  householdType: { aliases: ['户口'], action: { action: 'keep' } },
  height: { aliases: ['身高'], action: { action: 'keep' } },
  weight: { aliases: ['体重'], action: { action: 'keep' } },
  healthStatus: { aliases: ['健康情况'], action: { action: 'keep' } },
  difficultyLevel: { aliases: ['困难度'], action: { action: 'keep' } },
  enrollmentStatus: { aliases: ['就读状态'], action: { action: 'keep' } },
  province: { aliases: ['住址省'], action: { action: 'keep' } },
  city: { aliases: ['州市'], action: { action: 'keep' } },
  county: { aliases: ['县区'], action: { action: 'keep' } },
  ancestralHome: { aliases: ['籍贯'], action: { action: 'keep' } },
  distanceToSchoolKm: { aliases: ['距离高中路程'], action: { action: 'keep' } },
  zhongkaoFullScore: { aliases: ['中考满分'], action: { action: 'keep' } },
  zhongkaoScore: { aliases: ['中考成绩'], action: { action: 'keep' } },
  admissionRank: { aliases: ['录取高中全校排名'], action: { action: 'generalize', kind: 'rank-band' } },
  gradeSize: { aliases: ['全年级人数'], action: { action: 'keep' } },
  familySituation: { aliases: ['家庭情况'], action: { action: 'scrub' } },
  visitMethod: { aliases: ['家访方式'], action: { action: 'keep' } },
  visitSummary: { aliases: ['家访总结'], action: { action: 'scrub' } },
  awardsAndInterests: { aliases: ['获奖经历及兴趣爱好'], action: { action: 'scrub' } },
  applicationReason: { aliases: ['申请理由'], action: { action: 'scrub' } },
  approvalComment: { aliases: ['审批意见'], action: { action: 'scrub' } },
  housingStatus: { aliases: ['住房状况'], action: { action: 'keep' } },
  transportation: { aliases: ['交通工具'], action: { action: 'keep' } },
  annualIncome: { aliases: ['年收入'], action: { action: 'keep' } },
  annualIncomeNote: { aliases: ['年收入说明'], action: { action: 'scrub' } },
  perCapitaIncome: { aliases: ['人均年收入'], action: { action: 'keep' } },
  schoolChildrenCount: { aliases: ['上学子女人数'], action: { action: 'keep' } },
  difficultyReason: { aliases: ['困难原因'], action: { action: 'scrub' } },
  elderlySupportStatus: { aliases: ['需赡养老人情况'], action: { action: 'keep' } },
  elderlySupportNote: { aliases: ['需赡养老人情况说明'], action: { action: 'scrub' } },
  debtStatus: { aliases: ['负债情况'], action: { action: 'keep' } },
  debtNote: { aliases: ['负债情况说明'], action: { action: 'scrub' } },
};

/** 直接身份信息别名：必须删除（即使字段名变化也按别名匹配） */
export const FORBIDDEN_IDENTITY_ALIASES: string[] = [
  '珍珠生姓名', '姓名', '学生姓名', '身份证号', '身份证', '电话', '手机号', '手机', '联系方式',
  'qq', '微信号', '微信', '邮箱', '电子邮箱', '详细地址', '家庭住址', '住址', '地址', '珍珠号',
];

/** 第三方姓名别名：必须删除 */
export const THIRD_PARTY_ALIASES: string[] = ['家访教师姓名', '家访教师', '审批人', '结对捐方'];

/** 姓名承载列别名（身份姓名 + 第三方姓名）：黑名单提取与扫描器共用，避免双源漂移 */
export const NAME_BEARING_ALIASES: string[] = [
  '珍珠生姓名', '姓名', '学生姓名', '家访教师姓名', '家访教师', '审批人', '结对捐方',
];

/** 内部编号/常量字段：删除（学校名称与期数在解析器中提取为请求元数据） */
export const INTERNAL_ALIASES: string[] = [
  '序号', '学校编号', '珍珠班名称', '珍珠班编号', '资助项目名称', '出资方类型', '拨款金额',
  '期数', '状态', '就读状态变更时间', '就读状态变更原因', '结对要求', '资金池名称',
  '初中就读学校', '学校名称',
];

export function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, '');
}

export function classifyHeader(header: string): { canonicalKey: CanonicalKey | null; action: FieldAction } {
  const h = normalizeHeader(header);
  // 删除表优先（fail-safe）：若未来某别名误入策略表，冲突时仍按删除处理（四表零交集有不变量测试钉死）
  if (FORBIDDEN_IDENTITY_ALIASES.includes(h)) {
    return { canonicalKey: null, action: { action: 'drop', reason: 'identity' } };
  }
  if (THIRD_PARTY_ALIASES.includes(h)) {
    return { canonicalKey: null, action: { action: 'drop', reason: 'third-party' } };
  }
  if (INTERNAL_ALIASES.includes(h)) {
    return { canonicalKey: null, action: { action: 'drop', reason: 'internal' } };
  }
  for (const [key, entry] of Object.entries(FIELD_POLICIES)) {
    if (entry.aliases.includes(h)) return { canonicalKey: key as CanonicalKey, action: entry.action };
  }
  return { canonicalKey: null, action: { action: 'drop', reason: 'unknown' } };
}

/** 是否已知字段名（供表头行检测打分） */
export function isKnownHeaderName(header: string): boolean {
  const { action } = classifyHeader(header);
  return !(action.action === 'drop' && action.reason === 'unknown');
}
```

- [ ] **Step 4: 实现 src/anonymization/field-mapper.ts**

```ts
import type { MappedColumn } from '../types/student';
import { classifyHeader, normalizeHeader } from './field-policies';

export interface FieldMappingResult {
  mappedColumns: MappedColumn[];
  /** 学校名称所在列（原始表头名），用于提取请求元数据；null = 无此列 */
  schoolNameColumn: string | null;
  /** 期数所在列（原始表头名），用于提取请求元数据；null = 无此列 */
  cohortColumn: string | null;
}

/** 表头列表 → 逐列策略映射。未知字段默认不发送。 */
export function mapFields(headers: string[]): FieldMappingResult {
  const mappedColumns: MappedColumn[] = headers.map((header) => ({
    header,
    normalizedHeader: normalizeHeader(header),
    ...classifyHeader(header),
  }));
  const findColumn = (alias: string) =>
    mappedColumns.find((c) => c.normalizedHeader === normalizeHeader(alias))?.header ?? null;
  return {
    mappedColumns,
    schoolNameColumn: findColumn('学校名称'),
    cohortColumn: findColumn('期数'),
  };
}
```

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run tests/field-mapper.test.ts`
Expected: PASS — 14 个用例全部通过（9 个原用例 + 质量审查后追加的不变量/导出面测试）。

- [ ] **Step 6: Commit**

```bash
git add src/anonymization/field-policies.ts src/anonymization/field-mapper.ts tests/field-mapper.test.ts
git commit -m "feat: 字段策略表与字段映射（未知字段默认不发送）"
```

> **执行记录（控制器授权的计划偏离，均已合入实现与测试）**：
> ① `classifyHeader` 改为删除表优先的 fail-safe 顺序（提交 f94d22b，质量审查 Important #1；四表零交集不变量 + 各表无重复别名已固化为测试）；② 导出面测试补齐：`cohortColumn` 识别/null、`isKnownHeaderName` true/false/身份别名 true、`normalizeHeader` 内部空格压缩；③ 一致性检查 `_canonicalKeyConsistency`（CanonicalKey ↔ AnonymizedStudent 双向锁定，admissionRank/anonymousId/admissionRankBand 例外）；④ 后续任务追加 `NAME_BEARING_ALIASES`（提交 cb0fa1a，黑名单与策略表单源化）。

---

## Task 4: Excel 解析与表头自动检测

**Files:**
- Create: `src/excel/header-detector.ts`, `src/excel/excel-parser.ts`
- Test: `tests/excel-parser.test.ts`

- [ ] **Step 1: 写失败测试 tests/excel-parser.test.ts**

```ts
import { describe, it, expect } from 'vitest';
import { utils, write } from 'xlsx';
import { parseExcel } from '../src/excel/excel-parser';
import { detectHeaderRow } from '../src/excel/header-detector';

/** 用矩阵构造内存 xlsx，返回 ArrayBuffer（不落盘、不使用真实数据） */
function workbookFromMatrix(rows: unknown[][]): ArrayBuffer {
  const ws = utils.aoa_to_sheet(rows);
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, '测试表');
  return write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

describe('detectHeaderRow', () => {
  it('识别合并标题行之后的表头行', () => {
    const idx = detectHeaderRow([
      ['高中段珍珠生信息'],
      ['序号', '性别', '家庭情况', '录取高中全校排名'],
      ['1', '女', '三口人', '160'],
    ]);
    expect(idx).toBe(1);
  });

  it('表头在第一行时返回 0', () => {
    const idx = detectHeaderRow([
      ['序号', '性别'],
      ['1', '女'],
    ]);
    expect(idx).toBe(0);
  });

  it('前 5 行全为空时返回 -1', () => {
    const idx = detectHeaderRow([
      ['', null],
      ['', ''],
      [null, null],
      ['', null],
      ['', null],
    ]);
    expect(idx).toBe(-1);
  });
});

describe('parseExcel', () => {
  it('跳过标题行，按表头名组织数据，容忍空单元格', () => {
    const buf = workbookFromMatrix([
      ['高中段珍珠生信息'],
      ['性别', 'qq', '家庭情况'],
      ['女', '123456789', '家里有电话 13800138000'],
      ['男', null, ''],
    ]);
    const parsed = parseExcel(buf);
    expect(parsed.sheetName).toBe('测试表');
    expect(parsed.headerRowIndex).toBe(2);
    expect(parsed.headers).toEqual(['性别', 'qq', '家庭情况']);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rowNumbers).toEqual([3, 4]);
    expect(parsed.rows[0]['性别']).toBe('女');
    expect(parsed.rows[1]['qq']).toBeNull();
  });

  it('跳过全空行', () => {
    const buf = workbookFromMatrix([
      ['性别'],
      ['女'],
      ['', null],
      ['男'],
    ]);
    const parsed = parseExcel(buf);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rowNumbers).toEqual([2, 4]);
  });

  it('提取学校名称与期数', () => {
    const buf = workbookFromMatrix([
      ['学校名称', '期数', '性别'],
      ['某县第一中学', '2026级', '女'],
    ]);
    const parsed = parseExcel(buf);
    expect(parsed.schoolName).toBe('某县第一中学');
    expect(parsed.cohort).toBe('2026级');
  });

  it('无学校名称列时 schoolName 为 null', () => {
    const buf = workbookFromMatrix([['性别'], ['女']]);
    expect(parseExcel(buf).schoolName).toBeNull();
  });

  it('前 5 行找不到表头时抛错', () => {
    const buf = workbookFromMatrix([
      ['内容一'],
      ['内容二'],
      ['内容三'],
      ['内容四'],
      ['内容五'],
      ['内容六'],
    ]);
    expect(() => parseExcel(buf)).toThrow('表头');
  });

  it('表头重复时抛错', () => {
    const buf = workbookFromMatrix([
      ['性别', '性别'],
      ['女', '男'],
    ]);
    expect(() => parseExcel(buf)).toThrow('表头重复');
  });

  it('空工作表时抛错', () => {
    const buf = workbookFromMatrix([]);
    expect(() => parseExcel(buf)).toThrow('表头');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/excel-parser.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现 src/excel/header-detector.ts**

```ts
import { isKnownHeaderName } from '../anonymization/field-policies';

/**
 * 自动探测表头行下标（0-based），找不到时返回 -1。
 * 扫描前 5 行，每行打分 = 命中已知字段名数 × 10 + 非空单元格数；
 * 真实文件第 1 行是合并标题，第 2 行才是表头。
 * 若得分最高的行没有命中任何已知字段名（可能不是目标文件），返回 -1。
 */
export function detectHeaderRow(matrix: unknown[][]): number {
  const maxScan = Math.min(matrix.length, 5);
  let best = -1;
  let bestScore = 0;
  let bestKnown = 0;
  for (let i = 0; i < maxScan; i++) {
    const row = matrix[i];
    const known = row.filter((c) => typeof c === 'string' && isKnownHeaderName(String(c))).length;
    const nonEmpty = row.filter((c) => c != null && String(c).trim() !== '').length;
    const score = known * 10 + nonEmpty;
    if (score > bestScore) {
      bestScore = score;
      best = i;
      bestKnown = known;
    }
  }
  return bestKnown > 0 ? best : -1;
}
```

- [ ] **Step 4: 实现 src/excel/excel-parser.ts**

```ts
import * as XLSX from 'xlsx';
import { z } from 'zod';
import type { CellValue } from '../types/student';
import { normalizeHeader } from '../anonymization/field-policies';
import { detectHeaderRow } from './header-detector';

export interface ParsedExcel {
  sheetName: string;
  headers: string[]; // 表头行内容（含空串）
  rows: Record<string, CellValue>[]; // 每行：表头名 → 值（跳过全空行）
  rowNumbers: number[]; // 与 rows 对齐的 1-based 工作表行号
  schoolName: string | null;
  cohort: string | null;
  headerRowIndex: number; // 表头在 sheet 中的行号（1-based）
}

const CellValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const ParsedExcelSchema = z.object({
  sheetName: z.string(),
  headers: z.array(z.string()),
  rows: z.array(z.record(CellValueSchema)),
  rowNumbers: z.array(z.number()),
  schoolName: z.string().nullable(),
  cohort: z.string().nullable(),
  headerRowIndex: z.number(),
});

/** 读取 xlsx 并解析：自动探测表头行，按列字母对齐（SheetJS 原生行为），容忍空单元格 */
export function parseExcel(buffer: ArrayBuffer): ParsedExcel {
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  // raw:false：值统一按显示文本输出，便于统一清洗
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false }) as unknown[][];

  const headerIdx = detectHeaderRow(matrix);
  if (headerIdx < 0) {
    throw new Error('未能在前 5 行中找到表头行，请确认 Excel 结构');
  }
  const headers = (matrix[headerIdx] as unknown[]).map((h) => (h == null ? '' : String(h).trim()));

  // 重复表头会导致按列名组织时静默覆盖丢数据，fail-closed 拒绝
  const seen = new Set<string>();
  for (const h of headers) {
    if (h === '') continue;
    const key = normalizeHeader(h);
    if (seen.has(key)) throw new Error(`表头重复: ${h}，请修正 Excel 后重试`);
    seen.add(key);
  }

  const rows: Record<string, CellValue>[] = [];
  const rowNumbers: number[] = [];
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const rawRow = matrix[i];
    if (!rawRow || rawRow.every((c) => c == null || String(c).trim() === '')) continue;
    const rec: Record<string, CellValue> = {};
    headers.forEach((h, j) => {
      if (h !== '') rec[h] = (rawRow[j] ?? null) as CellValue;
    });
    rows.push(rec);
    rowNumbers.push(i + 1); // i 是 matrix 下标（0-based），sheet 行号 = i + 1
  }

  const pickFirstNonEmpty = (alias: string): string | null => {
    const col = headers.find((h) => normalizeHeader(h) === normalizeHeader(alias));
    if (!col) return null;
    const hit = rows.find((r) => r[col] != null && String(r[col]).trim() !== '');
    return hit ? String(hit[col]).trim() : null;
  };

  const result: ParsedExcel = {
    sheetName: wb.SheetNames[0],
    headers,
    rows,
    rowNumbers,
    schoolName: pickFirstNonEmpty('学校名称'),
    cohort: pickFirstNonEmpty('期数'),
    headerRowIndex: headerIdx + 1,
  };
  ParsedExcelSchema.parse(result); // 结构校验
  return result;
}
```

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run tests/excel-parser.test.ts`
Expected: PASS — 10 个用例全部通过。

- [ ] **Step 6: 编译检查**

Run: `npx tsc --noEmit`
Expected: 仍报 src/types/pipeline.ts 的 TS2307（scanner/provider/report 类型模块未创建，Task 8/9/11 补齐），无其他新错误。

- [ ] **Step 7: Commit**

```bash
git add src/excel/ tests/excel-parser.test.ts
git commit -m "feat: Excel 解析器与表头自动检测"
```

> **执行记录（控制器授权的计划偏离，均已合入实现与测试）**：
> ① `detectHeaderRow` 增加 `bestKnown` 门禁——计划原文无门禁，垃圾行（全未知字段但有非空单元格）会被误选为表头，抛错分支不可达；② 补第 8 个用例「前 5 行全为空时返回 -1」（计划宣称 8 个用例但原文只有 7 个）；③ 质量审查闭环（提交 b0fb56a）：重复表头 fail-closed 检测（消息含「表头重复」）、`ParsedExcel.rowNumbers` 行号保留（Task 13 的 `sourceRow` 依赖它，修复空行跳过后行号错位）、新增「表头重复时抛错」「空工作表时抛错」2 个用例（共 10 个）。

---

## Task 5: RawStore 受控原始数据仓库

**Files:**
- Create: `src/anonymization/raw-store.ts`
- Test: `tests/raw-store.test.ts`

- [ ] **Step 1: 写失败测试 tests/raw-store.test.ts**

```ts
import { describe, it, expect } from 'vitest';
import { RawStore, collectNameBlacklist, rawStore } from '../src/anonymization/raw-store';
import { FORBIDDEN_IDENTITY_ALIASES, NAME_BEARING_ALIASES, THIRD_PARTY_ALIASES } from '../src/anonymization/field-policies';
import type { RawStudentRecord } from '../src/types/student';

const rec = (values: Record<string, string | number | null>): RawStudentRecord => ({
  sourceRow: 1,
  values,
});

describe('RawStore', () => {
  it('存取计数与字段名（字段名可展示，值不外泄）', () => {
    const store = new RawStore();
    store.setRecords([rec({ 性别: '女' }), rec({ 性别: '男', 家庭情况: 'x' })]);
    expect(store.count).toBe(2);
    expect(store.fieldNames.sort()).toEqual(['性别', '家庭情况'].sort());
  });

  it('clear 后清空', () => {
    const store = new RawStore();
    store.setRecords([rec({ 性别: '女' })]);
    store.clear();
    expect(store.count).toBe(0);
  });

  it('模块级单例存在', () => {
    expect(rawStore).toBeInstanceOf(RawStore);
  });
});

describe('collectNameBlacklist', () => {
  it('收集学生姓名、家访教师姓名、审批人（教师姓名按逗号拆分）', () => {
    const names = collectNameBlacklist([
      rec({ 珍珠生姓名: '测试学生甲' }),
      rec({ 家访教师姓名: '刘玉坤，刘慧敏、张泽成' }),
      rec({ 审批人: '张磊' }),
    ]);
    expect(names).toEqual(new Set(['测试学生甲', '刘玉坤', '刘慧敏', '张泽成', '张磊']));
  });

  it('忽略空值', () => {
    const names = collectNameBlacklist([rec({ 珍珠生姓名: '' }), rec({})]);
    expect(names.size).toBe(0);
  });
});

describe('snapshot 与别名不变量', () => {
  it('snapshot 返回副本，外部修改不影响仓库', () => {
    const store = new RawStore();
    store.setRecords([rec({ 性别: '女' })]);
    const snap = store.snapshot();
    (snap as RawStudentRecord[]).pop();
    expect(store.count).toBe(1);
  });

  it('按姓名别名变体收集（学生姓名/结对捐方）', () => {
    const names = collectNameBlacklist([
      rec({ 学生姓名: '测试乙' }),
      rec({ 结对捐方: '王明' }),
    ]);
    expect(names).toEqual(new Set(['测试乙', '王明']));
  });

  it('姓名别名与策略表一致（不变量）', () => {
    const known = [...FORBIDDEN_IDENTITY_ALIASES, ...THIRD_PARTY_ALIASES];
    for (const a of NAME_BEARING_ALIASES) expect(known).toContain(a);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/raw-store.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现 src/anonymization/raw-store.ts**

```ts
import type { RawStudentRecord } from '../types/student';
import { NAME_BEARING_ALIASES, normalizeHeader } from './field-policies';

/**
 * 原始数据受控仓库（安全红线核心）。
 * - 仅内存，无任何序列化/持久化方法；
 * - 页面刷新即失；
 * - snapshot() 仅供脱敏流水线使用，UI 组件不得调用；
 * - 对外只暴露计数与字段名（字段名不是学生数据）。
 */
export class RawStore {
  private records: RawStudentRecord[] = [];

  setRecords(records: RawStudentRecord[]): void {
    this.records = [...records];
  }

  get count(): number {
    return this.records.length;
  }

  get fieldNames(): string[] {
    return [...new Set(this.records.flatMap((r) => Object.keys(r.values)))];
  }

  /** 仅供脱敏流水线（anonymize）使用，禁止传入 UI 组件；返回副本，外部修改不影响仓库 */
  snapshot(): readonly RawStudentRecord[] {
    return [...this.records];
  }

  /** 提取姓名黑名单：学生姓名 + 家访教师姓名 + 审批人（供清洗与扫描共用） */
  collectNameBlacklist(): Set<string> {
    return collectNameBlacklist(this.records);
  }

  clear(): void {
    this.records = [];
  }
}

/** 应用级单例：一次会话一份原始数据 */
export const rawStore = new RawStore();

/** 从原始记录提取姓名黑名单。家访教师姓名可能含多个姓名，按标点/空白拆分。 */
export function collectNameBlacklist(records: readonly RawStudentRecord[]): Set<string> {
  const names = new Set<string>();
  const targetAliases = NAME_BEARING_ALIASES;
  for (const r of records) {
    for (const key of Object.keys(r.values)) {
      if (!targetAliases.includes(normalizeHeader(key))) continue;
      const v = r.values[key];
      if (typeof v !== 'string' || v.trim() === '') continue;
      for (const part of v.split(/[,，、;；\s]+/)) {
        if (part.trim() !== '') names.add(part.trim());
      }
    }
  }
  return names;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/raw-store.test.ts`
Expected: PASS — 8 个用例全部通过。

- [ ] **Step 5: Commit**

```bash
git add src/anonymization/raw-store.ts tests/raw-store.test.ts
git commit -m "feat: RawStore 受控原始数据仓库与姓名黑名单提取"
```

> **执行记录（控制器授权的计划偏离，提交 cb0fa1a，质量审查 With fixes 闭环）**：
> ① `snapshot()` 改为 `readonly RawStudentRecord[]` 只读浅副本（消除防线二活引用弱点）；② `collectNameBlacklist` 的 `records` 参数接受 `readonly`，姓名别名改用 `field-policies.ts` 的 `NAME_BEARING_ALIASES`（单源化，覆盖 `姓名`/`学生姓名`/`结对捐方` 等变体）；③ 测试 5→8（snapshot 副本隔离、别名变体收集、别名 ⊆ 策略表不变量）。**下游注意**：Task 7 `anonymize` 的 `records` 参数须接受 `readonly RawStudentRecord[]`（本记录已同步修改计划 Task 7 章节）。

---

## Task 6: 安全规则集与文本清洗器

**Files:**
- Create: `src/security/rules.ts`, `src/anonymization/text-scrubber.ts`
- Test: `tests/text-scrubber.test.ts`

- [ ] **Step 1: 写失败测试 tests/text-scrubber.test.ts**

```ts
import { describe, it, expect } from 'vitest';
import { scrubText } from '../src/anonymization/text-scrubber';
import { MASK, RULES } from '../src/security/rules';

const noBlacklist = new Set<string>();

describe('scrubText', () => {
  it('掩码内嵌手机号', () => {
    expect(scrubText('父亲在广东打工，电话13800138000联系', noBlacklist)).toBe(
      `父亲在广东打工，电话${MASK}联系`,
    );
  });

  it('掩码 18 位身份证号', () => {
    expect(scrubText('证件号110101200001011234已过期', noBlacklist)).toBe(`证件号${MASK}已过期`);
  });

  it('掩码邮箱', () => {
    expect(scrubText('邮箱abc@example.com可用', noBlacklist)).toBe(`邮箱${MASK}可用`);
  });

  it('QQ/微信按上下文绑定掩码', () => {
    expect(scrubText('QQ：123456789，微信：wxid_abc123', noBlacklist)).toBe(
      `${MASK}，${MASK}`,
    );
  });

  it('黑名单姓名精确掩码', () => {
    expect(scrubText('家访教师张磊曾来访', new Set(['张磊']))).toBe(`家访教师${MASK}曾来访`);
  });

  it('地址子句掩码（号楼单元室组合；整句掩码更保守，避免保留地名前缀）', () => {
    expect(scrubText('住在南湖回迁一号楼六单元701室', noBlacklist)).toBe(MASK);
  });

  it('纯数字金额不误伤（30000 不是 QQ 号）', () => {
    expect(scrubText('年收入30000元', noBlacklist)).toBe('年收入30000元');
  });

  it('弱地址不误伤（仅一个地址词）', () => {
    expect(scrubText('家在县城，走读', noBlacklist)).toBe('家在县城，走读');
  });

  it('无敏感内容时原样返回', () => {
    expect(scrubText('家庭和睦，收入稳定', noBlacklist)).toBe('家庭和睦，收入稳定');
  });

  it('同一地址词重复出现不误伤（互异计数）', () => {
    expect(scrubText('母亲在市里菜市场摆摊', noBlacklist)).toBe('母亲在市里菜市场摆摊');
  });

  it('姓名模式（姓氏+称呼）掩码', () => {
    expect(scrubText('班主任张老师来访', noBlacklist)).toBe(`班主任${MASK}来访`);
  });

  it('身份证优先于手机号（138 开头 18 位只产生一个掩码）', () => {
    expect(scrubText('证件138001380001234567', noBlacklist)).toBe(`证件${MASK}`);
  });

  it('掩码固定电话', () => {
    expect(scrubText('家里固话010-12345678', noBlacklist)).toBe(`家里固话${MASK}`);
  });

  it('掩码珍珠号', () => {
    expect(scrubText('珍珠号：HEI-2026-001', noBlacklist)).toBe(MASK);
  });
});

describe('RULES 不变量（单一来源契约）', () => {
  it('非空、category 唯一、pattern 全为全局正则', () => {
    expect(RULES.length).toBeGreaterThan(0);
    const cats = RULES.map((r) => r.category);
    expect(new Set(cats).size).toBe(cats.length);
    for (const rule of RULES) expect(rule.pattern.global).toBe(true);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/text-scrubber.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现 src/security/rules.ts**

```ts
/** 掩码占位符 */
export const MASK = '[已隐藏]';

export type RuleCategory =
  | 'id-card' | 'mobile' | 'landline' | 'email' | 'qq' | 'wechat'
  | 'address' | 'pearl-id' | 'name';

export type RuleScope = 'text' | 'number' | 'both';

export interface Rule {
  category: RuleCategory;
  label: string; // 中文类别名
  pattern: RegExp; // 全局（g）
  scope: RuleScope;
}

/**
 * 规则集单一来源：TextScrubber（掩码）与 SecurityScanner（硬闸）共用。
 * 顺序有语义：id-card 在 mobile 之前（身份证号码含手机号样式的子串，先整体识别）。
 * 注意：所有 pattern 均为全局（g）正则；用 exec/test 消费前必须重置 lastIndex（replace/match 自动重置）。
 */
export const RULES: Rule[] = [
  { category: 'id-card', label: '身份证号', pattern: /\d{17}[\dXx]/g, scope: 'both' },
  { category: 'mobile', label: '手机号', pattern: /1[3-9]\d{9}/g, scope: 'both' },
  { category: 'landline', label: '固定电话', pattern: /0\d{2,3}-?\d{7,8}/g, scope: 'both' },
  { category: 'email', label: '邮箱', pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, scope: 'text' },
  { category: 'qq', label: 'QQ号', pattern: /qq[号]?[:：]?\s*[1-9]\d{4,10}/gi, scope: 'text' },
  { category: 'wechat', label: '微信号', pattern: /微信(号|id)?[:：]?\s*[a-zA-Z][a-zA-Z0-9_-]{5,19}/gi, scope: 'text' },
  { category: 'pearl-id', label: '珍珠号', pattern: /珍珠号[:：]?\s*[^\s，。；;,]*/g, scope: 'text' },
  {
    category: 'name',
    label: '姓名模式（姓氏+称呼）',
    // 复姓显式列出 + 单字姓氏 + 称呼（班已移除：班主任是角色词；{1,2} 贪婪量词会吞并相邻姓氏字，如「任张老师」，故弃用）
    pattern: /(?:欧阳|司马|上官|诸葛|夏侯|皇甫|尉迟|公孙|慕容|司徒|令狐|端木|轩辕|东方|西门|独孤|长孙|南宫|宇文|申屠|百里|呼延|第五|鲜于|闾丘|亓官|司寇|巫马|乐正|漆雕|公羊|公冶|宗政|濮阳|淳于|单于|太叔|公西|壤驷|宰父|谷梁|段干|拓跋|夹谷|东郭|羊舌|微生|梁丘|左丘|钟离|[赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜谢邹喻苏潘葛范彭鲁韦马苗方俞任袁柳鲍史唐费薛雷贺倪汤滕罗毕郝邬安常傅卞齐康伍余元顾孟平黄穆萧尹姚邵汪祁毛禹狄米贝明臧计成戴宋庞熊纪舒屈项祝董梁杜阮蓝闵席季贾路娄江童颜郭梅盛林刁钟徐邱骆高夏蔡田樊胡凌霍虞万支柯管卢莫经裘干解应宗丁宣邓郁单杭洪包诸左石崔吉钮龚程嵇邢滑裴陆荣翁荀惠甄曲封芮羿储靳汲邴糜松井段富巫乌焦巴弓车侯宓蓬全郗仰秋仲伊宫宁仇栾暴甘钭厉戎祖武符刘景詹束龙叶幸司韶郜黎蓟薄印宿白怀蒲邰鄂索籍赖卓蔺屠池乔阴胥苍双闻莘党翟谭贡劳逄姬申扶堵冉宰郦雍璩桑桂濮牛寿通边扈燕冀郏浦尚农温别庄晏柴瞿阎充慕连茹习宦艾鱼容向古易慎戈廖庾终暨居衡步都耿满弘匡国文寇广禄阙东欧殳沃利蔚越夔隆师巩厍聂晁勾敖融冷訾辛阚那简饶空曾毋沙乜养鞠须丰巢关蒯相查后荆红游竺权逯盖益桓公])(老师|校长|主任|同学)/g,
    scope: 'text',
  },
];

/** 地址子句掩码：同一子句（按标点切分）内互异地址词 ≥2 个 → 整句掩码 */
export const ADDRESS_TOKENS = /省|市|县|区|镇|乡|村|组|路|街道|街|巷|号|栋|单元|室|楼|小区|苑|花园/g;

/** 地址子句切分符（带捕获组；清洗器与扫描器共用，禁止加 g 标志） */
export const CLAUSE_SPLIT = /([。，；;！？!?，、：])/;

/** 结构化地区字段（省/市/县/籍贯）：不做地址规则扫描（区域级信息经用户确认保留） */
export const STRUCTURED_REGION_KEYS = new Set(['province', 'city', 'county', 'ancestralHome']);
```

- [ ] **Step 4: 实现 src/anonymization/text-scrubber.ts**

```ts
import { ADDRESS_TOKENS, CLAUSE_SPLIT, MASK, RULES } from '../security/rules';

/** 地址子句掩码：按标点切分，子句内互异地址词 ≥2 个则整句替换 */
function scrubAddressClauses(text: string): string {
  return text
    .split(CLAUSE_SPLIT)
    .map((seg) => {
      if (CLAUSE_SPLIT.test(seg)) return seg;
      const tokens = new Set(seg.match(ADDRESS_TOKENS) ?? []);
      return tokens.size >= 2 ? MASK : seg;
    })
    .join('');
}

/**
 * 叙事文本清洗：发送前把内嵌 PII 掩码为 [已隐藏]。
 * 规则顺序：身份证 → 手机 → 固话 → 邮箱 → QQ → 微信 → 珍珠号 → 姓名模式 → 地址子句。
 */
export function scrubText(text: string, nameBlacklist: Set<string>): string {
  let out = text;
  // 1. 黑名单姓名（学生姓名/教师姓名/审批人的精确值）
  for (const name of nameBlacklist) {
    if (name.length >= 2) out = out.split(name).join(MASK);
  }
  // 2. 规则模式掩码（text 规则；数字规则对文本同样生效由 both 规则覆盖）
  for (const rule of RULES) {
    out = out.replace(rule.pattern, MASK);
  }
  // 3. 地址子句
  return scrubAddressClauses(out);
}
```

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run tests/text-scrubber.test.ts`
Expected: PASS — 15 个用例全部通过。

- [ ] **Step 6: Commit**

```bash
git add src/security/rules.ts src/anonymization/text-scrubber.ts tests/text-scrubber.test.ts
git commit -m "feat: 安全规则集（单一来源）与叙事文本清洗器"
```

> **执行记录（控制器裁决的计划偏离）**：计划原文的「地址子句掩码」测试期望 `住在[已隐藏]` 与计划实现（整句替换）矛盾——"保留动词前缀再掩码"没有确定性规则可界定边界（`南湖` 本身就是地名，前缀保留规则有泄漏风险）；设计文档（第 5.4/6.1 节）只要求"详细地址片段 → `[已隐藏]`"。**裁决：保持整句替换语义，测试期望改为整句 `MASK`**（Task 7 的对应期望 `父亲电话[已隐藏]，住[已隐藏]` 同步改为 `父亲电话[已隐藏]，[已隐藏]`）。整句掩码更保守且可确定实现。质量审查后修复轮（Important）：① 地址子句改**互异词计数**（`母亲在市里菜市场摆摊` 不再被整句掩码）；② 切分符提取为 `CLAUSE_SPLIT` 单一来源（新增 `：`，供 Task 8 scanner 复用）；③ `ADDRESS_TOKENS` 中 `街道` 调至 `街` 前（消除死分支）；④ 补 5 个回归测试（互异计数/姓名模式/身份证优先顺序/固话/珍珠号）+ RULES 不变量测试，共 **15** 用例；⑤ RULES 注释补充 lastIndex 状态说明。⑥ 修复轮验证再发现（BLOCKED 上报）：`班`∈姓氏字符类使「班主任」（班+主任）被姓名模式误掩码——真实叙事高频角色词。**裁决：从姓氏字符类移除 `班`**（真实「班老师」场景极罕见，黑名单仍覆盖其全名；角色词误掩码损失远大于收益）。⑦ 移除 `班` 后暴露第二机制：`{1,2}` 贪婪量词在「班主任张老师来访」的「任」处吞并「任张」构成伪复姓（任张老师）。**裁决：姓名规则改为「显式常见复姓列表 + 单字姓氏」**，弃用 `{1,2}` 量词——修复「任张老师」类吞并，且顺带修复原实现「欧阳老师不掩码」（阳不在姓氏字符类）的复姓盲区。另：15 位旧版身份证仅部分残片掩码（无泄漏风险），本期不覆盖，设计文档 §6.1 的完整版校验属超出范围。

---

## Task 7: Anonymizer 脱敏组装器

**Files:**
- Create: `src/utils/number.ts`, `src/anonymization/anonymizer.ts`
- Modify: `src/anonymization/raw-store.ts`（授权偏离：独立函数 `collectNameBlacklist` 参数放宽为 `readonly RawStudentRecord[]`）
- Test: `tests/anonymizer.test.ts`

- [ ] **Step 1: 写失败测试 tests/anonymizer.test.ts**

```ts
import { describe, it, expect } from 'vitest';
import { anonymize, rankBand } from '../src/anonymization/anonymizer';
import { mapFields } from '../src/anonymization/field-mapper';
import type { RawStudentRecord } from '../src/types/student';
import { MASK } from '../src/security/rules';

const HEADERS = [
  '珍珠生姓名', '身份证号', '电话', 'qq', '微信', '邮箱', '详细地址', '珍珠号',
  '家访教师姓名', '审批人', '性别', '住址省', '州市', '县区', '录取高中全校排名',
  '全年级人数', '年收入', '人均年收入', '家庭情况', '住房状况',
];
const { mappedColumns } = mapFields(HEADERS);

const rec = (values: Record<string, string | number | null>): RawStudentRecord => ({
  sourceRow: 1,
  values,
});

describe('rankBand', () => {
  it('按比例区间化', () => {
    expect(rankBand(46, 923)).toBe('前5%');
    expect(rankBand(100, 923)).toBe('5%-15%');
    expect(rankBand(160, 923)).toBe('15%-30%');
    expect(rankBand(300, 923)).toBe('30%-50%');
    expect(rankBand(600, 923)).toBe('后50%');
  });
});

describe('anonymize', () => {
  it('敏感字段绝不出现在输出中', () => {
    const out = anonymize(
      [
        rec({
          珍珠生姓名: '测试学生甲',
          身份证号: '110101200001011234',
          电话: '13800138000',
          qq: '123456789',
          微信: 'wxid_abc123',
          邮箱: 'abc@example.com',
          详细地址: '某村一组8号',
          珍珠号: 'HEI-2026-001',
          家访教师姓名: '刘玉坤',
          审批人: '张磊',
          性别: '女',
          家庭情况: '母亲心脏病',
        }),
      ],
      mappedColumns,
    );
    const json = JSON.stringify(out.students[0]);
    expect(json).not.toContain('测试学生甲');
    expect(json).not.toContain('110101200001011234');
    expect(json).not.toContain('13800138000');
    expect(json).not.toContain('123456789');
    expect(json).not.toContain('wxid_abc123');
    expect(json).not.toContain('abc@example.com');
    expect(json).not.toContain('某村一组8号');
    expect(json).not.toContain('HEI-2026-001');
    expect(json).not.toContain('刘玉坤');
    expect(json).not.toContain('张磊');
    expect(out.students[0].gender).toBe('女');
    expect(out.students[0].familySituation).toBe('母亲心脏病');
  });

  it('生成连续匿名 ID 与姓名索引', () => {
    const out = anonymize(
      [rec({ 珍珠生姓名: '测试甲' }), rec({ 珍珠生姓名: '测试乙' })],
      mappedColumns,
    );
    expect(out.students.map((s) => s.anonymousId)).toEqual(['student-001', 'student-002']);
    expect(out.nameIndex.get('student-001')).toBe('测试甲');
  });

  it('排名泛化为区间；缺排名或年级人数时输出 null', () => {
    const withRank = anonymize([rec({ 录取高中全校排名: '160', 全年级人数: '923' })], mappedColumns);
    expect(withRank.students[0].admissionRankBand).toBe('15%-30%');
    const noGrade = anonymize([rec({ 录取高中全校排名: '160' })], mappedColumns);
    expect(noGrade.students[0].admissionRankBand).toBeNull();
  });

  it('数字字段解析（含带单位字符串）', () => {
    const out = anonymize([rec({ 年收入: '30000', 人均年收入: '10000.00' })], mappedColumns);
    expect(out.students[0].annualIncome).toBe(30000);
    expect(out.students[0].perCapitaIncome).toBe(10000);
  });

  it('叙事字段内嵌 PII 被掩码', () => {
    const out = anonymize(
      [rec({ 家庭情况: '父亲电话13800138000，住南湖回迁一号楼六单元701室' })],
      mappedColumns,
    );
    expect(out.students[0].familySituation).toBe(`父亲电话${MASK}，${MASK}`);
  });

  it('统计数字正确', () => {
    const out = anonymize(
      [rec({ 珍珠生姓名: '测试甲', 性别: '女' }), rec({ 珍珠生姓名: '测试乙' })],
      mappedColumns,
    );
    expect(out.stats.rawStudentCount).toBe(2);
    expect(out.stats.rawFieldCount).toBe(20);
    expect(out.stats.sensitiveFieldCount).toBe(10); // 8 身份 + 2 第三方
    expect(out.stats.droppedFieldCount).toBe(10);
    expect(out.stats.sentFieldCount).toBe(10);
  });
});
```

注意：统计口径 = 身份字段 8 个（姓名/身份证/电话/qq/微信/邮箱/详细地址/珍珠号）+ 第三方 2 个（家访教师姓名/审批人）→ sensitive=10；本测试 HEADERS 共 20 列，全部删除列=10，发送列=10（性别/省/市/县/排名/年级人数/年收入/人均/家庭情况/住房状况）。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/anonymizer.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现 src/utils/number.ts**

```ts
import type { CellValue } from '../types/student';

/** 解析数字：容忍带单位字符串（"10000.00"、"0.00元"、"1.4"）；无法解析返回 null */
export function toNumber(v: CellValue): number | null {
  if (v == null) return null;
  const s = String(v).replace(/[^\d.-]/g, '');
  if (s === '' || s === '.' || s === '-') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** 值 → 非空文本；空返回 null */
export function toText(v: CellValue): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}
```

- [ ] **Step 4: 实现 src/anonymization/anonymizer.ts**

```ts
import type {
  AnonymizedStudent, AnonymizationOutput, CellValue, MappedColumn, RawStudentRecord,
} from '../types/student';
import { scrubText } from './text-scrubber';
import { collectNameBlacklist } from './raw-store';
import { toNumber, toText } from '../utils/number';

/** 排名 → 区间（降低校内公示排名的间接识别风险） */
export function rankBand(rank: number, total: number): string {
  const pct = rank / total;
  if (pct <= 0.05) return '前5%';
  if (pct <= 0.15) return '5%-15%';
  if (pct <= 0.3) return '15%-30%';
  if (pct <= 0.5) return '30%-50%';
  return '后50%';
}

/** 需要解析为数字的 keep 字段 */
const NUMBER_KEYS: (keyof AnonymizedStudent)[] = [
  'distanceToSchoolKm', 'zhongkaoFullScore', 'zhongkaoScore', 'gradeSize',
  'annualIncome', 'perCapitaIncome', 'schoolChildrenCount',
];

const EMPTY_STUDENT: AnonymizedStudent = {
  anonymousId: '', gender: null, ethnicity: null, householdType: null, height: null,
  weight: null, healthStatus: null, difficultyLevel: null, enrollmentStatus: null,
  province: null, city: null, county: null, ancestralHome: null, distanceToSchoolKm: null,
  zhongkaoFullScore: null, zhongkaoScore: null, admissionRankBand: null, gradeSize: null,
  familySituation: null, visitMethod: null, visitSummary: null, awardsAndInterests: null,
  applicationReason: null, approvalComment: null, housingStatus: null, transportation: null,
  annualIncome: null, annualIncomeNote: null, perCapitaIncome: null, schoolChildrenCount: null,
  difficultyReason: null, elderlySupportStatus: null, elderlySupportNote: null, debtStatus: null,
  debtNote: null,
};

/**
 * 脱敏组装：RawStudentRecord[] → AnonymizedStudent[]。
 * drop 字段不进入输出；scrub 字段先文本清洗；generalize 字段变换后输出。
 */
export function anonymize(
  records: readonly RawStudentRecord[],
  mappedColumns: MappedColumn[],
): AnonymizationOutput {
  const byAction = (a: string) => mappedColumns.filter((c) => c.action.action === a);
  const keepCols = byAction('keep').filter((c) => c.canonicalKey);
  const scrubCols = byAction('scrub').filter((c) => c.canonicalKey);
  const generalizeCols = byAction('generalize');
  const droppedCols = byAction('drop');
  const sensitiveCount = droppedCols.filter(
    (c) => c.action.action === 'drop' && (c.action.reason === 'identity' || c.action.reason === 'third-party'),
  ).length;

  const nameBlacklist = collectNameBlacklist(records);
  const nameIndex = new Map<string, string>();

  const students = records.map((rec, i) => {
    const anonymousId = `student-${String(i + 1).padStart(3, '0')}`;
    const student: AnonymizedStudent = { ...EMPTY_STUDENT, anonymousId };

    // 姓名索引（仅本地内存，绝不进入 payload）
    const nameCol = mappedColumns.find(
      (c) => c.action.action === 'drop' && c.action.reason === 'identity' && c.normalizedHeader === '珍珠生姓名',
    );
    if (nameCol) {
      const n = toText(rec.values[nameCol.header]);
      if (n) nameIndex.set(anonymousId, n);
    }

    const setField = (key: string, value: CellValue) => {
      (student as unknown as Record<string, unknown>)[key] = value;
    };

    for (const col of keepCols) {
      const key = col.canonicalKey!;
      if ((NUMBER_KEYS as string[]).includes(key)) {
        setField(key, toNumber(rec.values[col.header]));
      } else {
        setField(key, toText(rec.values[col.header]));
      }
    }
    for (const col of scrubCols) {
      const rawText = toText(rec.values[col.header]);
      setField(col.canonicalKey!, rawText ? scrubText(rawText, nameBlacklist) : null);
    }
    for (const col of generalizeCols) {
      if (col.canonicalKey === 'admissionRank') {
        const rank = toNumber(rec.values[col.header]);
        const gradeHeader = mappedColumns.find((c) => c.canonicalKey === 'gradeSize')?.header;
        const grade = gradeHeader ? toNumber(rec.values[gradeHeader]) : null;
        setField('admissionRankBand', rank != null && grade != null && grade > 0 ? rankBand(rank, grade) : null);
      }
    }

    return student;
  });

  const sentFieldCount =
    keepCols.length + scrubCols.length + generalizeCols.length;

  return {
    students,
    nameIndex,
    stats: {
      rawStudentCount: records.length,
      rawFieldCount: mappedColumns.length,
      sensitiveFieldCount: sensitiveCount,
      droppedFieldCount: droppedCols.length,
      generalizedFieldCount: generalizeCols.length,
      sentFieldCount,
    },
  };
}
```

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run tests/anonymizer.test.ts`
Expected: PASS — 11 个用例全部通过（7 原始 + 4 修复轮新增）。

- [ ] **Step 6: Commit**

```bash
git add src/utils/number.ts src/anonymization/anonymizer.ts src/anonymization/raw-store.ts tests/anonymizer.test.ts
git commit -m "feat: Anonymizer 脱敏组装器（匿名ID/排名泛化/文本清洗）"
```

> **执行记录（控制器授权的计划偏离）**：① `anonymize` 入参为 `readonly RawStudentRecord[]`（与 `RawStore.snapshot()` 返回值一致，杜绝流水线内意外修改原始数据）；② 「叙事字段内嵌 PII 被掩码」期望为 `父亲电话[已隐藏]，[已隐藏]`（Task 6 整句掩码裁决联动）；③ 独立函数 `collectNameBlacklist` 签名同步放宽为 `readonly RawStudentRecord[]`（否则 tsc 报 TS2345：readonly 参数不能传给可变参数；该函数只读 records，放宽零风险），raw-store.ts 一并纳入本任务提交。
>
> **修复轮（代码质量审查后，控制器裁决）**：④ Important（计划级缺口）：nameIndex 匹配写死 `normalizedHeader === '珍珠生姓名'`，别名表头（姓名/学生姓名，FORBIDDEN_IDENTITY_ALIASES 明确支持）下姓名索引静默失效、Task 14 本地姓名定位失效。**裁决：改为 `NAME_BEARING_ALIASES.includes(c.normalizedHeader)`（保留 `reason === 'identity'` 过滤，天然排除第三方姓名列），补别名表头测试。** ⑤ Minor 采纳：`setField` 加运行时守卫 `if (!(key in EMPTY_STUDENT)) return;`——canonicalKey 闭集漂移时未知键绝不物化进输出（纵深防御），补守卫测试。⑥ Minor 采纳：`NUMBER_KEYS` 改 `as const satisfies readonly (keyof AnonymizedStudent)[]` + 照 field-policies.ts:106-114 模式加双向编译期一致性断言 `_numberKeysConsistency`（锁数值字段清单与类型漂移）。⑦ Minor 采纳：排名区间调用点补 `rank > 0`（0/负数排名损坏数据不得落「前5%」），补无效值测试 + 空记录零统计测试。⑧ Minor 弃用（记录备查）：`byAction` 参数收窄、删除 sensitiveCount 内「冗余」drop 判断（规格审查已实测该判断为 TS 联合收窄所必需，删之编译即错）、gradeSize 列查找循环外提升、EMPTY_STUDENT freeze——收益低于扰动，不采纳。⑨ 转交 Task 15：`JSON.stringify(output)` 不含姓名的断言（nameIndex 防泄漏目前依赖 Map 序列化为 `{}` 的 JS 语义）。

---

## Task 8: SecurityScanner 发送前硬闸

**Files:**
- Create: `src/security/scanner.ts`
- Test: `tests/scanner.test.ts`

- [ ] **Step 1: 写失败测试 tests/scanner.test.ts**

```ts
import { describe, it, expect } from 'vitest';
import { scanPayload, maskSnippet } from '../src/security/scanner';
import type { AnalysisRequest, AnonymizedStudent } from '../src/types/student';

const cleanStudent: AnonymizedStudent = {
  anonymousId: 'student-001', gender: '女', ethnicity: '汉族', householdType: '农村',
  height: '165cm', weight: '40kg', healthStatus: '健康', difficultyLevel: '一级困难',
  enrollmentStatus: null, province: '黑龙江省', city: '大庆市', county: '杜尔伯特蒙古族自治县',
  ancestralHome: '黑龙江省大庆市', distanceToSchoolKm: 1.4, zhongkaoFullScore: 820,
  zhongkaoScore: 701, admissionRankBand: '15%-30%', gradeSize: 923,
  familySituation: '母亲心脏病劳动能力弱', visitMethod: '入户家访', visitSummary: '家庭和睦',
  awardsAndInterests: '喜欢读书', applicationReason: '家庭困难', approvalComment: null,
  housingStatus: '租房（年租金/元）/10000以下', transportation: '无以上类型车辆',
  annualIncome: 30000, annualIncomeNote: '务农收入', perCapitaIncome: 10000,
  schoolChildrenCount: 1, difficultyReason: '母亲患心脏病', elderlySupportStatus: '4人',
  elderlySupportNote: null, debtStatus: '无负债', debtNote: null,
};

const cleanRequest: AnalysisRequest = {
  meta: { schoolName: '某中学', cohort: '2026级' },
  students: [cleanStudent],
};

describe('maskSnippet', () => {
  it('掩码片段不泄露完整敏感值', () => {
    const s = maskSnippet('110101200001011234');
    expect(s).not.toContain('110101200001011234');
    expect(s).toContain('****');
  });
});

describe('scanPayload', () => {
  it('干净 payload 通过', () => {
    const r = scanPayload(cleanRequest, new Set(['测试甲']));
    expect(r.passed).toBe(true);
    expect(r.findings).toHaveLength(0);
  });

  it('结构化地区字段不误报地址（用户确认保留的区域级信息）', () => {
    expect(scanPayload(cleanRequest, new Set()).passed).toBe(true);
  });

  it('学校名含省市不误报（校名属学校级元数据，经用户同意发送）', () => {
    const r = scanPayload(
      { ...cleanRequest, meta: { schoolName: '大庆市杜尔伯特蒙古族自治县第一中学', cohort: '2026级' } },
      new Set(),
    );
    expect(r.passed).toBe(true);
  });

  it('叙事文本含身份证号 → 拒绝且片段已掩码', () => {
    const r = scanPayload(
      { ...cleanRequest, students: [{ ...cleanStudent, familySituation: '证件110101200001011234' }] },
      new Set(),
    );
    expect(r.passed).toBe(false);
    expect(r.findings[0].category).toBe('id-card');
    expect(JSON.stringify(r.findings)).not.toContain('110101200001011234');
  });

  it('叙事文本含姓名黑名单中的姓名 → 拒绝', () => {
    const r = scanPayload(
      { ...cleanRequest, students: [{ ...cleanStudent, visitSummary: '与测试甲同班' }] },
      new Set(['测试甲']),
    );
    expect(r.passed).toBe(false);
    expect(r.findings.some((f) => f.category === 'name-blacklist')).toBe(true);
  });

  it('数字字段不误报（年收入 30000 不是 QQ 号）', () => {
    expect(scanPayload(cleanRequest, new Set()).passed).toBe(true);
  });

  it('禁止字段名出现在 payload → 拒绝', () => {
    const r = scanPayload({ students: [{ 身份证号: 'x', name: 'n' }] }, new Set());
    expect(r.passed).toBe(false);
    expect(r.findings.some((f) => f.category === 'forbidden-field')).toBe(true);
  });

  it('结构化字段含手机号 → 拒绝', () => {
    const r = scanPayload(
      { ...cleanRequest, students: [{ ...cleanStudent, housingStatus: '电话13800138000' }] },
      new Set(),
    );
    expect(r.passed).toBe(false);
    expect(r.findings[0].category).toBe('mobile');
  });

  it('叙事文本含详细地址片段 → 拒绝', () => {
    const r = scanPayload(
      { ...cleanRequest, students: [{ ...cleanStudent, visitSummary: '住在南湖回迁一号楼六单元701室' }] },
      new Set(),
    );
    expect(r.passed).toBe(false);
    expect(r.findings[0].category).toBe('address');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/scanner.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现 src/security/scanner.ts**

```ts
import { ADDRESS_TOKENS, CLAUSE_SPLIT, RULES, STRUCTURED_REGION_KEYS, type RuleCategory } from './rules';

export interface SecurityFinding {
  category: RuleCategory | 'name-blacklist' | 'forbidden-field';
  label: string;
  field: string; // 字段路径，如 students[0].familySituation
  snippet: string; // 掩码片段，绝不包含完整敏感值
}

export interface SecurityScanResult {
  passed: boolean;
  findings: SecurityFinding[];
}

/** 掩码片段：首尾各留 2 位 */
export function maskSnippet(value: string): string {
  if (value.length <= 4) return '****';
  return `${value.slice(0, 2)}****${value.slice(-2)}`;
}

/** 禁止出现在 payload 中的字段名（序列化后的 JSON key 检查） */
const FORBIDDEN_FIELD_NAMES = [
  '姓名', '身份证', '电话', '手机', 'qq', '微信', '邮箱', '地址', '珍珠号', '教师', '审批人',
];

/** 遍历 payload 中的所有字段值（含嵌套），按字段路径应用规则 */
function walk(
  node: unknown,
  path: string,
  key: string,
  isStructuredRegion: boolean,
  isSchoolName: boolean,
  findings: SecurityFinding[],
): void {
  if (node == null) return;
  if (typeof node === 'string') {
    if (isStructuredRegion) return; // 省/市/县/籍贯：区域级信息，用户确认保留
    for (const rule of RULES) {
      rule.pattern.lastIndex = 0;
      const m = rule.pattern.exec(node);
      if (m) {
        findings.push({
          category: rule.category,
          label: rule.label,
          field: path,
          snippet: maskSnippet(m[0]),
        });
        return; // 每字段只报告第一个命中
      }
    }
    // 地址子句检测（与清洗器同源逻辑）：同一子句内互异地址词 ≥2 个 → 命中
    // 学校名豁免：校名常含省市县字样，属学校级元数据（经用户同意发送）
    if (!isSchoolName) {
      for (const seg of node.split(CLAUSE_SPLIT)) {
        if (CLAUSE_SPLIT.test(seg)) continue;
        const tokens = new Set(seg.match(ADDRESS_TOKENS) ?? []);
        if (tokens.size >= 2) {
          findings.push({
            category: 'address',
            label: '详细地址',
            field: path,
            snippet: maskSnippet(seg.trim()),
          });
          break;
        }
      }
    }
    return;
  }
  if (typeof node === 'number') {
    const s = String(node);
    for (const rule of RULES.filter((r) => r.scope === 'both')) {
      rule.pattern.lastIndex = 0;
      const m = rule.pattern.exec(s);
      if (m) {
        findings.push({
          category: rule.category,
          label: rule.label,
          field: path,
          snippet: maskSnippet(m[0]),
        });
        return;
      }
    }
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item, i) => walk(item, `${path}[${i}]`, key, false, false, findings));
    return;
  }
  if (typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      walk(
        v,
        path === '' ? k : `${path}.${k}`,
        k,
        STRUCTURED_REGION_KEYS.has(k),
        k === 'schoolName',
        findings,
      );
    }
  }
}

/**
 * 发送前安全硬闸：对完整 payload 做最后扫描。
 * 命中即 passed=false；调用方（AnalysisService）必须拒绝发送。
 */
export function scanPayload(payload: unknown, nameBlacklist: Set<string>): SecurityScanResult {
  const findings: SecurityFinding[] = [];

  // 1. 姓名黑名单：全 payload 精确匹配
  const json = JSON.stringify(payload);
  for (const name of nameBlacklist) {
    if (name.length >= 2 && json.includes(name)) {
      findings.push({
        category: 'name-blacklist',
        label: '检测到名单中的姓名',
        field: '(全文)',
        snippet: maskSnippet(name),
      });
    }
  }

  // 2. 字段值规则扫描
  walk(payload, '', '', false, false, findings);

  // 3. 禁止字段名检查
  const keys = [...Object.keys(payload as object)];
  if (Array.isArray((payload as { students?: unknown }).students)) {
    for (const s of (payload as { students: object[] }).students) {
      keys.push(...Object.keys(s));
    }
  }
  for (const key of new Set(keys)) {
    if (FORBIDDEN_FIELD_NAMES.some((f) => key.includes(f))) {
      findings.push({
        category: 'forbidden-field',
        label: '存在禁止发送的字段名',
        field: key,
        snippet: maskSnippet(key),
      });
    }
  }

  return { passed: findings.length === 0, findings };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/scanner.test.ts`
Expected: PASS — 17 个用例全部通过（10 原始 + 7 修复轮新增）。

- [ ] **Step 5: Commit**

```bash
git add src/security/scanner.ts tests/scanner.test.ts
git commit -m "feat: SecurityScanner 发送前安全硬闸（规则+姓名黑名单+禁止字段名）"
```

> **执行记录（控制器裁决的计划偏离）**：① 计划 Step 4 用例数笔误（实际 1+8=9，与 Task 4 同类），新增「学校名含省市不误报」用例后共 **10 个**；② 真实校名常含省市县区字样（如「大庆市杜尔伯特蒙古族自治县第一中学」），按原实现对其做地址子句扫描会误报阻塞发送——**裁决：`walk` 增加 `isSchoolName` 参数，`schoolName` 豁免地址子句检测，其余规则照常扫描（纵深防御不削弱）**。学校名是经用户确认发送的学校级元数据。③ Task 6 质量审查前瞻建议采纳：地址检测由整串级改为**子句级互异计数**（`CLAUSE_SPLIT` 复用 rules.ts 单一来源，与清洗器语义一致，避免「家在县城，在市里打工」类已清洗保留文本被硬闸误拒）；恒假死代码 `TEXT_ONLY_CATEGORIES` 删除。
>
> **修复轮（代码质量审查后，控制器裁决）**：④ Important（计划级问题）：`isStructuredRegion` 整体豁免连 RULES 规则扫描一并跳过——省/市/县/籍贯在策略表中是 keep（不经过 scrubText），扫描器是这四个字段**唯一**防线；错列数据（如手机号落在「住址省」列）将三线全空；且合法地区值（黑龙江省/大庆市/杜尔伯特蒙古族自治县）实测不命中任何规则，跳过规则扫描零收益纯开洞。**裁决：豁免收窄为仅跳过地址子句检测（与 schoolName 对称），RULES 扫描照常。** ⑤ Important：`scanPayload` 非全函数——null payload 与 `students:[null]` 在第三层 `Object.keys` 抛 TypeError，与硬闸 fail-closed 原则相悖（Task 9 调用方若 try/catch 吞异常即成绕过点）。**裁决：null/非对象 payload 直接返回 `passed:false` + 结构异常 finding（`SecurityFinding.category` 联合新增 `'malformed-payload'`）；students 遍历跳过非对象元素，绝不抛异常。** ⑥ 补 7 个测试：地区字段含手机号→拒绝（钉死收窄后防线）、地址词跨子句负例（扫描器层钉同源集成）、数字分支命中身份证、maskSnippet ≤4/=5 边界、null payload fail-closed、`students:[null]` 不抛、连续两次扫描结果一致（共享正则状态不变量），共 17 用例。修复轮中控制器测试注记修正（实现者实测上报，控制器 node 复核采纳）：原注记 `1e16` 为「17 位数字串命中 id-card」有误——id-card 规则 `\d{17}[\dXx]` 最少匹配 18 字符，`String(1e16)` 仅 17 位不命中，且会被 landline 规则先行命中（实测 `0\d{2,3}-?\d{7,8}` 在 index 1 命中）。最小修正为 `1e17`（`String(1e17)` = 18 位纯数字串，id-card 优先命中），用例标题「17 位纯数字」改为「18 位纯数字」。⑦ Minor 采纳：删除 walk 死参数 `key`；`RULES.filter(r => r.scope === 'both')` 提升为模块级 `BOTH_SCOPE_RULES`；黑名单 `name.length >= 2` 守卫补注释。⑧ Minor 弃用（记录备查）：string/number 规则循环抽公共函数（重复可接受且测试已钉死）；禁止字段名检查移入 walk（当前固定 payload 结构完备，深层嵌套未来另议）；FORBIDDEN_FIELD_NAMES 英文别名（类型层编译期锁死英文表头不可能出现）；maskSnippet ≤6 全掩码阈值（偏离「首尾各留 2 位」既定规格，属抛光项）。

---

## Task 9: AnalysisProvider 接口与 AnalysisService

**Files:**
- Create: `src/analysis/provider.ts`, `src/analysis/analysis-service.ts`
- Test: `tests/analysis-service.test.ts`

- [ ] **Step 1: 写失败测试 tests/analysis-service.test.ts**

```ts
import { describe, it, expect, vi } from 'vitest';
import { AnalysisService, SecurityViolationError } from '../src/analysis/analysis-service';
import type { AnalysisProvider, AnalysisResult } from '../src/analysis/provider';
import type { AnalysisRequest, AnonymizedStudent } from '../src/types/student';

const fakeStudent: AnonymizedStudent = {
  anonymousId: 'student-001', gender: null, ethnicity: null, householdType: null,
  height: null, weight: null, healthStatus: null, difficultyLevel: null,
  enrollmentStatus: null, province: null, city: null, county: null, ancestralHome: null,
  distanceToSchoolKm: null, zhongkaoFullScore: null, zhongkaoScore: null,
  admissionRankBand: null, gradeSize: null, familySituation: null, visitMethod: null,
  visitSummary: null, awardsAndInterests: null, applicationReason: null,
  approvalComment: null, housingStatus: null, transportation: null, annualIncome: null,
  annualIncomeNote: null, perCapitaIncome: null, schoolChildrenCount: null,
  difficultyReason: null, elderlySupportStatus: null, elderlySupportNote: null,
  debtStatus: null, debtNote: null,
};

const fakeResult: AnalysisResult = {
  school: {
    studentCount: 1, difficultyDistribution: {}, lowIncomeCount: 0, lowIncomeRatio: 0,
    majorIllnessCount: 0, singleParentOrWeakLaborCount: 0, highDebtCount: 0,
    rentalCount: 0, longDistanceCount: 0,
    completeness: { totalFields: 1, perStudent: [], averageMissing: 0 },
    focusStudentIds: [], suggestions: [],
  },
  students: [],
};

const cleanRequest: AnalysisRequest = {
  meta: { schoolName: '某中学', cohort: '2026级' },
  students: [fakeStudent],
};

describe('AnalysisService', () => {
  it('扫描失败时拒绝发送，provider 不被调用', async () => {
    const provider: AnalysisProvider = { name: 'stub', analyze: vi.fn(async () => fakeResult) };
    const service = new AnalysisService(provider);
    const malicious: AnalysisRequest = {
      ...cleanRequest,
      students: [{ ...fakeStudent, familySituation: '证件110101200001011234' }],
    };
    await expect(service.analyze(malicious, new Set(['测试甲']))).rejects.toBeInstanceOf(
      SecurityViolationError,
    );
    expect(provider.analyze).not.toHaveBeenCalled();
  });

  it('扫描通过时委托 provider 并返回结果', async () => {
    const provider: AnalysisProvider = { name: 'stub', analyze: vi.fn(async () => fakeResult) };
    const service = new AnalysisService(provider);
    const result = await service.analyze(cleanRequest, new Set(['测试甲']));
    expect(provider.analyze).toHaveBeenCalledWith(cleanRequest);
    expect(result).toBe(fakeResult);
  });

  it('违规错误携带 findings', async () => {
    expect.assertions(2);
    const provider: AnalysisProvider = { name: 'stub', analyze: vi.fn(async () => fakeResult) };
    const service = new AnalysisService(provider);
    const malicious: AnalysisRequest = {
      ...cleanRequest,
      students: [{ ...fakeStudent, familySituation: '证件110101200001011234' }],
    };
    try {
      await service.analyze(malicious, new Set());
    } catch (e) {
      expect(e).toBeInstanceOf(SecurityViolationError);
      expect((e as SecurityViolationError).findings.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/analysis-service.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现 src/analysis/provider.ts**

```ts
import type { AnalysisRequest } from '../types/student';

/** 分析结果契约：只输出分析/核实/建议，严禁「通过/淘汰」类结论 */
export interface DifficultyFactor {
  label: string;
  weight: number; // 越大越重要
  evidence: string;
}

export interface StudentInterviewGuide {
  anonymousId: string;
  basicInfo: { label: string; value: string }[];
  reasonSummary: string;
  familySummary: string;
  difficultyFactors: DifficultyFactor[];
  verificationPoints: string[];
  suggestedQuestions: string[];
  cautions: string[];
}

export interface SchoolOverview {
  studentCount: number;
  difficultyDistribution: Record<string, number>;
  lowIncomeCount: number;
  lowIncomeRatio: number; // 0-1
  majorIllnessCount: number;
  singleParentOrWeakLaborCount: number;
  highDebtCount: number;
  rentalCount: number;
  longDistanceCount: number;
  completeness: {
    totalFields: number;
    perStudent: { anonymousId: string; missingCount: number }[];
    averageMissing: number;
  };
  focusStudentIds: string[];
  suggestions: string[];
}

export interface AnalysisResult {
  school: SchoolOverview;
  students: StudentInterviewGuide[];
}

/**
 * 分析提供者接口。v1 用 MockAnalysisProvider；
 * 未来 DeepSeekAnalysisProvider 实现同一接口（API 地址用户配置，Key 绝不写死在源码）。
 */
export interface AnalysisProvider {
  readonly name: string;
  analyze(request: AnalysisRequest): Promise<AnalysisResult>;
}
```

- [ ] **Step 4: 实现 src/analysis/analysis-service.ts**

```ts
import { scanPayload, type SecurityFinding } from '../security/scanner';
import type { AnalysisRequest } from '../types/student';
import type { AnalysisProvider, AnalysisResult } from './provider';

export class SecurityViolationError extends Error {
  constructor(public readonly findings: SecurityFinding[]) {
    super('发送前安全检查未通过');
    this.name = 'SecurityViolationError';
  }
}

/**
 * 唯一发请求处。安全硬闸在此执行：UI 无法绕过。
 * 未来接入 DeepSeek 时必须继续通过本服务发送。
 */
export class AnalysisService {
  constructor(private readonly provider: AnalysisProvider) {}

  async analyze(request: AnalysisRequest, nameBlacklist: Set<string>): Promise<AnalysisResult> {
    const scan = scanPayload(request, nameBlacklist);
    if (!scan.passed) {
      throw new SecurityViolationError(scan.findings);
    }
    return this.provider.analyze(request);
  }
}
```

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run tests/analysis-service.test.ts`
Expected: PASS — 3 个用例全部通过。

- [ ] **Step 6: Commit**

```bash
git add src/analysis/provider.ts src/analysis/analysis-service.ts tests/analysis-service.test.ts
git commit -m "feat: AnalysisProvider 接口与分析服务（内置发送前安全硬闸）"
```

---

## Task 10: Mock 分析器与中性问题模板库

**Files:**
- Create: `src/analysis/question-templates.ts`, `src/analysis/mock-provider.ts`
- Test: `tests/mock-provider.test.ts`

- [ ] **Step 1: 写失败测试 tests/mock-provider.test.ts**

```ts
import { describe, it, expect } from 'vitest';
import { MockAnalysisProvider } from '../src/analysis/mock-provider';
import type { AnalysisRequest, AnonymizedStudent } from '../src/types/student';

function student(overrides: Partial<AnonymizedStudent> = {}): AnonymizedStudent {
  return {
    anonymousId: 'student-001', gender: '女', ethnicity: '汉族', householdType: '农村',
    height: null, weight: null, healthStatus: '健康', difficultyLevel: null,
    enrollmentStatus: null, province: '云南省', city: '曲靖市', county: '会泽县',
    ancestralHome: null, distanceToSchoolKm: 8, zhongkaoFullScore: 820, zhongkaoScore: 701,
    admissionRankBand: '15%-30%', gradeSize: 923,
    familySituation: '母亲患心脏病，劳动能力弱', visitMethod: '入户家访',
    visitSummary: '家庭收入来源单一', awardsAndInterests: '喜欢阅读',
    applicationReason: '家庭困难，希望减轻负担', approvalComment: null,
    housingStatus: '租房（年租金/元）/10000以下', transportation: '无以上类型车辆',
    annualIncome: 24000, annualIncomeNote: null, perCapitaIncome: 8000,
    schoolChildrenCount: 2, difficultyReason: '母亲心脏病，父亲务农',
    elderlySupportStatus: '4人', elderlySupportNote: '爷爷奶奶体弱',
    debtStatus: '5万元', debtNote: null,
    ...overrides,
  };
}

const requestWith = (students: AnonymizedStudent[]): AnalysisRequest => ({
  meta: { schoolName: '某中学', cohort: '2026级' },
  students,
});

describe('MockAnalysisProvider', () => {
  it('学校级统计正确', async () => {
    const provider = new MockAnalysisProvider();
    const result = await provider.analyze(requestWith([
      student(),
      student({ anonymousId: 'student-002', perCapitaIncome: 20000, familySituation: '健康', difficultyReason: '无', debtStatus: '无负债', housingStatus: '自建房', distanceToSchoolKm: 1, schoolChildrenCount: 1, elderlySupportStatus: null, elderlySupportNote: null }),
    ]));
    expect(result.school.studentCount).toBe(2);
    expect(result.school.lowIncomeCount).toBe(1);
    expect(result.school.majorIllnessCount).toBe(1);
    expect(result.school.highDebtCount).toBe(1);
    expect(result.school.rentalCount).toBe(1);
    expect(result.school.longDistanceCount).toBe(1);
    expect(result.school.focusStudentIds).toEqual(['student-001']);
  });

  it('学生级：困难因素按权重降序', async () => {
    const provider = new MockAnalysisProvider();
    const result = await provider.analyze(requestWith([student()]));
    const guide = result.students[0];
    const weights = guide.difficultyFactors.map((f) => f.weight);
    expect([...weights].sort((a, b) => b - a)).toEqual(weights);
    expect(guide.difficultyFactors.length).toBeGreaterThan(0);
  });

  it('学生级：推荐问题 5-8 个，均为中性问题', async () => {
    const provider = new MockAnalysisProvider();
    const result = await provider.analyze(requestWith([student()]));
    const qs = result.students[0].suggestedQuestions;
    expect(qs.length).toBeGreaterThanOrEqual(5);
    expect(qs.length).toBeLessThanOrEqual(8);
    for (const q of qs) {
      expect(q).not.toMatch(/是不是因为|一定|肯定|困难吗|可怜/);
    }
  });

  it('涉及疾病时给出注意事项', async () => {
    const provider = new MockAnalysisProvider();
    const result = await provider.analyze(requestWith([student()]));
    expect(result.students[0].cautions.length).toBeGreaterThan(0);
  });

  it('输出不含结论性表述', async () => {
    const provider = new MockAnalysisProvider();
    const result = await provider.analyze(requestWith([student()]));
    const json = JSON.stringify(result);
    expect(json).not.toContain('建议通过');
    expect(json).not.toContain('建议淘汰');
    expect(json).not.toContain('取消资格');
  });

  it('确定性：相同输入产生相同输出', async () => {
    const provider = new MockAnalysisProvider();
    const a = await provider.analyze(requestWith([student()]));
    const b = await provider.analyze(requestWith([student()]));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('材料缺失被计入完整度', async () => {
    const provider = new MockAnalysisProvider();
    const result = await provider.analyze(requestWith([student()]));
    const missing = result.school.completeness.perStudent[0].missingCount;
    expect(missing).toBeGreaterThan(0); // annualIncomeNote/approvalComment 等为 null
  });

  it('学生级：未命中的因素不出现（健康/无负债学生不产生困难因素）', async () => {
    const provider = new MockAnalysisProvider();
    const result = await provider.analyze(requestWith([
      student({
        anonymousId: 'student-002', perCapitaIncome: 20000, familySituation: '健康',
        difficultyReason: '无', debtStatus: '无负债', debtNote: null,
        housingStatus: '自建房', distanceToSchoolKm: 1, schoolChildrenCount: 1,
        elderlySupportStatus: null, elderlySupportNote: null,
        healthStatus: '健康', visitSummary: '家庭收入来源单一', annualIncomeNote: '务农',
      }),
    ]));
    expect(result.students[0].difficultyFactors).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/mock-provider.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现 src/analysis/question-templates.ts**

```ts
import type { AnonymizedStudent } from '../types/student';

export interface QuestionTemplate {
  id: string;
  text: string;
  /** 出现条件；不满足则跳过。null = 必问 */
  when: ((s: AnonymizedStudent) => boolean) | null;
  /** 优先级（越小越靠前） */
  priority: number;
}

export function hasRental(s: AnonymizedStudent): boolean {
  return /租房|租住|出租/.test(s.housingStatus ?? '');
}
export function hasElderly(s: AnonymizedStudent): boolean {
  return s.elderlySupportStatus != null && s.elderlySupportStatus.trim() !== '';
}
export function hasDebt(s: AnonymizedStudent): boolean {
  const d = (s.debtStatus ?? '').trim();
  if (d === '') return false;
  return !/^(无|0|无负债|没有)$/.test(d);
}
export function hasIllness(s: AnonymizedStudent): boolean {
  return /癌|肿瘤|残疾|手术|住院|慢性|重症|心脏病|糖尿病|精神|瘫痪|尿毒症|白血病|中风|肝硬化|透析|病/.test(
    [s.healthStatus, s.familySituation, s.visitSummary, s.difficultyReason, s.elderlySupportNote, s.annualIncomeNote]
      .filter(Boolean).join('，'),
  );
}

/** 中性问题模板库：不诱导、不给结论、尊重学生 */
export const QUESTION_TEMPLATES: QuestionTemplate[] = [
  { id: 'q-reason', text: '请问你是基于什么原因申请珍珠生呢？', when: null, priority: 1 },
  { id: 'q-income', text: '你方便介绍一下目前家里主要的经济来源吗？', when: (s) => s.annualIncomeNote == null, priority: 2 },
  { id: 'q-family', text: '请你介绍一下家里的情况，有没有兄弟姐妹，他们目前在上学还是工作？', when: null, priority: 3 },
  { id: 'q-siblings', text: '家里还有几位兄弟姐妹在上学？他们目前在哪里上学？', when: (s) => (s.schoolChildrenCount ?? 0) >= 2, priority: 4 },
  { id: 'q-elderly', text: '家中是否有老人需要照顾？他们目前身体状况如何？', when: hasElderly, priority: 5 },
  { id: 'q-housing', text: '目前住房是自建的还是租住的？方便介绍一下居住情况吗？', when: null, priority: 6 },
  { id: 'q-rent', text: '如果是租房，方便介绍一下租金和一起居住的人吗？', when: hasRental, priority: 7 },
  { id: 'q-distance', text: '你多久回家一次？往返路上大概需要多长时间、多少花费？', when: (s) => (s.distanceToSchoolKm ?? 0) > 5, priority: 8 },
  { id: 'q-living', text: '你现在住校吗？住宿和餐费是怎么安排的？', when: null, priority: 9 },
  { id: 'q-subsidy', text: '学校目前有哪些费用减免或补助？这些补助落实情况怎么样？', when: null, priority: 10 },
  { id: 'q-expense', text: '你每个月的生活开销大概是多少？主要用在哪些方面？', when: null, priority: 11 },
  { id: 'q-debt', text: '你方便介绍一下家里目前的支出和负担情况吗？', when: hasDebt, priority: 12 },
  { id: 'q-health', text: '家人的身体状况怎么样？平时的照顾情况如何？', when: hasIllness, priority: 13 },
  { id: 'q-learn', text: '你觉得自己目前的学习状态怎么样？有没有特别喜欢的科目？', when: null, priority: 14 },
  { id: 'q-class', text: '在班里有没有担任什么职务？和老师、同学的相处怎么样？', when: null, priority: 15 },
  { id: 'q-program', text: '你是怎么了解到捡回珍珠计划的？对它了解多少？', when: null, priority: 16 },
  { id: 'q-future', text: '你对未来有什么打算？有没有想过大学想读什么方向？', when: null, priority: 17 },
];

/** 按条件与优先级选 5-8 个问题（确定性） */
export function selectQuestions(s: AnonymizedStudent): string[] {
  const matched = QUESTION_TEMPLATES
    .filter((t) => t.when === null || t.when(s))
    .sort((a, b) => a.priority - b.priority);
  return matched.slice(0, 8).map((t) => t.text);
}
```

- [ ] **Step 4: 实现 src/analysis/mock-provider.ts**

```ts
import type { AnalysisRequest, AnonymizedStudent } from '../types/student';
import type {
  AnalysisProvider, AnalysisResult, DifficultyFactor, SchoolOverview, StudentInterviewGuide,
} from './provider';
import { hasDebt, hasElderly, hasIllness, hasRental, selectQuestions } from './question-templates';

const LOW_INCOME_THRESHOLD = 10000; // 人均年收入阈值（元）
const LONG_DISTANCE_KM = 5;
const FOCUS_FACTOR_THRESHOLD = 3;
const SENT_FIELD_COUNT = 34; // AnonymizedStudent 字段数（不含 anonymousId），用于材料完整度

const WEAK_LABOR_KEYWORDS = /弱劳动|劳动能力弱|劳动能力不足|无劳动能力|残疾|患病|不能劳动|重病/;
const SINGLE_PARENT_KEYWORDS = /单亲|离异|离世|去世|亡故|独自抚养|母亲独自|父亲独自/;
const DEBT_KEYWORDS = /负债|欠款|借款|贷款|外债|还债/;

const narrativeText = (s: AnonymizedStudent): string =>
  [
    s.familySituation, s.visitSummary, s.applicationReason, s.approvalComment,
    s.difficultyReason, s.elderlySupportNote, s.debtNote, s.annualIncomeNote,
    s.awardsAndInterests,
  ]
    .filter(Boolean)
    .join('，');

const isLowIncome = (s: AnonymizedStudent): boolean =>
  s.perCapitaIncome != null && s.perCapitaIncome < LOW_INCOME_THRESHOLD;
const isLongDistance = (s: AnonymizedStudent): boolean =>
  (s.distanceToSchoolKm ?? 0) > LONG_DISTANCE_KM;
const isHighDebt = (s: AnonymizedStudent): boolean => hasDebt(s) || DEBT_KEYWORDS.test(narrativeText(s));
const isIllness = (s: AnonymizedStudent): boolean => hasIllness(s);
const isSingleParentOrWeakLabor = (s: AnonymizedStudent): boolean =>
  SINGLE_PARENT_KEYWORDS.test(narrativeText(s)) || WEAK_LABOR_KEYWORDS.test(narrativeText(s));

/** 困难类型分布：优先用困难度字段，空则按关键词分类 */
function difficultyDistribution(students: AnonymizedStudent[]): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const s of students) {
    const level = (s.difficultyLevel ?? '').trim();
    if (level) {
      dist[level] = (dist[level] ?? 0) + 1;
      continue;
    }
    const tags: string[] = [];
    if (isIllness(s)) tags.push('疾病家庭');
    if (isSingleParentOrWeakLabor(s)) tags.push('单亲/弱劳动');
    if (isLowIncome(s)) tags.push('低收入');
    if (isHighDebt(s)) tags.push('负债');
    if (hasElderly(s)) tags.push('赡养老人');
    if ((s.schoolChildrenCount ?? 0) >= 2) tags.push('多子女上学');
    const key = tags.length > 0 ? tags.join('+') : '未识别';
    dist[key] = (dist[key] ?? 0) + 1;
  }
  return dist;
}

function missingFieldCount(s: AnonymizedStudent): number {
  const { anonymousId: _id, ...rest } = s;
  return Object.values(rest).filter((v) => v == null || v === '').length;
}

function buildSchoolOverview(students: AnonymizedStudent[]): SchoolOverview {
  const lowIncome = students.filter(isLowIncome).length;
  const factors = (s: AnonymizedStudent): DifficultyFactor[] =>
    [
      { label: '重大疾病', weight: 5, evidence: '材料提及疾病/治疗情况', hit: isIllness(s) },
      { label: '家庭负债', weight: 4, evidence: '材料显示存在负债', hit: isHighDebt(s) },
      { label: '单亲/弱劳动能力', weight: 4, evidence: '材料提及家庭劳动力不足', hit: isSingleParentOrWeakLabor(s) },
      { label: '低收入', weight: 3, evidence: '人均年收入低于参考线', hit: isLowIncome(s) },
      { label: '多子女上学', weight: 2, evidence: '上学子女人数较多', hit: (s.schoolChildrenCount ?? 0) >= 2 },
      { label: '赡养老人', weight: 2, evidence: '有需赡养老人', hit: hasElderly(s) },
      { label: '租房陪读', weight: 1, evidence: '租房居住', hit: hasRental(s) },
      { label: '远距通学', weight: 1, evidence: '距离学校较远', hit: isLongDistance(s) },
    ]
      .filter((f) => f.hit)
      .map(({ label, weight, evidence }) => ({ label, weight, evidence }));

  const perStudentMissing = students.map((s) => ({
    anonymousId: s.anonymousId,
    missingCount: missingFieldCount(s),
  }));
  const totalMissing = perStudentMissing.reduce((sum, p) => sum + p.missingCount, 0);

  return {
    studentCount: students.length,
    difficultyDistribution: difficultyDistribution(students),
    lowIncomeCount: lowIncome,
    lowIncomeRatio: students.length > 0 ? lowIncome / students.length : 0,
    majorIllnessCount: students.filter(isIllness).length,
    singleParentOrWeakLaborCount: students.filter(isSingleParentOrWeakLabor).length,
    highDebtCount: students.filter(isHighDebt).length,
    rentalCount: students.filter(hasRental).length,
    longDistanceCount: students.filter(isLongDistance).length,
    completeness: {
      totalFields: SENT_FIELD_COUNT,
      perStudent: perStudentMissing,
      averageMissing: students.length > 0 ? totalMissing / students.length : 0,
    },
    focusStudentIds: students.filter((s) => factors(s).length >= FOCUS_FACTOR_THRESHOLD).map((s) => s.anonymousId),
    suggestions: [
      '建议面谈前先浏览全校整体情况，重点约见困难因素较多的学生',
      '对材料信息缺失较多的学生，面谈时可适当多花时间了解',
      '关注材料中收入、疾病、负债等描述的一致性',
    ],
  };
}

function buildStudentGuide(s: AnonymizedStudent): StudentInterviewGuide {
  const basicInfo: { label: string; value: string }[] = [
    ['性别', s.gender], ['民族', s.ethnicity], ['户口', s.householdType],
    ['健康情况', s.healthStatus], ['困难度', s.difficultyLevel],
    ['就读状态', s.enrollmentStatus],
    ['地区', [s.province, s.city, s.county].filter(Boolean).join('') || null],
    ['距校路程', s.distanceToSchoolKm != null ? `${s.distanceToSchoolKm}公里` : null],
    ['中考成绩', s.zhongkaoScore != null && s.zhongkaoFullScore != null ? `${s.zhongkaoScore}/${s.zhongkaoFullScore}` : null],
    ['年级排名', s.admissionRankBand],
    ['住房状况', s.housingStatus], ['交通工具', s.transportation],
    ['家庭年收入', s.annualIncome != null ? `${s.annualIncome}元` : null],
    ['人均年收入', s.perCapitaIncome != null ? `${s.perCapitaIncome}元` : null],
    ['上学子女人数', s.schoolChildrenCount != null ? `${s.schoolChildrenCount}人` : null],
    ['赡养老人', s.elderlySupportStatus], ['负债情况', s.debtStatus],
  ]
    .filter(([, v]) => v != null && v !== '')
    .map(([label, value]) => ({ label, value: value as string }));

  const excerpt = (t: string | null, max = 80): string => {
    if (!t) return '';
    const trimmed = t.trim();
    return trimmed.length > max ? `${trimmed.slice(0, max)}……` : trimmed;
  };

  const factors: DifficultyFactor[] = [
    { label: '重大疾病', weight: 5, evidence: excerpt(s.familySituation) || excerpt(s.difficultyReason), hit: isIllness(s) },
    { label: '家庭负债', weight: 4, evidence: excerpt(s.debtNote) || (s.debtStatus ?? ''), hit: isHighDebt(s) },
    { label: '单亲/弱劳动能力', weight: 4, evidence: excerpt(s.visitSummary) || excerpt(s.difficultyReason), hit: isSingleParentOrWeakLabor(s) },
    { label: '低收入', weight: 3, evidence: `人均年收入${s.perCapitaIncome ?? '未知'}元`, hit: isLowIncome(s) },
    { label: '多子女上学', weight: 2, evidence: `上学子女${s.schoolChildrenCount ?? 0}人`, hit: (s.schoolChildrenCount ?? 0) >= 2 },
    { label: '赡养老人', weight: 2, evidence: excerpt(s.elderlySupportNote) || (s.elderlySupportStatus ?? ''), hit: hasElderly(s) },
    { label: '租房陪读', weight: 1, evidence: s.housingStatus ?? '', hit: hasRental(s) },
    { label: '远距通学', weight: 1, evidence: `距校${s.distanceToSchoolKm ?? 0}公里`, hit: isLongDistance(s) },
  ]
    .filter((f) => f.hit)
    .map(({ label, weight, evidence }) => ({ label, weight, evidence }));

  const verificationPoints: string[] = [];
  if (isLowIncome(s) && !s.annualIncomeNote) {
    verificationPoints.push('申请材料显示家庭年收入较低，但收入来源描述不够清晰，建议面谈时了解主要收入来源。');
  }
  if ((s.schoolChildrenCount ?? 0) >= 2) {
    verificationPoints.push('家庭成员较多，建议确认实际共同生活人口与在读子女情况。');
  }
  if (isHighDebt(s) && !s.debtNote) {
    verificationPoints.push('材料显示存在负债，建议了解负债形成原因与当前还款压力。');
  }
  if (hasRental(s)) {
    verificationPoints.push('建议确认当前住房、租金与陪读情况。');
  }
  if (isLongDistance(s)) {
    verificationPoints.push('建议了解往返学校的实际频率与交通成本。');
  }
  if (isSingleParentOrWeakLabor(s)) {
    verificationPoints.push('材料提及家庭劳动力不足，建议了解实际劳动力与收入支撑情况。');
  }

  const cautions: string[] = [];
  if (isIllness(s)) {
    cautions.push('该生材料涉及家人健康问题，建议采用开放式提问，避免直接带入结论，注意保护学生自尊。');
  }
  if (isHighDebt(s)) {
    cautions.push('涉及负债话题时建议语气缓和，先了解整体开支情况，不直接追问债务细节。');
  }

  return {
    anonymousId: s.anonymousId,
    basicInfo,
    reasonSummary: excerpt(s.applicationReason, 120) || '材料中未填写申请理由。',
    familySummary:
      [
        s.householdType ? `户口类型${s.householdType}` : null,
        s.annualIncome != null ? `家庭年收入约${s.annualIncome}元` : null,
        s.perCapitaIncome != null ? `人均年收入${s.perCapitaIncome}元` : null,
        s.housingStatus ? `住房：${s.housingStatus}` : null,
        s.schoolChildrenCount != null ? `上学子女${s.schoolChildrenCount}人` : null,
        s.elderlySupportStatus ? `赡养老人：${s.elderlySupportStatus}` : null,
        s.debtStatus ? `负债：${s.debtStatus}` : null,
      ]
        .filter(Boolean)
        .join('，') + (s.visitSummary ? `。家访记录：${excerpt(s.visitSummary, 100)}` : ''),
    difficultyFactors: factors,
    verificationPoints,
    suggestedQuestions: selectQuestions(s),
    cautions,
  };
}

/**
 * Mock 分析器：确定性规则引擎，模拟 AI 分析。
 * 只输出分析/核实/建议，绝不输出「通过/淘汰」结论。
 */
export class MockAnalysisProvider implements AnalysisProvider {
  readonly name = 'mock';

  async analyze(request: AnalysisRequest): Promise<AnalysisResult> {
    return {
      school: buildSchoolOverview(request.students),
      students: request.students.map(buildStudentGuide),
    };
  }
}
```

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run tests/mock-provider.test.ts`
Expected: PASS — 8 个用例全部通过。

- [ ] **Step 6: Commit**

```bash
git add src/analysis/question-templates.ts src/analysis/mock-provider.ts tests/mock-provider.test.ts
git commit -m "feat: Mock 分析器（确定性规则引擎）与中性问题模板库"
```

**执行记录（控制器预检裁决）：**
- 学生级困难因素改为 hit 门控：原草案仅有 evidence 门控（`evidence: excerpt(...) || (s.debtStatus ?? '')`），「无负债」学生会生成一条"家庭负债"因素。裁决：给全部 8 个因素加 `hit` 谓词（isIllness/isHighDebt/isSingleParentOrWeakLabor/isLowIncome/schoolChildrenCount≥2/hasElderly/hasRental/isLongDistance），`.filter((f) => f.hit)` 后再剥离 hit 字段；basicInfo 过滤排除空串。同步新增回归测试「学生级：未命中的因素不出现」，Step 5 用例数 7→8。

---

## Task 11: 报告生成与 Markdown 下载

**Files:**
- Create: `src/report/types.ts`, `src/report/general-guide.ts`, `src/report/generator.ts`, `src/report/markdown.ts`, `src/utils/field-labels.ts`, `src/utils/download.ts`
- Test: `tests/report.test.ts`

- [ ] **Step 1: 写失败测试 tests/report.test.ts**

```ts
import { describe, it, expect } from 'vitest';
import { generateReport } from '../src/report/generator';
import { reportToMarkdown } from '../src/report/markdown';
import { MockAnalysisProvider } from '../src/analysis/mock-provider';
import type { AnonymizedStudent, AnalysisRequest } from '../src/types/student';

const sampleStudent: AnonymizedStudent = {
  anonymousId: 'student-001', gender: '女', ethnicity: '汉族', householdType: '农村',
  height: null, weight: null, healthStatus: '健康', difficultyLevel: null,
  enrollmentStatus: null, province: '云南省', city: '曲靖市', county: '会泽县',
  ancestralHome: null, distanceToSchoolKm: 8, zhongkaoFullScore: 820, zhongkaoScore: 701,
  admissionRankBand: '15%-30%', gradeSize: 923,
  familySituation: '母亲患心脏病', visitMethod: '入户家访', visitSummary: '收入单一',
  awardsAndInterests: '阅读', applicationReason: '家庭困难，希望减轻负担', approvalComment: null,
  housingStatus: '租房（年租金/元）/10000以下', transportation: '无',
  annualIncome: 24000, annualIncomeNote: null, perCapitaIncome: 8000,
  schoolChildrenCount: 2, difficultyReason: '母亲心脏病', elderlySupportStatus: '4人',
  elderlySupportNote: null, debtStatus: '5万元', debtNote: null,
};

describe('generateReport + reportToMarkdown', () => {
  it('生成报告模型', async () => {
    const result = await new MockAnalysisProvider().analyze({
      meta: { schoolName: '某中学', cohort: '2026级' },
      students: [sampleStudent],
    } satisfies AnalysisRequest);
    const report = generateReport(result, { schoolName: '某中学', cohort: '2026级' }, new Date('2026-08-21T10:00:00'));
    expect(report.schoolName).toBe('某中学');
    expect(report.studentGuides).toHaveLength(1);
  });

  it('Markdown 含两级结构与附录', async () => {
    const result = await new MockAnalysisProvider().analyze({
      meta: { schoolName: '某中学', cohort: '2026级' },
      students: [sampleStudent],
    } satisfies AnalysisRequest);
    const report = generateReport(result, { schoolName: '某中学', cohort: '2026级' }, new Date('2026-08-21T10:00:00'));
    const md = reportToMarkdown(report);
    expect(md).toContain('# 走访参考报告');
    expect(md).toContain('## 一、学校整体情况');
    expect(md).toContain('### student-001');
    expect(md).toContain('## 三、通用面谈指南');
    expect(md).toContain('2026-08-21');
  });

  it('Markdown 不含真实身份信息与结论性表述', async () => {
    const result = await new MockAnalysisProvider().analyze({
      meta: { schoolName: '某中学', cohort: '2026级' },
      students: [sampleStudent],
    } satisfies AnalysisRequest);
    const md = reportToMarkdown(generateReport(result, { schoolName: '某中学', cohort: '2026级' }, new Date('2026-08-21T10:00:00')));
    expect(md).not.toMatch(/1[3-9]\d{9}/);
    expect(md).not.toMatch(/\d{17}[\dXx]/);
    expect(md).not.toContain('建议通过');
    expect(md).not.toContain('建议淘汰');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/report.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现 src/report/types.ts**

```ts
import type { SchoolOverview, StudentInterviewGuide } from '../analysis/provider';

export interface Report {
  title: string;
  schoolName: string;
  cohort: string;
  generatedAt: string; // YYYY-MM-DD HH:mm
  overview: SchoolOverview;
  studentGuides: StudentInterviewGuide[];
}
```

- [ ] **Step 4: 实现 src/report/general-guide.ts**

```ts
/** 通用面谈指南（需求第七节固化内容，作为报告附录） */
export interface GuideSection {
  section: string;
  items: string[];
}

export const GENERAL_GUIDE: GuideSection[] = [
  {
    section: '家庭情况（必问）',
    items: [
      '请问你是基于什么原因申请珍珠生呢？',
      '请你介绍一下你的家庭情况，有没有兄弟姐妹，分别是什么工作，收入如何？',
      '家中是否有老人赡养，身体状况如何？',
      '家里住房类型是什么？自建房、商品房还是租房？住房大小、居住年份如何？',
      '除了家里的老房子，你们有没有其他房子在居住？',
    ],
  },
  {
    section: '学校状况',
    items: [
      '是否住校；如果租房：为什么租房、租金多少、谁陪读。',
      '多久返家一次，交通工具是什么，返家时间多长，交通成本多少。',
      '补助款发放情况；学费、宿费免除情况。',
      '学校是否进行过家访。',
    ],
  },
  {
    section: '项目了解',
    items: [
      '如何了解到捡回珍珠计划。',
      '为什么申请。',
      '对捡回珍珠计划了解多少。',
    ],
  },
  {
    section: '其他关怀',
    items: [
      '班级任职情况。',
      '与老师、同学的相处情况。',
      '学习状态。',
      '生活处境；每周/月生活成本。',
      '未来理想、选科、大学规划。',
    ],
  },
];
```

- [ ] **Step 5: 实现 src/report/generator.ts**

```ts
import type { AnalysisResult } from '../analysis/provider';
import type { Report } from './types';

/** 报告生成：仅在内存中组装（不上传、不落盘、不自动保存） */
export function generateReport(
  result: AnalysisResult,
  meta: { schoolName: string; cohort: string },
  now: Date,
): Report {
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    title: '走访参考报告',
    schoolName: meta.schoolName,
    cohort: meta.cohort,
    generatedAt: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
    overview: result.school,
    studentGuides: result.students,
  };
}
```

- [ ] **Step 6: 实现 src/report/markdown.ts**

```ts
import { GENERAL_GUIDE } from './general-guide';
import type { Report } from './types';

/** 报告 → Markdown 文本（纯函数、确定性；不含日期随机量） */
export function reportToMarkdown(report: Report): string {
  const lines: string[] = [];
  const o = report.overview;

  lines.push(`# 走访参考报告 — ${report.schoolName}（${report.cohort}）`);
  lines.push('');
  lines.push(`> 生成时间：${report.generatedAt}`);
  lines.push('> 说明：本报告基于脱敏后的申请材料由规则引擎生成，仅供走访参考，不构成任何资助结论。');
  lines.push('');

  lines.push('## 一、学校整体情况');
  lines.push('');
  lines.push(`本校共 **${o.studentCount}** 名候选学生。`);
  lines.push('');
  lines.push('### 1. 困难类型分布');
  lines.push('');
  for (const [k, v] of Object.entries(o.difficultyDistribution)) {
    lines.push(`- ${k}：${v} 人`);
  }
  if (Object.keys(o.difficultyDistribution).length === 0) lines.push('- 材料中未填写困难度，且未识别出明显困难类型。');
  lines.push('');
  lines.push('### 2. 低收入家庭');
  lines.push('');
  lines.push(`低收入家庭（人均年收入低于参考线）：${o.lowIncomeCount} 人，占比 ${(o.lowIncomeRatio * 100).toFixed(1)}%。`);
  lines.push('');
  lines.push('### 3. 重大疾病家庭');
  lines.push('');
  lines.push(`${o.majorIllnessCount} 个家庭在材料中提及家人疾病/治疗情况。`);
  lines.push('');
  lines.push('### 4. 单亲/弱劳动能力家庭');
  lines.push('');
  lines.push(`${o.singleParentOrWeakLaborCount} 个家庭。`);
  lines.push('');
  lines.push('### 5. 高负债家庭');
  lines.push('');
  lines.push(`${o.highDebtCount} 个家庭。`);
  lines.push('');
  lines.push('### 6. 住房情况');
  lines.push('');
  lines.push(`租房家庭：${o.rentalCount} 个。`);
  lines.push('');
  lines.push('### 7. 远距离通学');
  lines.push('');
  lines.push(`距校超过 5 公里的学生：${o.longDistanceCount} 人。`);
  lines.push('');
  lines.push('### 8. 材料信息完整度');
  lines.push('');
  lines.push(`平均缺失字段：${o.completeness.averageMissing.toFixed(1)} / ${o.completeness.totalFields}。`);
  lines.push('');
  lines.push('### 9. 值得重点关注的学生');
  lines.push('');
  if (o.focusStudentIds.length > 0) {
    lines.push(`共 ${o.focusStudentIds.length} 名（困难因素较多）：${o.focusStudentIds.join('、')}`);
  } else {
    lines.push('暂无。');
  }
  lines.push('');
  lines.push('### 10. 整体面谈建议');
  lines.push('');
  for (const s of o.suggestions) lines.push(`- ${s}`);
  lines.push('');

  lines.push('## 二、单个学生面谈参考');
  lines.push('');
  for (const g of report.studentGuides) {
    lines.push(`### ${g.anonymousId}`);
    lines.push('');
    lines.push('#### 1. 基本情况');
    lines.push('');
    for (const kv of g.basicInfo) lines.push(`- ${kv.label}：${kv.value}`);
    lines.push('');
    lines.push('#### 2. 申请原因概括');
    lines.push('');
    lines.push(g.reasonSummary);
    lines.push('');
    lines.push('#### 3. 家庭情况概括');
    lines.push('');
    lines.push(g.familySummary);
    lines.push('');
    lines.push('#### 4. 主要困难因素');
    lines.push('');
    for (const f of g.difficultyFactors) lines.push(`- ${f.label}（${f.evidence}）`);
    if (g.difficultyFactors.length === 0) lines.push('- 材料中未识别出明显困难因素。');
    lines.push('');
    lines.push('#### 5. 需要重点核实');
    lines.push('');
    for (const v of g.verificationPoints) lines.push(`- ${v}`);
    if (g.verificationPoints.length === 0) lines.push('- 暂未发现明显需要核实的事项。');
    lines.push('');
    lines.push('#### 6. 推荐面谈问题');
    lines.push('');
    g.suggestedQuestions.forEach((q, i) => lines.push(`${i + 1}. ${q}`));
    lines.push('');
    lines.push('#### 7. 面谈注意事项');
    lines.push('');
    for (const c of g.cautions) lines.push(`- ${c}`);
    if (g.cautions.length === 0) lines.push('- 无特殊注意事项。');
    lines.push('');
  }

  lines.push('## 三、通用面谈指南');
  lines.push('');
  for (const section of GENERAL_GUIDE) {
    lines.push(`### ${section.section}`);
    lines.push('');
    for (const item of section.items) lines.push(`- ${item}`);
    lines.push('');
  }

  return lines.join('\n');
}
```

- [ ] **Step 7: 实现 src/utils/field-labels.ts 与 src/utils/download.ts**

src/utils/field-labels.ts:
```ts
import type { FieldAction } from '../types/student';

/** 策略中文标签（UI 展示用） */
export const ACTION_LABELS: Record<FieldAction['action'], string> = {
  keep: '保留',
  scrub: '保留（文本清洗）',
  generalize: '泛化',
  drop: '不发送',
};

export const DROP_REASON_LABELS: Record<string, string> = {
  identity: '身份信息',
  'third-party': '第三方姓名',
  internal: '内部字段',
  unknown: '未知字段',
};

/** 匿名学生字段中文标签（预览与报告用） */
export const STUDENT_FIELD_LABELS: Record<string, string> = {
  anonymousId: '匿名编号',
  gender: '性别', ethnicity: '民族', householdType: '户口', height: '身高',
  weight: '体重', healthStatus: '健康情况', difficultyLevel: '困难度',
  enrollmentStatus: '就读状态', province: '住址省', city: '州市', county: '县区',
  ancestralHome: '籍贯', distanceToSchoolKm: '距校路程(公里)', zhongkaoFullScore: '中考满分',
  zhongkaoScore: '中考成绩', admissionRankBand: '年级排名（区间）', gradeSize: '全年级人数',
  familySituation: '家庭情况', visitMethod: '家访方式', visitSummary: '家访总结',
  awardsAndInterests: '获奖经历及兴趣爱好', applicationReason: '申请理由',
  approvalComment: '审批意见', housingStatus: '住房状况', transportation: '交通工具',
  annualIncome: '年收入(元)', annualIncomeNote: '年收入说明', perCapitaIncome: '人均年收入(元)',
  schoolChildrenCount: '上学子女人数', difficultyReason: '困难原因',
  elderlySupportStatus: '需赡养老人情况', elderlySupportNote: '需赡养老人情况说明',
  debtStatus: '负债情况', debtNote: '负债情况说明',
};
```

src/utils/download.ts:
```ts
/** 下载文本文件（仅本地 Blob，不上传） */
export function downloadTextFile(filename: string, content: string, mime = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 8: 运行确认通过**

Run: `npx vitest run tests/report.test.ts`
Expected: PASS — 3 个用例全部通过。

- [ ] **Step 9: Commit**

```bash
git add src/report/ src/utils/field-labels.ts src/utils/download.ts tests/report.test.ts
git commit -m "feat: 报告生成、Markdown 序列化与下载工具"
```

---

## Task 12: 使用统计接口（内存实现）

**Files:**
- Create: `src/stats/usage-stats.ts`
- Test: `tests/usage-stats.test.ts`

- [ ] **Step 1: 写失败测试 tests/usage-stats.test.ts**

```ts
import { describe, it, expect } from 'vitest';
import { InMemoryUsageStats } from '../src/stats/usage-stats';

describe('InMemoryUsageStats', () => {
  it('计数事件与学生人数总和', () => {
    const stats = new InMemoryUsageStats();
    stats.record('imported', { studentCount: 32 });
    stats.record('imported', { studentCount: 45 });
    stats.record('analysisCompleted');
    expect(stats.getSnapshot()).toEqual({ imports: 2, analyses: 1, totalStudents: 77 });
  });

  it('快照只含白名单计数（绝不包含学生数据）', () => {
    const stats = new InMemoryUsageStats();
    stats.record('imported', { studentCount: 1 });
    const snap = stats.getSnapshot();
    expect(Object.keys(snap).sort()).toEqual(['analyses', 'imports', 'totalStudents']);
    expect(JSON.stringify(snap)).not.toContain('学生');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/usage-stats.test.ts`
Expected: FAIL — 模块不存在。

- [ ] **Step 3: 实现 src/stats/usage-stats.ts**

```ts
/** 统计白名单事件：只允许计数，绝不包含任何学生数据 */
export type UsageEvent = 'imported' | 'analysisCompleted';

export interface UsageSnapshot {
  imports: number;
  analyses: number;
  totalStudents: number; // 学生人数总和（平均人数由此推导）
}

export interface UsageStats {
  record(event: UsageEvent, meta?: { studentCount?: number }): void;
  getSnapshot(): UsageSnapshot;
}

/**
 * 内存实现：不持久化、不上报。
 * 未来如需上报，只能上报 UsageSnapshot 中的白名单计数。
 */
export class InMemoryUsageStats implements UsageStats {
  private imports = 0;
  private analyses = 0;
  private totalStudents = 0;

  record(event: UsageEvent, meta?: { studentCount?: number }): void {
    if (event === 'imported') {
      this.imports += 1;
      this.totalStudents += meta?.studentCount ?? 0;
    } else if (event === 'analysisCompleted') {
      this.analyses += 1;
    }
  }

  getSnapshot(): UsageSnapshot {
    return { imports: this.imports, analyses: this.analyses, totalStudents: this.totalStudents };
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/usage-stats.test.ts`
Expected: PASS — 2 个用例全部通过。

- [ ] **Step 5: Commit**

```bash
git add src/stats/usage-stats.ts tests/usage-stats.test.ts
git commit -m "feat: 使用统计接口与内存实现（仅白名单计数）"
```

---

## Task 13: 流水线状态机与静态安全守卫测试

**Files:**
- Create: `src/state/pipeline.ts`
- Test: `tests/pipeline.test.ts`, `tests/no-persistence.test.ts`

- [ ] **Step 1: 写失败测试 tests/pipeline.test.ts**

```ts
import { describe, it, expect } from 'vitest';
import { pipelineReducer } from '../src/state/pipeline';
import type { ParsedState, PipelineState } from '../src/types/pipeline';
import type { AnonymizationOutput, AnonymizedStudent } from '../src/types/student';

const parsed: ParsedState = {
  schoolName: '某中学', cohort: '2026级', sheetName: '高中段珍珠生信息',
  rowCount: 1, fieldCount: 60, headerRowIndex: 2, mappedColumns: [],
};

const output: AnonymizationOutput = {
  students: [], nameIndex: new Map(),
  stats: { rawStudentCount: 1, rawFieldCount: 60, sensitiveFieldCount: 10, droppedFieldCount: 24, generalizedFieldCount: 1, sentFieldCount: 35 },
};

const scan = { passed: true, findings: [] };
const result = { school: { studentCount: 0, difficultyDistribution: {}, lowIncomeCount: 0, lowIncomeRatio: 0, majorIllnessCount: 0, singleParentOrWeakLaborCount: 0, highDebtCount: 0, rentalCount: 0, longDistanceCount: 0, completeness: { totalFields: 31, perStudent: [], averageMissing: 0 }, focusStudentIds: [], suggestions: [] }, students: [] };
const report = { title: '走访参考报告', schoolName: '某中学', cohort: '2026级', generatedAt: '2026-08-21 10:00', overview: result.school, studentGuides: [] };

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
    expect(pipelineReducer(idle, { type: 'ANONYMIZE_SUCCEEDED', output }).stage).toBe('idle');
    expect(pipelineReducer(idle, { type: 'ANALYSIS_SUCCEEDED', output, scan, result, report }).stage).toBe('idle');
  });

  it('RESET 任意阶段回到 idle', () => {
    const analyzed: PipelineState = { stage: 'analyzed', output, scan, result, report };
    expect(pipelineReducer(analyzed, { type: 'RESET' }).stage).toBe('idle');
  });
});
```

- [ ] **Step 2: 写失败测试 tests/no-persistence.test.ts（安全红线静态守卫）**

```ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** 收集 src/ 下所有 .ts/.tsx 源码 */
function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...collectSourceFiles(p));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(p);
  }
  return out;
}

const FORBIDDEN_TOKENS = [
  'localStorage', 'sessionStorage', 'indexedDB', 'document.cookie',
  'fetch(', 'axios', 'XMLHttpRequest', 'sendBeacon', 'console.log',
];

describe('隐私红线静态守卫', () => {
  it('src 源码中不出现持久化/网络上传/日志输出 API', () => {
    const files = collectSourceFiles(join(process.cwd(), 'src'));
    expect(files.length).toBeGreaterThan(0);
    const hits: string[] = [];
    for (const f of files) {
      const content = readFileSync(f, 'utf8');
      for (const token of FORBIDDEN_TOKENS) {
        if (content.includes(token)) hits.push(`${f}: ${token}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `npx vitest run tests/pipeline.test.ts tests/no-persistence.test.ts`
Expected: FAIL — `src/state/pipeline.ts` 模块不存在（no-persistence 用例通过——目前 src 中确实没有禁用 API）。

- [ ] **Step 4: 实现 src/state/pipeline.ts**

```ts
import type { AnonymizationOutput } from '../types/student';
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
    case 'RESET':
      return { stage: 'idle' };
  }
}
```

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run tests/pipeline.test.ts tests/no-persistence.test.ts`
Expected: PASS — 4 个用例全部通过。

- [ ] **Step 6: Commit**

```bash
git add src/state/pipeline.ts tests/pipeline.test.ts tests/no-persistence.test.ts
git commit -m "feat: 流水线状态机与隐私红线静态守卫测试"
```

---

## Task 14: UI 组件与 App 组装

**Files:**
- Create: `src/components/Stepper.tsx`, `src/components/ImportStep.tsx`, `src/components/MappingStep.tsx`, `src/components/AnonymizeStep.tsx`, `src/components/PreviewStep.tsx`, `src/components/SecurityStep.tsx`, `src/components/ReportStep.tsx`, `src/components/ui/Card.tsx`, `src/components/ui/Button.tsx`, `src/components/ui/Badge.tsx`, `src/components/ui/StatCard.tsx`, `src/components/ui/CheckItem.tsx`
- Modify: `src/App.tsx`

说明：组件为薄展示层（props 驱动），逻辑全部在已测试模块中；本任务无组件单测，验证方式为 `npm run build` + 手工走查清单（Task 15）。

- [ ] **Step 1: 实现 src/components/ui/Card.tsx**

```tsx
import type { ReactNode } from 'react';

export default function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-slate-200 bg-white p-6 shadow-sm ${className}`}>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: 实现 src/components/ui/Button.tsx**

```tsx
import type { ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const STYLES: Record<Variant, string> = {
  primary: 'bg-emerald-700 text-white hover:bg-emerald-800 disabled:bg-slate-300',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 disabled:text-slate-400',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  ghost: 'text-slate-600 hover:text-slate-900',
};

export default function Button({
  children, onClick, variant = 'primary', disabled = false, type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: Variant;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${STYLES[variant]}`}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 3: 实现 src/components/ui/Badge.tsx**

```tsx
const TONES: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  red: 'bg-red-50 text-red-800 border-red-200',
  amber: 'bg-amber-50 text-amber-800 border-amber-200',
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
  blue: 'bg-sky-50 text-sky-800 border-sky-200',
};

export default function Badge({ tone = 'slate', children }: { tone?: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${TONES[tone] ?? TONES.slate}`}>
      {children}
    </span>
  );
}
```

- [ ] **Step 4: 实现 src/components/ui/StatCard.tsx**

```tsx
export default function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 text-center shadow-sm">
      <div className="text-2xl font-semibold text-slate-800">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{label}</div>
    </div>
  );
}
```

- [ ] **Step 5: 实现 src/components/ui/CheckItem.tsx**

```tsx
export default function CheckItem({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <li className="flex items-start gap-2 py-1.5">
      <span className={`mt-0.5 ${ok ? 'text-emerald-600' : 'text-red-600'}`}>{ok ? '✓' : '✗'}</span>
      <div>
        <span className="text-sm text-slate-700">{label}</span>
        {!ok && detail && <div className="mt-0.5 text-xs text-red-600">{detail}</div>}
      </div>
    </li>
  );
}
```

- [ ] **Step 6: 实现 src/components/Stepper.tsx**

```tsx
const STEPS = ['导入Excel', '字段映射', '本地脱敏', '匿名预览', '安全检查', 'AI分析报告'];

export default function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm">
      {STEPS.map((label, i) => {
        const idx = i + 1;
        const state = idx < current ? 'done' : idx === current ? 'active' : 'todo';
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                state === 'done'
                  ? 'bg-emerald-600 text-white'
                  : state === 'active'
                    ? 'bg-emerald-700 text-white ring-2 ring-emerald-200'
                    : 'bg-slate-200 text-slate-500'
              }`}
            >
              {state === 'done' ? '✓' : idx}
            </span>
            <span className={state === 'todo' ? 'text-slate-400' : 'text-slate-700'}>{label}</span>
            {idx < STEPS.length - 1 && <span className="text-slate-300">—</span>}
          </li>
        );
      })}
    </ol>
  );
}
```

- [ ] **Step 7: 实现 src/components/ImportStep.tsx**

```tsx
import { useRef, useState, type DragEvent } from 'react';
import Card from './ui/Card';

export default function ImportStep({
  onFile, error,
}: {
  onFile: (buffer: ArrayBuffer) => void;
  error?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const readFile = async (file: File) => {
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      alert('请选择 .xlsx 或 .xls 文件');
      return;
    }
    const buffer = await file.arrayBuffer();
    onFile(buffer);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void readFile(file);
  };

  return (
    <Card>
      <h1 className="text-xl font-semibold text-slate-800">珍珠生走访智能面谈辅助工具</h1>
      <p className="mt-2 text-sm text-slate-500">
        隐私优先：Excel 仅在当前浏览器本地处理，原始学生信息不会上传到任何服务器。
      </p>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`mt-6 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-10 transition-colors ${
          dragging ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'
        }`}
      >
        <p className="text-sm text-slate-600">点击选择，或将 Excel 拖拽到此处</p>
        <p className="mt-1 text-xs text-slate-400">支持 .xlsx / .xls（如「2026级珍珠生候选申请名单.xlsx」）</p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void readFile(file);
            e.target.value = '';
          }}
        />
      </div>
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      <div className="mt-6 text-xs text-slate-500">
        <p className="font-medium">使用步骤</p>
        <ol className="mt-1 list-decimal pl-4 leading-6">
          <li>导入Excel</li><li>本地脱敏</li><li>安全检查</li><li>AI分析</li><li>查看报告</li><li>下载报告</li>
        </ol>
      </div>
    </Card>
  );
}
```

注意：本文件中的 `alert` 仅用于文件格式错误提示，不涉及学生数据。

- [ ] **Step 8: 实现 src/components/MappingStep.tsx**

```tsx
import type { ParsedState } from '../types/pipeline';
import { ACTION_LABELS, DROP_REASON_LABELS } from '../utils/field-labels';
import Card from './ui/Card';
import Badge from './ui/Badge';
import Button from './ui/Button';

const TONE: Record<string, string> = {
  keep: 'green', scrub: 'blue', generalize: 'amber', drop: 'slate',
};

export default function MappingStep({ state, onAnonymize }: { state: ParsedState; onAnonymize: () => void }) {
  return (
    <Card>
      <h2 className="text-lg font-semibold text-slate-800">字段映射预览</h2>
      <p className="mt-1 text-sm text-slate-500">
        识别到表头位于第 {state.headerRowIndex} 行。共 {state.rowCount} 名学生、
        {state.fieldCount} 个字段。以下分类仅决定「哪些信息发送给 AI」，原始数据不会被修改或上传。
      </p>
      <div className="mt-4 max-h-96 overflow-auto rounded border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2">字段名</th>
              <th className="px-3 py-2">处理方式</th>
              <th className="px-3 py-2">说明</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {state.mappedColumns.map((c) => (
              <tr key={c.header}>
                <td className="px-3 py-1.5">{c.header}</td>
                <td className="px-3 py-1.5">
                  <Badge tone={TONE[c.action.action] ?? 'slate'}>
                    {c.action.action === 'drop'
                      ? `${ACTION_LABELS.drop}（${DROP_REASON_LABELS[c.action.reason] ?? '未知'}）`
                      : ACTION_LABELS[c.action.action]}
                  </Badge>
                </td>
                <td className="px-3 py-1.5 text-xs text-slate-500">
                  {c.action.action === 'keep' && '原样发送给 AI'}
                  {c.action.action === 'scrub' && '发送前清除文本中内嵌的姓名/电话/地址'}
                  {c.action.action === 'generalize' && '全校排名 → 比例区间（降低识别风险）'}
                  {c.action.action === 'drop' && '不会发送给 AI'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4">
        <Button onClick={onAnonymize}>开始本地脱敏</Button>
      </div>
    </Card>
  );
}
```

- [ ] **Step 9: 实现 src/components/AnonymizeStep.tsx**

```tsx
import type { AnonymizationOutput } from '../types/student';
import Card from './ui/Card';
import StatCard from './ui/StatCard';
import Button from './ui/Button';

export default function AnonymizeStep({
  output, onNext,
}: {
  output: AnonymizationOutput;
  onNext: () => void;
}) {
  const s = output.stats;
  const checks = [
    '原始姓名未发送', '身份证号未发送', '联系方式未发送', '详细地址未发送',
  ];
  return (
    <Card>
      <h2 className="text-lg font-semibold text-slate-800">本地脱敏完成</h2>
      <p className="mt-1 text-sm text-slate-500">
        脱敏仅在当前浏览器内完成。以下为最终发送给 AI 的数据口径统计：
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="原始学生数" value={s.rawStudentCount} />
        <StatCard label="原始字段数" value={s.rawFieldCount} />
        <StatCard label="敏感字段数" value={s.sensitiveFieldCount} />
        <StatCard label="已删除字段数" value={s.droppedFieldCount} />
        <StatCard label="已泛化字段数" value={s.generalizedFieldCount} />
        <StatCard label="最终发送字段数" value={s.sentFieldCount} />
      </div>
      <ul className="mt-4 space-y-1">
        {checks.map((c) => (
          <li key={c} className="flex items-center gap-2 text-sm text-emerald-700">
            <span>✓</span> {c}
          </li>
        ))}
      </ul>
      <div className="mt-4">
        <Button onClick={onNext}>查看匿名数据预览</Button>
      </div>
    </Card>
  );
}
```

- [ ] **Step 10: 实现 src/components/PreviewStep.tsx**

```tsx
import { useState } from 'react';
import type { AnonymizationOutput, AnonymizedStudent } from '../types/student';
import { STUDENT_FIELD_LABELS } from '../utils/field-labels';
import Card from './ui/Card';
import Button from './ui/Button';

const ROW_COLUMNS: (keyof AnonymizedStudent)[] = [
  'anonymousId', 'gender', 'householdType', 'difficultyLevel', 'annualIncome',
  'perCapitaIncome', 'housingStatus', 'debtStatus',
];

export default function PreviewStep({
  output, onNext,
}: {
  output: AnonymizationOutput;
  onNext: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const { students } = output;

  return (
    <Card>
      <h2 className="text-lg font-semibold text-slate-800">匿名数据预览（将发送给 AI）</h2>
      <p className="mt-1 text-sm text-slate-500">
        学生统一显示为匿名编号，不显示真实姓名。点击「展开」查看单个学生的全部分析数据。
      </p>
      <div className="mt-4 max-h-96 overflow-auto rounded border border-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-slate-50 text-slate-600">
            <tr>
              {ROW_COLUMNS.map((k) => <th key={k} className="px-3 py-2">{STUDENT_FIELD_LABELS[k]}</th>)}
              <th className="px-3 py-2">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {students.map((s) => (
              <FragmentRow
                key={s.anonymousId}
                student={s}
                expanded={expanded === s.anonymousId}
                onToggle={() => setExpanded(expanded === s.anonymousId ? null : s.anonymousId)}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4">
        <Button onClick={onNext}>进入安全检查</Button>
      </div>
    </Card>
  );
}

function FragmentRow({ student, expanded, onToggle }: {
  student: AnonymizedStudent;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="align-top">
        {ROW_COLUMNS.map((k) => (
          <td key={k} className="px-3 py-1.5 text-slate-700">
            {student[k] == null || student[k] === '' ? '—' : String(student[k])}
          </td>
        ))}
        <td className="px-3 py-1.5">
          <button type="button" onClick={onToggle} className="text-xs text-emerald-700 hover:underline">
            {expanded ? '收起' : '展开'}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50">
          <td colSpan={ROW_COLUMNS.length + 1} className="px-4 py-3">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
              {Object.entries(STUDENT_FIELD_LABELS)
                .filter(([k]) => k !== 'anonymousId')
                .map(([k, label]) => {
                  const v = (student as unknown as Record<string, unknown>)[k];
                  return (
                    <div key={k} className="flex gap-2 text-xs">
                      <dt className="w-28 shrink-0 text-slate-500">{label}</dt>
                      <dd className="text-slate-700">{v == null || v === '' ? '—' : String(v)}</dd>
                    </div>
                  );
                })}
            </dl>
          </td>
        </tr>
      )}
    </>
  );
}
```

- [ ] **Step 11: 实现 src/components/SecurityStep.tsx**

```tsx
import type { SecurityScanResult } from '../security/scanner';
import type { AnonymizationOutput } from '../types/student';
import Card from './ui/Card';
import Button from './ui/Button';
import CheckItem from './ui/CheckItem';

const CHECK_LABELS = [
  { key: 'id-card', label: '身份证号' },
  { key: 'mobile', label: '手机号' },
  { key: 'name-blacklist', label: '姓名' },
  { key: 'name', label: '姓名模式' },
  { key: 'email', label: '邮箱' },
  { key: 'wechat', label: '微信' },
  { key: 'qq', label: 'QQ' },
  { key: 'address', label: '详细地址' },
  { key: 'pearl-id', label: '珍珠号' },
  { key: 'forbidden-field', label: '其他高风险个人身份信息' },
];

export default function SecurityStep({
  output, scan, onScan, onAnalyze, analyzing, error,
}: {
  output: AnonymizationOutput;
  scan: SecurityScanResult | null;
  onScan: () => void;
  onAnalyze: () => void;
  analyzing: boolean;
  error?: string;
}) {
  const hitKeys = new Set(scan?.findings.map((f) => f.category) ?? []);

  return (
    <Card>
      <h2 className="text-lg font-semibold text-slate-800">AI 发送前安全检查</h2>
      <p className="mt-1 text-sm text-slate-500">
        在调用 AI 之前，对最终发送数据（共 {output.students.length} 名学生的匿名数据）再做一次敏感信息扫描。
        如发现疑似敏感信息将阻止发送，且不允许绕过。
      </p>

      <div className="mt-4">
        {!scan ? (
          <Button onClick={onScan}>运行安全检查</Button>
        ) : scan.passed ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-medium text-emerald-800">✓ 未发现禁止发送的个人身份信息</p>
            <ul className="mt-3 space-y-1">
              {CHECK_LABELS.map((c) => (
                <CheckItem key={c.key} label={c.label} ok />
              ))}
            </ul>
            <div className="mt-4">
              <Button onClick={onAnalyze} disabled={analyzing}>
                {analyzing ? 'AI 分析中…' : '开始 AI 分析'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-medium text-red-800">
              ✗ 发现疑似敏感信息，已阻止发送。请重新导入并检查源文件后重试。
            </p>
            <ul className="mt-3 space-y-1">
              {CHECK_LABELS.map((c) => (
                <CheckItem
                  key={c.key}
                  label={c.label}
                  ok={!hitKeys.has(c.key)}
                  detail={
                    hitKeys.has(c.key)
                      ? scan.findings
                          .filter((f) => f.category === c.key)
                          .map((f) => `${f.field}: ${f.snippet}`)
                          .join('；')
                      : undefined
                  }
                />
              ))}
            </ul>
          </div>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    </Card>
  );
}
```

- [ ] **Step 12: 实现 src/components/ReportStep.tsx**

```tsx
import { useMemo, useState } from 'react';
import type { Report } from '../report/types';
import { reportToMarkdown } from '../report/markdown';
import { downloadTextFile } from '../utils/download';
import Card from './ui/Card';
import Button from './ui/Button';
import Badge from './ui/Badge';

export default function ReportStep({
  report, nameIndex, onReset,
}: {
  report: Report;
  nameIndex: Map<string, string>;
  onReset: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  // 本地姓名查找：仅内存匹配（anonymousId ↔ 姓名），绝不发送、绝不展示在报告数据中
  const matches = useMemo(() => {
    const q = query.trim();
    if (q === '') return [];
    const hits: { anonymousId: string; name: string }[] = [];
    for (const [id, name] of nameIndex.entries()) {
      if (name.includes(q)) hits.push({ anonymousId: id, name });
    }
    return hits.slice(0, 10);
  }, [query, nameIndex]);

  const download = () => {
    const md = reportToMarkdown(report);
    const date = report.generatedAt.slice(0, 10);
    downloadTextFile(`走访参考报告-${report.schoolName}-${date}.md`, md, 'text/markdown;charset=utf-8');
  };

  const o = report.overview;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              走访参考报告 — {report.schoolName}（{report.cohort}）
            </h2>
            <p className="mt-1 text-xs text-slate-500">生成时间：{report.generatedAt} · 仅存于当前页面内存</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={download}>下载走访参考报告（Markdown）</Button>
            <Button variant="secondary" onClick={onReset}>重新开始</Button>
          </div>
        </div>
        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
          本报告基于脱敏后的申请材料生成，仅供走访参考，不构成任何资助结论。
          最终资格判断由工作人员根据申请材料、现场面谈与学校情况综合决定。
        </div>
        {/* 本地查找：输入姓名（仅本机内存匹配）定位到匿名编号 */}
        <div className="mt-4">
          <label className="text-sm text-slate-600">面谈时快速定位学生（本地查找，姓名仅在本机匹配）：</label>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="输入学生姓名的一部分…"
            className="mt-1 w-full max-w-sm rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
          {matches.length > 0 && (
            <ul className="mt-2 space-y-1">
              {matches.map((m) => (
                <li key={m.anonymousId}>
                  <button
                    type="button"
                    onClick={() => setOpen(m.anonymousId)}
                    className="text-sm text-emerald-700 hover:underline"
                  >
                    {m.anonymousId}（{m.name}）
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card>
        <h3 className="text-base font-semibold text-slate-800">一、学校整体情况</h3>
        <p className="mt-2 text-sm text-slate-700">本校共 {o.studentCount} 名候选学生。</p>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {[
            ['低收入家庭', `${o.lowIncomeCount} 人（${(o.lowIncomeRatio * 100).toFixed(1)}%）`],
            ['重大疾病家庭', `${o.majorIllnessCount} 个`],
            ['单亲/弱劳动能力家庭', `${o.singleParentOrWeakLaborCount} 个`],
            ['高负债家庭', `${o.highDebtCount} 个`],
            ['租房家庭', `${o.rentalCount} 个`],
            ['远距通学（>5km）', `${o.longDistanceCount} 人`],
            ['值得重点关注', `${o.focusStudentIds.length} 名`],
            ['材料平均缺失字段', `${o.completeness.averageMissing.toFixed(1)} / ${o.completeness.totalFields}`],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between border-b border-slate-100 pb-1">
              <dt className="text-slate-500">{label}</dt>
              <dd className="font-medium text-slate-800">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-3">
          <p className="text-xs font-medium text-slate-500">困难类型分布</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {Object.entries(o.difficultyDistribution).map(([k, v]) => (
              <Badge key={k} tone="slate">{k}：{v} 人</Badge>
            ))}
            {Object.keys(o.difficultyDistribution).length === 0 && <span className="text-xs text-slate-400">未识别</span>}
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="text-base font-semibold text-slate-800">二、单个学生面谈参考</h3>
        <div className="mt-3 space-y-2">
          {report.studentGuides.map((g) => (
            <div key={g.anonymousId} className="rounded border border-slate-200">
              <button
                type="button"
                onClick={() => setOpen(open === g.anonymousId ? null : g.anonymousId)}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <span>{g.anonymousId}</span>
                <span className="text-xs text-slate-400">{open === g.anonymousId ? '收起' : '展开'}</span>
              </button>
              {open === g.anonymousId && (
                <div className="space-y-3 border-t border-slate-100 px-4 py-3 text-sm">
                  <section>
                    <h4 className="font-medium text-slate-700">基本情况</h4>
                    <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                      {g.basicInfo.map((kv) => <li key={kv.label}>· {kv.label}：{kv.value}</li>)}
                    </ul>
                  </section>
                  <section>
                    <h4 className="font-medium text-slate-700">申请原因概括</h4>
                    <p className="mt-1 text-xs text-slate-600">{g.reasonSummary}</p>
                  </section>
                  <section>
                    <h4 className="font-medium text-slate-700">家庭情况概括</h4>
                    <p className="mt-1 text-xs text-slate-600">{g.familySummary}</p>
                  </section>
                  <section>
                    <h4 className="font-medium text-slate-700">主要困难因素</h4>
                    <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                      {g.difficultyFactors.map((f) => <li key={f.label}>· {f.label}：{f.evidence}</li>)}
                    </ul>
                  </section>
                  <section>
                    <h4 className="font-medium text-slate-700">需要重点核实</h4>
                    <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                      {g.verificationPoints.map((v) => <li key={v}>· {v}</li>)}
                    </ul>
                  </section>
                  <section>
                    <h4 className="font-medium text-slate-700">推荐面谈问题</h4>
                    <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs text-slate-600">
                      {g.suggestedQuestions.map((q) => <li key={q}>{q}</li>)}
                    </ol>
                  </section>
                  <section>
                    <h4 className="font-medium text-slate-700">面谈注意事项</h4>
                    <ul className="mt-1 space-y-0.5 text-xs text-amber-700">
                      {g.cautions.map((c) => <li key={c}>· {c}</li>)}
                    </ul>
                  </section>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
```

- [ ] **Step 13: 重写 src/App.tsx**

```tsx
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
import type { CellValue, RawStudentRecord } from './types/student';
import type { ParsedState } from './types/pipeline';
import Stepper from './components/Stepper';
import ImportStep from './components/ImportStep';
import MappingStep from './components/MappingStep';
import AnonymizeStep from './components/AnonymizeStep';
import PreviewStep from './components/PreviewStep';
import SecurityStep from './components/SecurityStep';
import ReportStep from './components/ReportStep';

const usageStats = new InMemoryUsageStats();
const analysisService = new AnalysisService(new MockAnalysisProvider());

const STAGE_TO_STEP: Record<string, number> = {
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
        values: values as Record<string, CellValue>,
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
    nameBlacklistRef.current = rawStore.collectNameBlacklist();
    const output = anonymize(rawStore.snapshot(), state.mappedColumns);
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
    if (state.stage !== 'scanned' || !state.scan.passed) return;
    setAnalyzing(true);
    setAnalyzeError(undefined);
    try {
      const request = { meta: metaRef.current, students: state.output.students };
      const result = await analysisService.analyze(request, nameBlacklistRef.current);
      const report = generateReport(result, metaRef.current, new Date());
      usageStats.record('analysisCompleted', { studentCount: state.output.students.length });
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
  }, [state]);

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
            <Stepper current={STAGE_TO_STEP[state.stage] ?? 1} />
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
          <PreviewStep output={state.output} onNext={handleScan} />
        )}
        {state.stage === 'scanned' && (
          <SecurityStep
            output={state.output}
            scan={state.scan}
            onScan={handleScan}
            onAnalyze={() => void handleAnalyze()}
            analyzing={analyzing}
            error={analyzeError}
          />
        )}
        {state.stage === 'analyzed' && (
          <ReportStep report={state.report} nameIndex={state.output.nameIndex} onReset={handleReset} />
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 14: 编译验证**

Run: `npm run build`
Expected: 构建成功，无 TypeScript 错误。若 `Alert`/未使用变量报错，按 tsc 输出修正（`noUnusedLocals` 开启）。

- [ ] **Step 15: 全量测试**

Run: `npm test`
Expected: 全部 PASS。

- [ ] **Step 16: Commit**

```bash
git add src/components/ src/App.tsx
git commit -m "feat: 六步 UI 流程与 App 组装（本地姓名定位/匿名预览/安全检查/报告）"
```

---

## Task 15: 合成示例数据脚本、README 与最终验证

> **待办（前序任务质量审查遗留 Minor，本任务顺手补齐）**：
> 1. Task 6 复审 Minor：补 2 个回归测试钉死裁决——`欧阳老师` → `MASK`（复姓盲区）；`任张老师` → `任${MASK}`（伪复姓吞并），加在 tests/text-scrubber.test.ts；
> 2. Task 6 复审 Minor：`CLAUSE_SPLIT.test(seg)` 未锚定，可恢复 `^[…]$` 单字符锚定写法（split 与 test 同源正则，功能等价，锚定更稳）；
> 3. Task 6 复审记录（无需改）：「住址：南湖小区3号楼」因 `：` 成为分隔符输出「住址：[已隐藏]」——标签作为独立子句保留，符合子句级语义；
> 4. Task 5 遗留：NAME_BEARING_ALIASES 不变量仅单向；snapshot 测试中 cast 注释；「数组级副本」文档注释精度；
> 5. Task 4 遗留：`raw:false` 精度语义注释（格式化差异说明）；单 sheet 解析说明（首张表）；错误包装；LF 警告为良性。
> 6. Task 7 规格审查小观察：anonymizer.test.ts 用例 4 标题称「缺排名或年级人数时 null」但仅断言缺年级人数场景，缺排名→null 分支未被断言（实现本身正确）；顺手补缺排名断言。
> 7. Task 7 质量审查 Minor：nameIndex 防泄漏当前依赖 `JSON.stringify(Map)==='{}'` 的 JS 语义（structuredClone 会完整克隆 Map）——最终验证加一条 `JSON.stringify(output)` 不含姓名的断言钉死不变量。
> 8. Task 7 复审非阻断观察（可选加固）：setField 守卫用 `in` 运算符含原型链，理论上一行改 `Object.prototype.hasOwnProperty.call(EMPTY_STUDENT, key)` 彻底闭合（实际仅手工伪造 MappedColumn 才可达）。

**Files:**
- Create: `scripts/generate-sample-xlsx.mjs`, `README.md`

- [ ] **Step 1: 实现 scripts/generate-sample-xlsx.mjs**

```js
// 生成与真实表头结构一致的【虚构】示例数据（用于本地演示与手工验证）。
// 绝不读取真实 Excel；所有姓名/号码均为虚构。
import * as XLSX from 'xlsx';
import { writeFileSync } from 'node:fs';

const HEADERS = [
  '序号', '学校名称', '学校编号', '珍珠班名称', '珍珠班编号', '珍珠号', '珍珠生姓名',
  '资助项目名称', '出资方类型', '结对捐方', '结对要求', '资金池名称', '拨款金额', '期数',
  '困难度', '状态', '就读状态', '就读状态变更时间', '就读状态变更原因', '户口', '民族',
  '身份证号', '性别', '身高', '体重', '健康情况', '电话', 'qq', '微信', '邮箱', '籍贯',
  '住址省', '州市', '县区', '详细地址', '距离高中路程', '初中就读学校', '中考满分',
  '中考成绩', '录取高中全校排名', '全年级人数', '家庭情况', '家访方式', '家访教师姓名',
  '家访总结', '获奖经历及兴趣爱好', '申请理由', '审批意见', '审批人', '住房状况',
  '交通工具', '年收入', '年收入说明', '人均年收入', '上学子女人数', '困难原因',
  '需赡养老人情况', '需赡养老人情况说明', '负债情况', '负债情况说明',
];

const ROWS = [
  { name: '测试学生甲', gender: '女', income: 24000, perCapita: 8000, house: '租房（年租金/元）/10000以下', distance: 8, rank: 160, children: 2, elderly: '4人', debt: '5万元', reason: '母亲患心脏病无法从事重体力劳动，父亲务农收入有限，家庭负担较重。', note: null },
  { name: '测试学生乙', gender: '男', income: 50000, perCapita: 16666, house: '自建房', distance: 1.4, rank: 46, children: 1, elderly: null, debt: '无负债', reason: '学习成绩优异，希望获得资助继续求学。', note: '父母务工，收入稳定。' },
  { name: '测试学生丙', gender: '女', income: 30000, perCapita: 10000, house: '租房（年租金/元）/10000-20000', distance: 12, rank: 300, children: 3, elderly: '2人', debt: '2万元', reason: '兄弟姐妹多，都在上学，家里只有母亲一人工作。', note: null },
  { name: '测试学生丁', gender: '男', income: 18000, perCapita: 6000, house: '自建房', distance: 3, rank: 600, children: 1, elderly: '2人', debt: '无负债', reason: '父亲残疾，家庭主要靠低保和母亲打零工。', note: '电话13800138000，住址某村一组8号（验证清洗功能）。' },
];

const matrix = [
  ['高中段珍珠生信息'],
  HEADERS,
  ...ROWS.map((r, i) => [
    i + 1, '某县第一中学（虚构）', 'X-1', '班名待定', 'X-01-00', null, r.name,
    '2026级捡回珍珠计划-高中段', '资金池', null, null, '资金池A', 30000, '2026级',
    null, '复审中', null, null, null, '农村', '汉族',
    `1101012000010112${String(i).padStart(2, '0')}`, r.gender, '165cm', '50kg', '健康',
    `1390000000${i}`, null, null, null, '某省某市某县', '某省', '某市', '某县',
    null, r.distance, '某县第二初级中学（虚构）', 820, 700 - i * 10, r.rank, 923,
    '正常', '入户家访', '王老师', `家访记录：${r.note ?? '家庭情况属实。'}`,
    '喜欢读书', `申请理由：${r.reason}`, null, '李老师', r.house, '无以上类型车辆',
    r.income, r.note, r.perCapita, r.children, r.reason, r.elderly, null, r.debt, null,
  ]),
];

const ws = XLSX.utils.aoa_to_sheet(matrix);
ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, '高中段珍珠生信息');
const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
writeFileSync('examples/示例数据（虚构）.xlsx', Buffer.from(out));
console.log('已生成 examples/示例数据（虚构）.xlsx（全部为虚构数据）');
```

- [ ] **Step 2: 运行脚本并验证**

Run: `node scripts/generate-sample-xlsx.mjs`
Expected: 输出「已生成 examples/示例数据（虚构）.xlsx」。

- [ ] **Step 3: 实现 README.md**

```markdown
# 珍珠生走访智能面谈辅助工具

公益基金会内部工具：将候选珍珠生 Excel 在**本地浏览器**中完成读取、清洗、脱敏，
再将脱敏数据交由 AI（当前为本地规则引擎模拟）生成「走访参考报告」。

## 隐私承诺（最高优先级）

- 原始学生数据（姓名/身份证/电话/QQ/微信/邮箱/详细地址/教师姓名/珍珠号等）**绝不出本机**；
- Excel 文件绝不上传；不写入 localStorage / IndexedDB / Cookie / 日志；
- 发送 AI 前先脱敏，再经强制安全检查，命中即阻止且不可绕过；
- 报告仅存页面内存，刷新即失；下载后应用不保留文件；
- 本仓库 `examples/` 下的真实数据文件已被 .gitignore 排除，绝不进入版本库或测试。

## 使用

```bash
npm install
npm run dev        # 开发调试
npm run build      # 构建（tsc + vite）
npm test           # 运行全部测试
```

手工验证：`node scripts/generate-sample-xlsx.mjs` 生成虚构示例数据（examples/示例数据（虚构）.xlsx），
在首页导入后依次走完六步流程。

## 已知限制

- `xlsx`（SheetJS）npm 包为 0.18.5 版本（官方新版通过 cdn.sheetjs.com 分发），
  npm audit 会提示已知公告；本工具只读取基金会工作人员自己的 Excel，风险可接受。
- v1 为 Mock 分析（确定性规则引擎）；接入真实大模型时实现 `AnalysisProvider`
  接口并**必须经由 `AnalysisService` 发送**（安全硬闸自动生效），
  API Key 由用户输入且绝不写入源码。
```

- [ ] **Step 4: 最终全量验证**

Run: `npm test`
Expected: 全部 PASS（field-mapper 9 / excel-parser 8 / raw-store 5 / text-scrubber 9 / anonymizer 7 / scanner 8 / analysis-service 3 / mock-provider 7 / report 3 / usage-stats 2 / pipeline+no-persistence 4）。

Run: `npm run build`
Expected: 构建成功。

Run: `git status --short`
Expected: `examples/` 下文件不出现（已忽略）。

- [ ] **Step 5: 手工走查清单（交给用户确认）**

1. `npm run dev` → 打开 http://localhost:5173；
2. 导入 `examples/示例数据（虚构）.xlsx`：显示学校名称、4 名学生、60 字段；
3. 字段映射页：身份字段标红「不发送（身份信息）」，排名标「泛化」；
4. 脱敏统计：敏感字段数 11（8 身份 + 3 第三方）、已删除 26、已泛化 1、发送 34；
5. 匿名预览：student-001…；展开测试学生丁：家庭情况中的手机号与地址已显示为 `[已隐藏]`；
6. 安全检查：全部 ✓ → 「开始 AI 分析」→ 报告生成（含学生丁的疾病/负债核实点与中性问题）；
7. 报告页：本地查找输入「测试」能定位；「下载走访参考报告」生成 .md 文件；
8. 刷新页面：一切数据消失（内存数据，无残留）。

- [ ] **Step 6: Commit**

```bash
git add scripts/generate-sample-xlsx.mjs README.md
git commit -m "docs: README 与合成示例数据生成脚本"
```

---

## 完成定义（DoD）

- [ ] `npm test` 全部通过（含反向安全测试与静态守卫测试）
- [ ] `npm run build` 无错误
- [ ] 手工走查清单全部通过
- [ ] git 历史中不包含任何真实学生数据文件
