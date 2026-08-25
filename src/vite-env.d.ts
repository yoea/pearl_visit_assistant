/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 分析提供者：'mock'（默认，含未设置/未知值）| 'real' */
  readonly VITE_ANALYSIS_PROVIDER?: string;
  /** DeepSeek API Key（real 时必填）。局域网部署形态：随构建注入产物（用户明确授权） */
  readonly VITE_DEEPSEEK_API_KEY?: string;
  /** 模型名，默认 deepseek-v4-flash */
  readonly VITE_DEEPSEEK_MODEL?: string;
  /** 请求超时毫秒数，默认 60000 */
  readonly VITE_ANALYSIS_TIMEOUT_MS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
