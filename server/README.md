# 静态页面服务器（x96max 局域网部署）

**架构：本服务只托管前端页面（`dist/`）。分析不经服务器中转——**
浏览器加载页面后，在本地完成 Excel 读取、脱敏、三重安全检查，用户手动确认后**直连 DeepSeek API**。

部署形态（用户明确授权）：办公室局域网内设备（x96max 电视盒子 / Armbian），
同事浏览器访问 `http://172.16.0.146/`（80 端口）。API Key 随构建注入页面产物
（局域网可信环境决策，非通用默认）。

---

## 〇、现网事实速查（2026-09-15 实测，2026-09-27 复核）

| 项目 | 值 |
|---|---|
| 盒子角色 | Armbian / aarch64，主机名 `x96max`，局域网 IP `172.16.0.146` |
| SSH 入口 | 统一用别名 `ssh x96max`。别名背后的真实地址**因开发机而异**（局域网直连 / 公网转发端口不同，别名集合也可能不同）——本文档不写死地址，用前见下方「连接前先确认」 |
| 部署目录 | `/home/ethan/pearl-visit/`（静态页在 `dist/`，服务在 `server/`） |
| Node | `/home/ethan/.local/bin/node`，**v24.17.0**（`node` 不在 PATH，必须写全路径） |
| 监听端口 | **80**（`PORT=80`）；代码默认值是 5000，部署时被显式覆盖 |
| 服务进程 | `node static-server.mjs`，日志 `/home/ethan/pearl-visit/server.log` |
| 统计库 | `/home/ethan/pearl-visit/server/data/usage.db`（SQLite） |
| 盒子上**没有 git 仓库** | 靠文件拷贝部署，不是 `git pull` |

### 连接前先确认（不同开发机配置不同）

本机 `~/.ssh/config` 里 `x96max` 别名的真实地址**不固定**——有人用局域网直连、有人走公网端口转发，
别名集合也可能不一样。所以：

```bash
ssh -G x96max | grep -E '^(hostname|port|user) '   # 看这台机器实际连到哪
```

- 只依赖别名 `ssh x96max`，**不要在文档/脚本里写死 IP 与端口**。
- 连的是**哪种链路会影响「验证」这一步**：
  - 走**局域网**（如 `172.16.x.x`）→ 本机可以直接 `curl http://172.16.0.146/` 做同事视角验证；
  - 走**公网转发** → 本机 curl 内网 IP 会超时，这是**正常现象、不是部署失败**。
    改用盒子本机视角验证（`ssh x96max "curl -s http://127.0.0.1/ ..."`），
    想看页面就做端口转发：`ssh -N -L 18080:127.0.0.1:80 x96max` → `http://localhost:18080/`。

---

## 一、环境变量（新机器必须知道的部分）

所有变量都在**构建期**注入，改动后必须重新构建才生效。共 7 个：

| 变量 | 作用 | 新机器怎么填 |
|---|---|---|
| `VITE_ANALYSIS_PROVIDER` | `real` 走真实 DeepSeek；`mock` 走本地规则引擎（不联网） | `real` |
| `VITE_DEEPSEEK_API_KEY` | DeepSeek Key，`real` 时必填 | 见下方说明 |
| `VITE_DEEPSEEK_MODEL` | 模型名 | `deepseek-v4-flash`（实测为 `deepseek-flash` 的可用别名） |
| `VITE_ANALYSIS_TIMEOUT_MS` | 单次请求超时 | `60000` |
| `VITE_APP_TITLE` | 浏览器标签页 / 页眉 / 首页标题 | `珍珠生走访审核辅助平台` |
| `VITE_APP_SUBTITLE` | 首页副标题 | 见 `.env.example` |
| `VITE_USAGE_REPORT_URL` | 统计上报接口 | `http://172.16.0.146/api/usage` |

### 配置分两个文件（Vite 的 mode 机制）

| 文件 | 何时生效 | 内容 |
|---|---|---|
| `.env` | `npm run dev` 和 `npm run build` **都**加载 | 上面 6 个变量（**不含** `VITE_USAGE_REPORT_URL`） |
| `.env.production` | 仅 `npm run build`（Vite 默认 `mode=production`） | 只有 `VITE_USAGE_REPORT_URL`，且**优先级高于 `.env`** |

- 两个真实文件都被 `.gitignore` 排除；模板分别是 `.env.example`、`.env.production.example`。
- **为什么拆开**：`VITE_USAGE_REPORT_URL` 若写进 `.env`，`npm run dev` 每次打开 localhost
  都会把 `open` 事件写进办公室盒子的生产统计库，污染真实使用数据。
- 因此新机器只需：`cp .env.example .env`、`cp .env.production.example .env.production`，
  再把 DeepSeek Key 填进 `.env` 即可。

### Key 从哪来

- 最省事：直接问 Key 的持有人，或到 DeepSeek 开放平台重新生成。
- 也可以从**线上构建产物里还原**（Key 本来就明文编在页面 JS 里，这是本部署形态的既定取舍）：

  ```bash
  ssh x96max "grep -oh 'sk-[A-Za-z0-9_-]\{20,\}' \
    /home/ethan/pearl-visit/dist/assets/index-*.js | head -1"
  ```

- 校验 Key 是否仍可用：

  ```bash
  curl -s https://api.deepseek.com/user/balance -H "Authorization: Bearer <key>"
  # 返回 {"is_available":true,"balance_infos":[...]} 即有效
  ```

---

## 二、构建页面（开发机，一次）

```bash
cp .env.example .env                       # 填好 DeepSeek Key
cp .env.production.example .env.production # 内含统计上报地址
npm install
npm run build                              # tsc --noEmit && vite build → dist/
```

**可复现性已验证**：本机 `npm run build` 产出的 `dist/` 与线上正在服务的产物
sha256 完全一致（`index-xMM7VFwo.js` = `4d554105…eeff1f`）。
如果构建结果和线上不一致，说明 `.env` 与生产配置有偏差。

---

## 三、部署到 x96max

盒子只认文件，不认 git：

```bash
# 1. 拷静态页（只需拷贝 dist/ 内容；server/ 仅在服务端代码改动时才需要同步）
ssh x96max "mkdir -p /home/ethan/pearl-visit/dist"
scp -r dist/* x96max:/home/ethan/pearl-visit/dist/

# 2. 启用新版本 —— 通常**不需要重启**！
```

### 关键：只换 dist 不需要重启

`static-server.mjs` 对每个请求都 `readFileSync`，且 `index.html` 带 `Cache-Control: no-cache`、
静态资源带内容哈希文件名。所以：

- **换页面** → 拷完 `dist/`，同事刷新浏览器即生效，**服务不用重启、不断服**。
- **改服务端**（`server/*.mjs`）→ 才需要重启。

```bash
# 仅在同步过 server/ 之后执行
scp server/static-server.mjs server/usage-core.mjs x96max:/home/ethan/pearl-visit/server/
ssh x96max "sh /home/ethan/pearl-visit/server/start-remote.sh"
```

---

## 四、重启与排障

`server/start-remote.sh` 已改为**先停旧进程再起新进程**，并带启动自检：

```sh
pkill -f 'static-server\.mjs'   # 先释放 80 端口
sleep 1
PORT=80 nohup node static-server.mjs >> server.log 2>&1 &
sleep 1
curl -sf -m 5 http://127.0.0.1/health && echo STARTED || echo FAILED
```

> **为什么必须先停**：80 端口被占用时，新进程会 `Error: listen EADDRINUSE` 直接退出，
> 而旧进程继续正常服务——脚本却照样打印 `STARTED`，看起来"重启成功"实际什么都没变。
> 实测复现过：新进程退出、`/health` 仍 200。旧脚本（无 `pkill`）就有这个坑，已于 2026-09-15 修复，
> 原文件备份为同目录 `start-remote.sh.bak-20260915`。

排障命令：

```bash
ssh x96max "pgrep -af static-server.mjs"                        # 服务在跑吗（PID 变新 = 重启成功）
ssh x96max "tail -30 /home/ethan/pearl-visit/server.log"        # 服务日志
ssh x96max "curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1/health"
curl -s -o /dev/null -w '%{http_code}\n' http://172.16.0.146/   # 同事视角（仅当本机与盒子同网段）
```

---

## 五、验证

**先看本机到盒子是哪条链路**（见第〇节「连接前先确认」）：走公网时内网 IP 不可达，
用下面的 ② 会全部超时，属正常现象——改用 ① 在盒子本机验证即可。

```bash
# ① 盒子本机视角（任何链路都可用，最可靠）
ssh x96max "curl -s http://127.0.0.1/ | head -3 ; \
             curl -s -o /dev/null -w 'health=%{http_code}\n' http://127.0.0.1/health ; \
             curl -s http://127.0.0.1/stats | head -5"

# ② 同事视角（仅本机与盒子同网段时可用）
curl -s http://172.16.0.146/ | head -3                    # 应返回 index.html
curl -s -o /dev/null -w '%{http_code}\n' http://172.16.0.146/health   # 200
# 统计页（打开次数/分析数/token 总量/每日趋势）
curl -s http://172.16.0.146/stats | head -5

# ③ 走公网链路时想在浏览器里看线上页面 → 端口转发
ssh -N -L 18080:127.0.0.1:80 x96max     # 然后访问 http://localhost:18080/
```

本机开发环境自测（不碰生产）：

```bash
PORT=8080 node server/static-server.mjs   # 静态目录默认 ../dist
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/
```

---

## 六、跨平台踩坑（已修复，勿回退）

1. **`.sh` 必须是 LF。** 本机 git 配了 `core.autocrlf=true`，检出时会把文件写成 CRLF；
   CRLF 的 shell 脚本拷到 Linux 会报 `/bin/sh^M: bad interpreter` 无法执行。
   仓库根目录的 `.gitattributes` 已强制 `*.sh eol=lf`、`*.bat eol=crlf`。
2. **Node 版本要 ≥ 22.5**（`node:sqlite` 的 `DatabaseSync`）；开发机 22.22.2 可用
   （会打印一条 `SQLite is an experimental feature` 警告，不影响运行），
   部署机建议 24.x（盒子现为 24.17.0）。README 旧文档写的"Node 24+"偏保守，22.5+ 亦可。
3. **盒子上 `node` 不在 PATH**，脚本与文档里一律写 `/home/ethan/.local/bin/node`。
4. **`VITE_USAGE_REPORT_URL` 写死了局域网 IP。** 盒子 DHCP 换 IP 后上报会静默失效
   （前端不重试、不报错），`/stats` 停止增长但页面正常。此时改 `.env.production` 重新构建部署即可。

---

## 七、安全边界（仍然生效，与服务器无关）

- 原始学生数据（姓名/身份证/电话/QQ/微信/邮箱/详细地址/教师姓名/珍珠号）**绝不出浏览器**；
- 发送前脱敏 + 三重安全检查（AnalysisService 硬闸 → provider 重扫 → 出站终扫），命中即阻止且不可绕过；
- 发送必须用户手动点击确认，绝不自动发送；
- 提示词约束随请求发出（严禁通过/淘汰结论、事实与推测分离、5-8 个中性问题、严格 JSON、逐生一一对应）；
- 报告仅存页面内存，刷新即失；无持久化、无日志；
- 服务器只持久化**白名单计数**（工具名/版本/随机浏览器 ID/事件名/数字），
  经 `usage-core.mjs` 的 `sanitize()` 清洗，结构不合规直接丢弃不落盘；
- 已放开的约束（本形态特有，用户明确授权）：API Key 注入构建产物——局域网内可被技术手段提取；
  Key 泄露时到 DeepSeek 开放平台重置即可。

完整协议契约见 `docs/superpowers/specs/2026-08-23-deepseek-integration-design.md` 第 4 节。
