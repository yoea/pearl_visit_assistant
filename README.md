# 珍珠生走访智能面谈辅助工具

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

## 第二阶段：真实 AI 分析（DeepSeek 经分析服务器中转）

数据只在本地脱敏 + 三道安全检查通过后，才发送到**指定分析服务器**。协议契约、
服务端提示词约束与实现须知见 `docs/superpowers/specs/2026-08-23-deepseek-integration-design.md`。

### 环境变量（构建期注入，绝不含 API Key）

| 变量 | 说明 | 默认 |
|---|---|---|
| `VITE_ANALYSIS_PROVIDER` | `mock`（本地规则引擎）或 `real`（真实 AI） | `mock` |
| `VITE_ANALYSIS_API_URL` | 分析服务器完整端点（real 时必填） | 空 |
| `VITE_ANALYSIS_TIMEOUT_MS` | 请求超时毫秒数 | `30000` |

- **API Key 只配置在分析服务器端**，前端绝不保存任何 Key（浏览器环境变量会进入构建产物）。
- `real` 但未配置地址时自动回退 Mock 并在控制台提示。
- 可复制 `.env.example` 为 `.env` 按需修改（`.env*` 已被 gitignore，`.env.example` 除外）。

### 发送前确认

安全检查通过后必须手动点击「确认并开始 AI 分析」才会发送；发送前预览页列出
「绝不发送」字段清单（姓名/证件/电话/住址/教师姓名/珍珠号/原始文件等）。
AI 分析结果只存当前页面内存，刷新即失；报告需手动下载。

### 本地分析服务器（DeepSeek 中转，单服务同源模式）

**一个 Node 服务同时托管页面与分析 API（同端口，默认 5000，无跨域）**：
使用者本机跑 `server/start-server.bat`（Key 只存在于本机 `server/.env`），
浏览器打开 `http://localhost:5000` 即可使用，学生数据（含脱敏后）全程不出用户电脑。
部署与启动说明见 [`server/README.md`](server/README.md)。
