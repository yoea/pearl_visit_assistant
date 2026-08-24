# 本地分析服务器（DeepSeek 中转，单服务同源模式）

**一个 Node 服务同时托管：页面（`dist/`）+ 分析 API（`/api/analyze`），同一端口（默认 5000）。**
页面与 API 同源 → 无跨域、无 CORS、无 Nginx——双击一个脚本全搞定。

数据流：使用者浏览器打开 `http://localhost:5000` → 浏览器本地完成导入/脱敏/三重安全扫描 → 用户手动确认 → `POST http://localhost:5000/api/analyze`（同源，本机）→ DeepSeek → 结果回浏览器。**学生数据（含脱敏后）全程不出用户电脑。**

## 一、使用者（老师）侧：启动

1. 安装 [Node.js 18+](https://nodejs.org/)
2. 复制 `server/.env.example` 为 `server/.env`，用记事本填入团队共用的 `DEEPSEEK_API_KEY`
3. 双击 `server/start-server.bat` → 浏览器打开 `http://localhost:5000` 即可使用

> Key 只存在于本机 `.env`（已被 gitignore），绝不进入前端构建产物；任何一端的 Key 泄露都可通过 DeepSeek 开放平台重置。

## 二、管理员侧：构建（页面产物更新时）

```bash
npm install
npm run build        # 产物在 dist/（start-server.bat 直接托管它）
```

构建期环境变量（页面与 API 同源，用相对路径即可，自动适配 localhost/局域网 IP/域名）：

```
VITE_ANALYSIS_PROVIDER=real
VITE_ANALYSIS_API_URL=api/analyze
```

## 三、验证

```bash
cd server
node analysis-server.mjs            # 无 .env 时应提示未配置 Key
curl -X POST http://localhost:5000/api/analyze -H "Content-Type: application/json" \
  -d '{"version":"1.0","requestId":"test-1","school":{"name":"某中学"},"cohort":"2026级","students":[{"id":"student-001","data":{"gender":"女","familySituation":"母亲患心脏病","perCapitaIncome":8000}}]}'
# 期望：无 Key → {"error":"server_not_configured"}（HTTP 500）
```

## 四、错误透传（前端七分类生效）

| DeepSeek 状态 | 转发 | 前端类别 | 用户文案 |
|---|---|---|---|
| 401 / 403（Key 无效） | 401/403 | configuration | 分析服务配置有误，请联系系统管理员 |
| 429（限流） | 429 | rate-limited | 请求过于频繁，请稍候片刻再试 |
| 5xx | 5xx | server | 分析服务暂时不可用，请稍后重试 |
| 其他异常 | 500 | server | 同上 |

## 五、安全边界（与本仓库前端守卫同源）

- Key 只在服务端 `.env`；模型名由服务端 `DEEPSEEK_MODEL` 决定（前端不感知）
- 服务端只做结构级防御（version/students 上限、静态路径穿越防护），**数据脱敏与内容扫描由前端三重扫描链负责**（契约职责分工，见设计文档 5.2）
- 日志白名单：requestId / 耗时 / 学生数量 / 成功失败 / 错误类型，**绝无**姓名/证件/电话/家庭情况/申请理由/住址/请求正文；不落盘
- 提示词含契约 4.5 全部约束（严禁通过/淘汰结论、事实与推测分离、5-8 个中性问题、严格 JSON、逐生一一对应）——**前端无法替服务端执行，属服务端必做**

## 六、可选形态：公网/局域网多机访问（ECS 单服务）

同一服务部署到 ECS（或内网服务器）：`node analysis-server.mjs` 监听 `0.0.0.0:5000`，其他电脑访问 `http://<服务器IP>:5000` 即用（相对路径 API 自动跟随）。此形态下 Key 位于服务器上、脱敏数据出网——数据安全等级由部署环境决定，与形态五（本地）不同。

完整协议契约与提示词约束见 `docs/superpowers/specs/2026-08-23-deepseek-integration-design.md` 第 4 节。
