@echo off
REM ── Start the Stratum web app (Vite dev server) ───────────────────────────
REM   App: http://127.0.0.1:3000   (proxies /api -> backend on :8000)
REM   The port lives in vite.config.ts — don't pass --port here, or the two
REM   disagree and the tunnel scripts point at the wrong one.
cd /d "%~dp0stratum-web-react"
echo Starting frontend on http://127.0.0.1:3000  (Ctrl+C to stop)
call npm run dev -- --host 0.0.0.0
