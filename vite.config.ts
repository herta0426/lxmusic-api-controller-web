import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/lxmusic-api-controller-web/', // 添加这一行，注意斜杠和仓库名
  plugins: [react()],
})
