import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' -> 가비아 웹루트에 올려도, 하위 폴더(/stamp 등)에 올려도 동작합니다.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    // 로컬 개발 중 /api 요청을 실제 서버로 넘기고 싶을 때 사용합니다.
    // .env.local 에 VITE_DEV_API_TARGET=https://내도메인 을 넣으면 켜집니다.
    proxy: process.env.VITE_DEV_API_TARGET
      ? { '/api': { target: process.env.VITE_DEV_API_TARGET, changeOrigin: true, secure: false } }
      : undefined,
  },
})
