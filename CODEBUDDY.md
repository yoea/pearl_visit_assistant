# CODEBUDDY.md

给 AI 编码助手的项目上下文。**动手改代码前先读本文件，再看 `README.md`。**
面向人类同事的文档在 `README.md`（工具说明）与 `server/README.md`（部署手册）。

> 本文件替代了 Claude Code 时代的隐式约定。仓库历史文档见 `docs/superpowers/`（设计与实现计划，属 v1/v2 存档，
> **与当前代码已有偏差，只作背景参考，不要照着它改代码**）。

---

## 0. 这是什么

新华教育基金会内部工具「珍珠生走访审核辅助平台」：
候选珍珠生 Excel 在**本地浏览器**完成 读取 → 解析 → 脱敏 → 三重安全检查 → **用户手动确认** → 直连 DeepSeek 生成「走访参考报告」。

**纯前端**，没有自建后端。`server/static-server.mjs` 只做两件事：托管 `dist/` 静态页、
提供白名单计数上报接口 `/api/usage`（SQLite，`server/usage-core.mjs`），以及 `/stats` 统计页。

技术栈：Vite 7 + React 19 + TypeScript(strict) + Tailwind 4 + SheetJS(xlsx 0.18.5) + Zod + Vitest 3。
版本号 `APP_VERSION`（`src/app-config.ts`）与 `package.json.version` 需同步维护。

---

## 1. 安全红线（最高优先级，任何改动都不得破坏）

受保护的 PII：姓名 / 身份证 / 电话 / QQ / 微信 / 邮箱 / 详细地址 / 教师姓名 / 珍珠号。

1. 原始学生数据**绝不出浏览器**，Excel **绝不上传**，原始数据**不落任何持久化**。
2. 发送前必须脱敏 + 过三重安全检查，命中即阻断；**发送必须用户手动点击，绝不自动发送**。
3. AI 输出禁止出现「通过 / 淘汰」类资格结论；事实与推测分离（推测须以「推测：」标注）。
4. 提示词约束随请求发出，不得移除（`src/analysis/system-prompt.ts`）。

### 这些约束由静态守卫测试钉死：`tests/no-persistence.test.ts`

**新增文件若确实需要下列能力，必须同步更新该测试中的白名单常量，并在提交信息里说明理由。
不要删断言来「让测试变绿」。**

| 能力 | 白名单文件（相对 `src/`） |
|---|---|
| `localStorage` | `stats/token-usage-store.ts`（仅计数数字）、`stats/report-store.ts`（报告 + 匿名 ID↔姓名映射，仅本机 30 天）、`stats/usage-reporter.ts`（随机浏览器 ID） |
| `fetch(` | `analysis/analysis-client.ts`（分析请求唯一出口）、`stats/usage-reporter.ts` |
| `sendBeacon` | `stats/usage-reporter.ts` |
| `console.warn/error` | 仅 `src/analysis/` 目录，且只允许常量文案 |
| `RawStudentRecord` 类型引用 | `types/student.ts`、`anonymization/raw-store.ts`、`anonymization/anonymizer.ts`、`App.tsx` |
| `import.meta.env.VITE_DEEPSEEK_API_KEY` | 仅 `analysis/provider-factory.ts` |

全局禁止：`sessionStorage`、`indexedDB`、`document.cookie`、`axios`、`XMLHttpRequest`、`WebSocket`、`process.`、
`console.log/info/debug/trace/table/...`。

网络/真实分析模块的 import 面也被锁：`analysis-client` 只能被 `deepseek-provider` / `provider-factory` /
`analysis-service` 引用；`deepseek-provider` 只能被 `provider-factory` 引用。

`examples/` 放的是**真实学生数据 Excel**，已被 `.gitignore` 排除：绝不提交、绝不写进测试，测试只用代码构造的合成数据。
`src/data/audit-assignments.ts` 含真实审核人/走访人姓名，属**内部人员**数据（非学生），已在仓库中，
改动需谨慎，重新生成用 `node scripts/generate-audit-data.mjs`。

---

## 2. 常用命令

```bash
npm install
npm run dev        # Vite 开发服务器（默认 5173）
npm run build      # tsc --noEmit && vite build  → dist/（构建期注入 .env / .env.production）
npm test           # vitest run（当前 30 个文件 / 310 个用例，应全绿）
npx tsc --noEmit   # 单独类型检查
npx vitest run tests/xxx.test.ts   # 单文件测试

node scripts/generate-sample-xlsx.mjs   # 生成虚构示例数据到 examples/
PORT=8080 node server/static-server.mjs # 本地起静态服务（默认端口 5000，静态目录 ../dist）
```

当前基线：`tsc` 零错误、310 个用例全绿、`npm run build` 通过（2026-09-27 实测）。

---

## 3. 架构：单向安全流水线

```
导入(Excel) → 映射(字段策略) → 脱敏 → 扫描 → [用户确认] → 分析(DeepSeek) → 报告
```

依赖方向**单向，禁止反向**：`excel → anonymization → security → analysis → report`；
`components` 只依赖 `types / state / utils`；`state/pipeline.ts` 是纯 reducer，**不含原始数据**。

关键模块：

| 模块 | 职责 |
|---|---|
| `excel/excel-parser.ts` + `excel/header-detector.ts` | 前 5 行探测表头（打分 = 命中已知字段×10 + 非空数，必须 ≥1 个已知字段）；重复表头 fail-closed 抛错；提取学校名/届别 |
| `anonymization/field-policies.ts` | **字段策略单一来源**：四张别名表（身份删除 / 第三方删除 / 内部删除 / 保留或清洗）。未知字段默认不发送 |
| `anonymization/raw-store.ts` | 原始数据受控仓库（仅内存、无序列化方法）；`snapshot()` 仅脱敏流水线可用 |
| `anonymization/anonymizer.ts` | 组装 `AnonymizedStudent`；排名按比例泛化为区间；姓名→匿名 ID 的 `nameIndex` 绝不进 payload |
| `security/rules.ts` | 正则规则集**单一来源**（身份证/手机/固话/邮箱/QQ/微信/珍珠号/姓名模式/地址子句），清洗器与扫描器共用 |
| `security/scanner.ts` | 发送前硬闸：规则 + 姓名黑名单 + 禁止字段名 + 结构守卫 |
| `security/auto-clean.ts` | 扫描失败时先尝试自动剥离可清洗片段，剥不掉才红区阻断 |
| `analysis/analysis-service.ts` | **唯一发请求入口**，内嵌硬闸①；UI 无法绕过 |
| `analysis/deepseek-provider.ts` | 分批（10 人/批，并发 5）+ 拆批重试 + 学校级归纳二次汇总 |
| `analysis/payload.ts` | **唯一出站构造点**：`SENT_FIELDS` 34 字段白名单 + 编译期断言 |
| `report/` | 报告生成：Markdown / 单文件 HTML（零外部资源）/ PDF 打印 / issue CSV |
| `stats/` | token 计数、报告存档、白名单使用统计上报 |

### 三重扫描链（设计要点，不要简化）

1. **硬闸①** `AnalysisService.analyze()`：带姓名黑名单的全量 `scanPayload`。
2. **重扫②** `DeepSeekAnalysisProvider.analyze()`：不信任调用方，规则级重扫。
3. **终扫③** `createAnalysisPayload` 之后的 `scanOutboundPayload()`：对最终 wire 结构再扫一遍
   （`school.name` 豁免地址子句、`requestId` 豁免规则扫描）。
   学校级汇总载荷另有 `scanSchoolSummaryPayload()`：**地址类命中不阻断**（理由见该函数注释，已实测），
   硬 PII 规则照常阻断。

---

## 4. 改动同步清单（最容易漏的地方）

- 新增可发送字段：`AnonymizedStudent`（`types/student.ts`）+ `FIELD_POLICIES` + `payload.ts` 的 `SENT_FIELDS`
  （含 `FieldCountIs34` 编译期断言，字段数变化必须同步改）+ 报告渲染 + 相关测试。
- 新增字段策略别名：四张表之间**零交集**是不变量（有测试钉死），删除表优先（fail-safe）。
- 新增 PII 规则：只改 `security/rules.ts`（清洗器与扫描器自动共用）；`pattern` 必须是全局 `g` 正则。
- 改动 `APP_VERSION`：同步 `package.json.version`，README 版本历史补一条。
- 前端环境变量：改 `vite.config.ts` 不需要动，但新增变量要补 `.env.example` 与 `src/vite-env.d.ts` 类型声明。
- 组件/交互改动：`tests/*.tsx` 有对应渲染测试，改文案会挂断言，请同步更新断言而非删除。
- **报告里的统计图有「按人」与「按条目」两种口径，改之前先确认是哪一种**：
  `report/importance-distribution.ts`（困难因素重要性分布）= 每名学生归入最高档一次，各档之和 = 分析人数；
  `report/difficulty-reason.ts`（困难原因分布）= 材料字段多选拆分，一人可计入多个原因（标签已注明「多选已拆分」）。
  统计口径必须页面（`ReportStep.tsx`）与导出（`report/html.ts`）共用同一模块，**不要在渲染层各写一遍**
  ——历史上「按因素条数累加却标『X 人』」的 bug 就是这么来的。

---

## 5. 测试约定

- 每个逻辑模块一个测试文件，`tests/<module>.test.ts`；`vite.config.ts` 的 `include` 为 `tests/**/*.test.{ts,tsx}`。
- `environment: 'node'`，需要 DOM 的用 `jsdom`（见 `.tsx` 测试）。
- 测试数据**必须程序构造**（如 `utils.aoa_to_sheet` 造内存 xlsx），不得读取 `examples/`。
- 用户可见文案即断言目标；错误报文用固定中文，**绝不透出上游/服务端错误原文**（隐私与体验双要求）。

---

## 6. 部署

部署形态：办公室局域网设备（x96max / Armbian，`172.16.0.146`，80 端口）托管静态页，浏览器直连 DeepSeek。
**完整步骤、排障、踩坑清单见 `server/README.md`，改部署相关的东西前必读。** 要点：

```bash
npm run build
scp -r dist/* x96max:/home/ethan/pearl-visit/dist/   # 只换 dist 不需要重启服务
```

- 环境变量分两文件：`.env`（dev + build 都加载）/ `.env.production`（仅 build，优先级更高，只放 `VITE_USAGE_REPORT_URL`）。
  真实文件均已 gitignore，模板是 `.env.example` / `.env.production.example`。**改动后必须重新构建才生效。**
- 本机 `.env` 已配好真实 DeepSeek Key（`real` 模式）；Key 会被编进页面产物，这是该部署形态的既定取舍。
- 盒子上的 `node` 不在 PATH，脚本里一律写 `/home/ethan/.local/bin/node`。

---

## 7. 已知坑（勿回退）

1. **`.sh` 必须 LF**：`.gitattributes` 强制 `*.sh eol=lf` / `*.bat eol=crlf`，本机 `core.autocrlf=true`。
2. **`xlsx` 停留在 0.18.5**：官方新版走 cdn.sheetjs.com 分发，npm audit 会有已知公告，评估后接受。
3. **Vite watch 忽略 `examples/` 与 `dist/`**：Windows 上被 Excel 占用的文件会触发 Vite EBUSY 崩溃。
4. **Node ≥ 22.5**（`node:sqlite` 的 `DatabaseSync`；22.x 会打印 experimental 警告，不影响）。
5. **`thinking: { type: 'disabled' }` 不能去掉**：`deepseek-flash` 是推理模型，思维链会吃光输出预算导致 content 为空。
6. **`MAX_OUTPUT_TOKENS = 32768` 不能调小**：历史上 8000 撑满导致 JSON 截断、线上失败率 44%。
7. **`crypto.randomUUID` 仅安全上下文可用**：内网 http 部署需保留 `newRequestId()` 的回退实现。
8. **`VITE_USAGE_REPORT_URL` 写死局域网 IP**：盒子换 IP 后上报静默失效（页面仍正常），需改 `.env.production` 重新构建。
9. 报告存档只在本浏览器、30 天未访问自动过期；localStorage 配额不足时降级为「仅本次会话可见」，不报错。

---

## 8. 历史文档（仅背景，勿照抄）

- `docs/superpowers/specs/2026-08-21-*.md`：v1 设计（数据模型、字段策略表、三道防线）。
- `docs/superpowers/specs/2026-08-23-deepseek-integration-design.md`：API 协议契约 v1.0、三重扫描链、错误分类。
- `docs/superpowers/plans/*.md`：v1 的 15 个 TDD 任务计划（大量「执行记录」记录了当时的裁决与偏离）。
- `docs/usage-report-api.md`：上报接口契约。
- `docs/platform-intro.html`：给同事演示的单文件 PPT。
