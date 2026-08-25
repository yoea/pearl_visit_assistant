@echo off
rem 珍珠生走访工具 · 静态页面服务器启动器（Windows 开发机可选；正式部署见 README.md 的 x96max 说明）
cd /d "%~dp0"
echo 正在启动静态页面服务器（保持本窗口打开，关闭窗口即停止）...
node static-server.mjs
pause
