# 珍珠生走访智能面谈辅助工具

公益基金会内部工具：将候选珍珠生 Excel 在**本地浏览器**中完成读取、清洗、脱敏，
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
  API Key 由用户输入且绝不写入源码。
