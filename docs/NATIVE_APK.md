# Stratum — Native Android App (APK)

Stratum now ships as a real Android app via **Capacitor**, which wraps the existing
React/Vite frontend in a native WebView. Going native buys us what the browser
denied: reliable GPS permissions, uninterrupted high-rate motion sensors, and a
path to **background location tracking** (screen-locked drives) — the things the
web build could never do.

Nothing about the frontend code changed to make this work; the APK loads the same
`dist/` build, just from the device instead of a dev server.

---

## How it differs from the web build

| | Web (dev server + tunnel) | Native APK |
|---|---|---|
| Frontend served from | Vite on `:3000`, tunnelled | Bundled **inside the APK** (`https://localhost`) |
| Backend reached via | same-origin `/api` (Vite proxy) | **absolute URL** in `.env.production` |
| Tunnel points at | frontend (`:3000`) | **backend** (`:8000`) — `run-tunnel-backend.cmd` |
| GPS / motion | browser-gated, stops on lock | native permissions, background-capable |

The single conceptual change: **there is no Vite proxy in the APK**, so the app
talks to the backend at the absolute URL baked in at build time via
`stratum-web-react/.env.production` (`VITE_API_BASE_URL`). CORS on the backend now
also allows the Capacitor origins (`https://localhost`, `capacitor://localhost`).

---

## Prerequisites (already present on the build machine)

- **Node** 20+ and npm
- **Android Studio** (ships the JDK 21 used here at `…/Android Studio/jbr`)
- **Android SDK** at `%LOCALAPPDATA%\Android\Sdk` (platform-tools/`adb`, build-tools)

`stratum-web-react/android/local.properties` points Gradle at the SDK. It is
machine-specific and not committed.

---

## Build the APK

From `stratum-web-react/`:

```bat
REM 1. Build the web app (bakes in VITE_API_BASE_URL from .env.production)
npm run build

REM 2. Copy the fresh build into the native project
npx cap copy android

REM 3. Assemble the debug APK
cd android
set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
gradlew.bat assembleDebug
```

Output APK:
```
stratum-web-react/android/app/build/outputs/apk/debug/app-debug.apk
```

> Whenever you change frontend code **or** `.env.production`, re-run steps 1–3
> (`npm run build && npx cap copy android` then `gradlew assembleDebug`).

### Install on a phone

- **USB (adb):** enable USB debugging, then
  `platform-tools\adb.exe install -r app\build\outputs\apk\debug\app-debug.apk`
- **Manual:** copy the `.apk` to the phone and open it (allow "install unknown apps").

---

## Running a live session with the APK

1. Start the backend: `run-backend.cmd` (FastAPI on `:8000`).
2. Expose it over HTTPS: `run-tunnel-backend.cmd` (ngrok static domain → `:8000`).
   - The domain must equal `VITE_API_BASE_URL` in `.env.production`. If you change
     one, change the other and rebuild the APK.
3. Launch the **Stratum** app, sign in, create/join a sprint, allow Location.

Same-WiFi alternative (no tunnel): set
`VITE_API_BASE_URL=http://<PC-LAN-IP>:8000` in `.env.production`, rebuild. Cleartext
HTTP to a LAN IP is already allowed (`usesCleartextTraffic` / `allowMixedContent`).

---

## Roadmap (native-only wins to add next)

- **Native geolocation** via `@capacitor/geolocation` (installed) for stronger,
  higher-frequency fixes than the WebView's `navigator.geolocation`.
- **Background location** via `@capacitor-community/background-geolocation` + a
  foreground service, so drives keep recording with the screen off.
- **Full motion capture** — stream 3-axis accelerometer + gyroscope (~60 Hz)
  instead of a single g-force scalar, unlocking the friction-circle (g-g) plot and
  real braking/cornering force analysis.
