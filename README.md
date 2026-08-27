# 珍珠生走访审核辅助平台

新华教育基金会内部工具：将候选珍珠生 Excel 在**本地浏览器**中完成读取、清洗、脱敏，
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
  API Key 只配置在分析服务器端，前端绝不接触；模型配置由分析服务器决定。

## 第二阶段：真实 AI 分析（DeepSeek 直连）

数据只在本地脱敏 + 三道安全检查通过后，由浏览器**直接发送到 DeepSeek**。协议契约、
提示词约束与实现须知见 `docs/superpowers/specs/2026-08-23-deepseek-integration-design.md`。

### 部署形态：x96max 局域网

页面托管在办公室局域网设备（x96max / Armbian，零依赖 `node static-server.mjs`），
同事浏览器访问 `http://<设备IP>:5000`；脱敏在浏览器本地完成，分析直连 DeepSeek——
**局域网可信环境决策：API Key 随构建注入页面产物（用户明确授权，Key 泄露时重置即可）**。
部署步骤见 [`server/README.md`](server/README.md)。

### 环境变量（构建期注入）

| 变量 | 说明 | 默认 |
|---|---|---|
| `VITE_ANALYSIS_PROVIDER` | `mock`（本地规则引擎）或 `real`（真实 AI） | `mock` |
| `VITE_DEEPSEEK_API_KEY` | DeepSeek API Key（real 时必填） | 空 |
| `VITE_DEEPSEEK_MODEL` | 模型名 | `deepseek-chat` |
| `VITE_ANALYSIS_TIMEOUT_MS` | 请求超时毫秒数 | `60000` |
| `VITE_APP_TITLE` | 页面标题（浏览器标签页/页眉/首页） | `珍珠生走访审核辅助平台` |
| `VITE_APP_SUBTITLE` | 副标题（功能说明，首页标题下方） | 见 `.env.example` |

- `real` 但未配置 Key 时自动回退 Mock 并在控制台提示。
- 可复制 `.env.example` 为 `.env` 按需修改（`.env*` 已被 gitignore，`.env.example` 除外）。

### 发送前确认

安全检查通过后必须手动点击「确认并开始 AI 分析」才会发送；发送前预览页列出
「绝不发送」字段清单（姓名/证件/电话/住址/教师姓名/珍珠号/原始文件等）。
AI 分析结果只存当前页面内存，刷新即失；报告需手动下载。
