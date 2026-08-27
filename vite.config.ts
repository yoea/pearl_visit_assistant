/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
