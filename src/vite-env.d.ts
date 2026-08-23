/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 分析提供者：'mock'（默认，含未设置/未知值）| 'real' */
  readonly VITE_ANALYSIS_PROVIDER?: string;
  /** 分析服务器完整端点（real 时必填）。绝不放置任何 API Key */
  readonly VITE_ANALYSIS_API_URL?: string;
  /** 请求超时毫秒数，默认 30000 */
  readonly VITE_ANALYSIS_TIMEOUT_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
