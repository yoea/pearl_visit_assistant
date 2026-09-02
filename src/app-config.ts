/**
 * 平台名称与功能说明（页面标题/副标题）。
 * 来源：.env 的 VITE_APP_TITLE / VITE_APP_SUBTITLE（改 env 后重新构建即生效）；
 * 缺省时用内置文案兜底，保证环境变量缺失时页面标题不空白。
 */
export const APP_TITLE = (import.meta.env.VITE_APP_TITLE as string | undefined)?.trim()
  || '珍珠生走访审核辅助平台';

export const APP_SUBTITLE = (import.meta.env.VITE_APP_SUBTITLE as string | undefined)?.trim()
  || '只需上传珍珠生申请表，即可分析学生资料填写问题并提取重点信息，帮您快速审核、面谈。';

/** 版本标签：与 git tag / package.json version 保持同步 */
export const APP_VERSION = 'v1.1.0';
