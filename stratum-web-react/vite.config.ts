import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// `npm run dev:https` sets this. Geolocation (and the Screen Wake Lock, and
// DeviceMotion) are gated on a *secure context*, and http://<lan-ip> is not
// one — so a phone on the LAN can browse the UI over plain http but cannot
// start a drive. A self-signed cert makes the LAN origin secure; the phone
// shows a one-time warning to accept.
const https = process.env.HTTPS === '1'

export default defineConfig({
  plugins: [react(), ...(https ? [basicSsl()] : [])],
  server: {
    port: 3000,
    // Bind every interface, not just localhost, so the dev server is reachable
    // from a phone on the same Wi-Fi. Use `npm run dev:https` when you need to
    // actually record a drive from that phone — see the note above.
    host: true,
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
