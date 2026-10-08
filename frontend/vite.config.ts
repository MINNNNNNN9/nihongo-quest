import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// 開發時由 Vite 把 /api 與 /admin 轉給 Django，前端與 API 因此同源（不需要 CORS）
const api = process.env.API_PROXY_TARGET ?? 'http://localhost:8010';

export default defineConfig({
  // 每次建置一個新的代號，接在播放器網址後面，網站更新後播放器頁面也會跟著換新
  define: { __BUILD_ID__: JSON.stringify(Date.now().toString(36)) },
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: api, changeOrigin: false },
      '/admin': { target: api, changeOrigin: false },
      '/static': { target: api, changeOrigin: false },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
