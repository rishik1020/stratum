@echo off
REM ── Start the Stratum web app (Vite dev server) ───────────────────────────
REM   App: http://127.0.0.1:5173   (proxies /api -> backend on :8000)
cd /d "%~dp0stratum-web-react"
echo Starting frontend on http://127.0.0.1:5173  (Ctrl+C to stop)
call npm run dev -- --host 0.0.0.0 --port 5173
