@echo off
REM ── Run Stratum for testing on a phone, over your own Wi-Fi ───────────────
REM
REM   Double-click this instead of run-all.cmd when you want to open Stratum on
REM   your phone and actually record a drive.
REM
REM   Why a separate script: location, the screen wake lock and the motion
REM   sensors are all gated on a SECURE CONTEXT. http://localhost counts as one;
REM   http://192.168.x.x does not. So the ordinary frontend (run-frontend.cmd)
REM   lets a phone browse the whole UI but not start a drive — the browser
REM   refuses with "Only secure origins are allowed".
REM
REM   This serves the frontend over HTTPS with a self-signed certificate, which
REM   makes the LAN address a secure context. Your phone will warn once about
REM   the certificate: tap Advanced, then Proceed. That warning is expected.
REM
REM   Same Wi-Fi only. To reach it from mobile data or someone else's phone, use
REM   run-tunnel.cmd instead (public URL, real certificate, no warning).

start "Stratum Backend"  cmd /k "%~dp0run-backend.cmd"

REM Give the backend a moment so the first page load has an API to talk to.
timeout /t 3 /nobreak >nul

start "Stratum Frontend (HTTPS)" cmd /k "cd /d ""%~dp0stratum-web-react"" && npm run dev:https"

echo.
echo   Backend:  http://127.0.0.1:8000   (docs: http://127.0.0.1:8000/docs)
echo   Laptop:   https://localhost:3000
echo.
echo   On your phone, open ONE of these (same Wi-Fi):
echo.
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
  for /f "tokens=* delims= " %%b in ("%%a") do echo       https://%%b:3000
)
echo.
echo   The certificate warning is expected - tap Advanced, then Proceed.
echo   Sign in with:  driver@stratum.app  /  stratum1234
echo.
echo   Closing this window does NOT stop the servers (they have their own windows).
echo.
pause
