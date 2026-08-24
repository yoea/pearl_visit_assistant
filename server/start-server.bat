@echo off
rem 珍珠生走访工具 · 本地分析服务器启动器（Windows 双击即可）
rem 前置：确认本目录下存在 .env（可复制 .env.example 并填入 DEEPSEEK_API_KEY）
cd /d "%~dp0"
if not exist .env (
  echo [错误] 未找到 .env 文件。请先复制 .env.example 为 .env，并填入 DEEPSEEK_API_KEY。
  echo 操作：copy .env.example .env 然后用记事本打开 .env 填写。
  pause
  exit /b 1
)
echo 正在启动分析服务器（保持本窗口打开，关闭窗口即停止）...
node analysis-server.mjs
pause
