@echo off
REM ── Stable HTTPS tunnel via ngrok (SAME URL every time) ───────────────────
REM
REM ONE-TIME SETUP:
REM   1. Download ngrok and put ngrok.exe in THIS folder:
REM        https://ngrok.com/download   (Windows, then unzip ngrok.exe here)
REM   2. Register your authtoken once (stored privately on your PC, not here):
REM        ngrok.exe config add-authtoken YOUR_AUTHTOKEN
REM   3. ngrok dashboard -> "Domains" -> copy your free static domain
REM      (looks like  abcd-12-34.ngrok-free.app ), then put it below.
REM
REM EVERY TIME:
REM   - Start the app first (run-all.cmd), THEN double-click this file.
REM   - You'll always get the same https URL -> open it on your phone.

REM >>> EDIT THIS LINE with your ngrok static domain <<<
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
echo   Stable tunnel:  https://%NGROK_DOMAIN%   ->  http://localhost:5173
echo   (Ctrl+C to stop.)
echo.
ngrok.exe http --domain=%NGROK_DOMAIN% 5173
