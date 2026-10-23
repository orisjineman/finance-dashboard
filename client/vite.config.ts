import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // 서버는 127.0.0.1에서만 받는다. localhost는 ::1로 풀릴 수 있어서 주소를 직접 쓴다.
      '/api': 'http://127.0.0.1:4300',
    },
  },
})
