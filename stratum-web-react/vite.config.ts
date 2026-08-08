import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // Allow any Host header so HTTPS tunnels (ngrok / cloudflared / loca.lt) work.
    allowedHosts: true,
    proxy: {
      // Single same-origin entry that carries both HTTP and the telemetry
      // WebSocket through to the backend, stripping the /api prefix. Lets one
      // HTTPS tunnel to this dev server cover the whole app — no second tunnel,
      // no CORS, no mixed-content.
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
})
