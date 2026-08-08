@echo off
REM ── Stable HTTPS tunnel to the BACKEND for the native APK ─────────────────
REM
REM The Android app (APK) ships the frontend inside it, so it does NOT need the
REM frontend tunnelled — it needs to reach the FastAPI backend on :8000 over
REM HTTPS. This points your ngrok static domain at the backend.
REM
REM The domain here MUST match VITE_API_BASE_URL in
REM   stratum-web-react\.env.production
REM (rebuild the APK after changing it).
REM
REM EVERY TIME (for the APK):
REM   1. Start the backend:  run-backend.cmd
REM   2. Double-click this file.
REM   3. Launch the Stratum app on your phone (from anywhere — mobile data OK).

REM >>> Same static domain as before, now bound to the backend port <<<
set NGROK_DOMAIN=autism-henna-sanitary.ngrok-free.dev

cd /d "%~dp0"
if not exist ngrok.exe (
  echo.
  echo   ngrok.exe not found in this folder.
  echo   Download it from https://ngrok.com/download and put ngrok.exe next to this script.
  echo.
  pause
  exit /b 1
)
echo.
echo   Backend tunnel:  https://%NGROK_DOMAIN%   ->  http://localhost:8000
echo   (Ctrl+C to stop.)
echo.
ngrok.exe http --domain=%NGROK_DOMAIN% 8000
