# 使用情况统计上报接口（契约）

前端工具（珍珠生走访审核辅助平台）将**使用计数**统一上报到本接口，
供统计「工具使用次数 / 分析报告数 / token 用量」。

> 隐私承诺（前端已保证，后端只需按 schema 存储）：
> **上报内容为白名单纯计数，绝不包含任何学生数据或个人身份信息。**
> 唯一标识 `clientId` 是浏览器本地随机生成的 UUID，不关联任何个人信息。

## 接入方式

- 前端通过构建期环境变量 `VITE_USAGE_REPORT_URL` 配置接口地址（**未配置则前端不发送任何请求**）。
- 上报时机：
  - `open`：用户每次打开工具页面（一次）
  - `analysis_succeeded`：每次 AI 分析成功（含 token 用量）
  - `analysis_failed`：每次 AI 分析失败（含失败类别）
- 发送方式：`navigator.sendBeacon`（回退 `fetch keepalive`），`Content-Type: application/json`。
- 失败处理：前端**不重试、不阻塞**，丢包即弃——后端按尽力而为处理即可。

## 端点

```
POST {VITE_USAGE_REPORT_URL}
```

建议后端响应 `200/204` 即可；鉴权建议内网部署 + 可选 `Authorization: Bearer <key>`（前端支持经 URL/Header 传入前可先不做）。

## 请求体 Schema

```jsonc
{
  "tool": "pearl-visit-assistant",          // 固定值
  "version": "v1.1.0",                      // 平台版本号
  "clientId": "3f2c…",                      // 随机 UUID，浏览器级唯一标识
  "event": "analysis_succeeded",            // open | analysis_succeeded | analysis_failed
  "occurredAt": "2026-08-27T10:00:00.000Z", // ISO 8601（UTC）
  "payload": {
    // —— 各事件的附加字段（均为可选、均为数字/枚举名）——

    // analysis_succeeded：
    "students": 12,                         // 本次分析的学生人数
    "usage": {                              // 本次分析 token 用量（真实 AI 才有）
      "apiCalls": 3,                        // API 调用次数（含修复重试）
      "promptTokens": 12345,                // 输入 token
      "completionTokens": 6789,             // 输出 token
      "cacheHitTokens": 2345                // 输入缓存命中 token
    },
    "cumulative": {                         // 该浏览器本机累计（localStorage）
      "analyses": 5,                        // 累计成功分析次数
      "promptTokens": 50000,
      "completionTokens": 30000,
      "totalTokens": 80000                  // prompt + completion
    },

    // analysis_failed：
    "errorCategory": "timeout"              // network | timeout | configuration | rate-limited | server | format | security | unknown
  }
}
```

## 事件与字段对照

| event | 字段 | 说明 |
|---|---|---|
| `open` | 无 | 打开工具计数 |
| `analysis_succeeded` | `students` / `usage` / `cumulative` | 分析成功计数 + 本次/累计 token |
| `analysis_failed` | `errorCategory` | 失败计数 + 类别（枚举名，非错误原文） |

## 存储建议

```sql
CREATE TABLE usage_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tool        TEXT NOT NULL,
  version     TEXT NOT NULL,
  client_id   TEXT NOT NULL,
  event       TEXT NOT NULL,              -- open / analysis_succeeded / analysis_failed
  occurred_at TEXT NOT NULL,
  students    INTEGER,
  error_category TEXT,
  api_calls      INTEGER,
  prompt_tokens  INTEGER,
  completion_tokens INTEGER,
  cache_hit_tokens INTEGER,
  cum_analyses   INTEGER,
  cum_prompt_tokens INTEGER,
  cum_completion_tokens INTEGER,
  cum_total_tokens INTEGER
);
CREATE INDEX idx_usage_occurred ON usage_events(occurred_at);
CREATE INDEX idx_usage_event ON usage_events(event);
```

## 典型查询

- 工具被打开次数：`SELECT COUNT(*) FROM usage_events WHERE event='open';`
- 分析报告数：`SELECT COUNT(*) FROM usage_events WHERE event='analysis_succeeded';`
- token 总量：`SELECT SUM(prompt_tokens), SUM(completion_tokens) FROM usage_events WHERE event='analysis_succeeded';`
- 去重用户数（按浏览器）：`SELECT COUNT(DISTINCT client_id) FROM usage_events;`
- 每日使用趋势：`GROUP BY date(occurred_at)`
