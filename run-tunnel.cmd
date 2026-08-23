@echo off
REM ── HTTPS tunnel to the FRONTEND, for testing in a phone browser ──────────
REM
REM   Use this when you want to open Stratum in the phone's browser.
REM   For the installed APK use run-tunnel-backend.cmd instead — the APK ships
REM   its own frontend and only needs to reach the backend.
REM
REM   Start the app first with run-all.cmd, THEN run this.
REM
REM   NOT with run-phone.cmd. That serves port 3000 over HTTPS, and this dials
REM   http://localhost:3000 — the handshake fails and the tunnel serves nothing.
REM   They are two ways to do the same job; pick one:
REM     run-phone.cmd   same Wi-Fi, nothing public, one certificate warning
REM     run-tunnel.cmd  anywhere incl. mobile data, real certificate, public URL
REM   cloudflared prints a https://xxxxx.trycloudflare.com URL — open that on
REM   your phone. GPS + motion sensors only work over HTTPS, which this provides.
REM
REM   The URL is PUBLIC while it runs and exposes your dev backend through the
REM   Vite /api proxy. Close it (Ctrl+C) when you're done.

if not exist "%~dp0cloudflared.exe" (
  echo.
  echo   cloudflared.exe not found in this folder.
  echo   Download: https://github.com/cloudflare/cloudflared/releases
  echo.
  pause
  exit /b 1
)
echo Opening an HTTPS tunnel to http://localhost:3000 ...
echo Look for the https://...trycloudflare.com URL below, then open it on your phone.
echo (Ctrl+C to stop the tunnel.)
echo.
"%~dp0cloudflared.exe" tunnel --url http://localhost:3000
