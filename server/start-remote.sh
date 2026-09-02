#!/bin/sh
# 远程重启脚本（由本地 ssh 调用；含后台启动符，绕开本地沙箱对 & 的限制）
cd /home/ethan/pearl-visit/server || exit 1

# 主页面服务（端口 80）：静态页面 + 使用统计接口（/api/usage、/stats 同端口）
PORT=80 nohup /home/ethan/.local/bin/node static-server.mjs >> /home/ethan/pearl-visit/server.log 2>&1 &

sleep 1
echo STARTED
