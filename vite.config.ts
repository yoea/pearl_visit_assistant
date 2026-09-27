/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * 构建时间（页脚展示）：纯前端项目没有运行时构建时间，只能构建期注入。
 * 显式按北京时间格式化，避免结果随构建机时区变化。
 */
const BUILD_TIME = new Date().toLocaleString('zh-CN', {
  timeZone: 'Asia/Shanghai', hour12: false,
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
});

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // 注入为全局常量 __BUILD_TIME__（类型声明见 src/vite-env.d.ts）
  define: { __BUILD_TIME__: JSON.stringify(BUILD_TIME) },
  server: {
    watch: {
      // 忽略示例 Excel 等非源码文件（Windows 上被 Excel 占用的文件会触发
      // Vite watch 的 EBUSY 崩溃；examples/ 只放样例数据，无需监听）
      ignored: ['**/examples/**', '**/dist/**'],
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
