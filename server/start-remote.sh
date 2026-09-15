#!/bin/sh
# 远程重启脚本（由本地 ssh 调用；含后台启动符，绕开本地沙箱对 & 的限制）
#
# 用法（在开发机上）：
#   ssh x96max "sh /home/ethan/pearl-visit/server/start-remote.sh"
# 注意：必须先停旧进程再起新进程——static-server 仍然占用 80 端口时，
#      新进程会 EADDRINUSE 直接退出，而旧进程继续服务，看起来像"重启成功"。
cd /home/ethan/pearl-visit/server || exit 1

# 1) 停掉旧的主页服务（pkill 不会匹配自身；调用方 cmdline 只有脚本路径，不会被误杀）
pkill -f 'static-server\.mjs' 2>/dev/null
sleep 1

# 2) 主页面服务（端口 80）：静态页面 + 使用统计接口（/api/usage、/stats 同端口）
PORT=80 nohup /home/ethan/.local/bin/node static-server.mjs >> /home/ethan/pearl-visit/server.log 2>&1 &

sleep 1

# 3) 起完自检：确认 80 端口真的在响应，失败则明确报错（而不是假装 STARTED）
if curl -sf -m 5 -o /dev/null http://127.0.0.1/health; then
  echo STARTED
else
  echo "FAILED: 服务未能在 80 端口响应，请查看 /home/ethan/pearl-visit/server.log"
  exit 1
fi
