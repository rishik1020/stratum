@echo off
REM ── Launch backend + frontend, each in its own window ─────────────────────
REM   Double-click this file to bring the whole app up.
start "Stratum Backend"  cmd /k "%~dp0run-backend.cmd"
start "Stratum Frontend" cmd /k "%~dp0run-frontend.cmd"
echo.
echo   Backend:  http://127.0.0.1:8000   (docs: http://127.0.0.1:8000/docs)
echo   Frontend: http://127.0.0.1:3000
echo.
echo   Testing on a phone? This window's frontend is plain HTTP, so a phone can
echo   browse the UI but cannot start a drive (location needs a secure context).
echo     - Same Wi-Fi ... run-phone.cmd            (HTTPS on your LAN address)
echo     - Anywhere ..... run-tunnel.cmd           (public HTTPS tunnel)
echo     - APK .......... run-tunnel-backend.cmd   (HTTPS tunnel to the backend)
echo   See docs/NATIVE_APK.md for which one you want.
echo.
echo   Closing this window does NOT stop the servers (they have their own windows).
echo.
pause
