import type { CapacitorConfig } from '@capacitor/cli'

// Native shell config. The web app is built to `dist/` and loaded from the
// device (origin: https://localhost on Android). Because there is no Vite proxy
// in the APK, the frontend talks to the backend at an absolute URL — set
// VITE_API_BASE_URL in `.env.production` (see src/api.ts).
const config: CapacitorConfig = {
  appId: 'com.stratum.app',
  appName: 'Stratum',
  webDir: 'dist',
  android: {
    // Allow http:// to a LAN backend IP during dev (ngrok HTTPS needs no this).
    allowMixedContent: true,
  },
  plugins: {
    Geolocation: {
      // Ask for precise, high-frequency fixes.
    },
  },
}

export default config
