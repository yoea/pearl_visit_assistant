# 静态页面服务器（x96max 局域网部署）

**架构：本服务只托管前端页面（`dist/`）。分析不经服务器中转——**
浏览器加载页面后，在本地完成 Excel 读取、脱敏、三重安全检查，用户手动确认后**直连 DeepSeek API**。

部署形态（用户明确授权）：办公室局域网内设备（x96max 电视盒子 / Armbian / 任意 Linux 或 Windows 机器），
同事浏览器访问 `http://<设备IP>:5000`。API Key 随构建注入页面产物（局域网可信环境决策，非通用默认）。

## 一、构建页面（在开发电脑上做一次）

```bash
# 项目根目录，写入真实配置后构建（.env 已被 gitignore）
echo VITE_ANALYSIS_PROVIDER=real > .env
echo VITE_DEEPSEEK_API_KEY=sk-你的key >> .env
npm install
npm run build          # 产物在 dist/（Key 注入其中）
```

## 二、部署到 x96max（Armbian 类 Linux）

```bash
# 1. 安装 Node.js 18+（Armbian：）
#    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs
# 2. 把整个项目目录（至少 dist/ 与 server/）拷贝到盒子，如 /opt/pearl-visit
scp -r dist server root@<x96max-ip>:/opt/pearl-visit/
# 3. 启动（保持前台运行）
cd /opt/pearl-visit/server && node static-server.mjs
```

开机自启（可选，Armbian 用 systemd）：

```ini
# /etc/systemd/system/pearl-visit.service
[Unit]
Description=Pearl Visit Assistant (static)
After=network.target

[Service]
WorkingDirectory=/opt/pearl-visit/server
ExecStart=/usr/bin/node static-server.mjs
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now pearl-visit
```

同事浏览器访问 `http://<x96max-ip>:5000` 即可使用。

## 三、验证

```bash
curl -s http://localhost:5000/ | head -3          # 应返回 index.html
```

## 四、安全边界（仍然生效，与服务器无关）

- 原始学生数据（姓名/身份证/电话/QQ/微信/邮箱/详细地址/教师姓名/珍珠号）**绝不出浏览器**；
- 发送前脱敏 + 三重安全检查（AnalysisService 硬闸 → provider 重扫 → 出站终扫），命中即阻止且不可绕过；
- 发送必须用户手动点击确认，绝不自动发送；
- 提示词约束随请求发出（严禁通过/淘汰结论、事实与推测分离、5-8 个中性问题、严格 JSON、逐生一一对应）；
- 报告仅存页面内存，刷新即失；无持久化、无日志。
- 已放开的约束（本形态特有，用户明确授权）：API Key 注入构建产物——局域网内可被技术手段提取；
  Key 泄露时到 DeepSeek 开放平台重置即可。

完整协议契约见 `docs/superpowers/specs/2026-08-23-deepseek-integration-design.md` 第 4 节。
