@echo off
REM ── Launch backend + frontend, each in its own window ─────────────────────
REM   Double-click this file to bring the whole app up.
start "Stratum Backend"  cmd /k "%~dp0run-backend.cmd"
start "Stratum Frontend" cmd /k "%~dp0run-frontend.cmd"
echo.
echo   Backend:  http://127.0.0.1:8000   (docs: http://127.0.0.1:8000/docs)
echo   Frontend: http://127.0.0.1:5173
echo.
echo   To test on a phone over HTTPS, also run:  run-tunnel.cmd
echo   Closing this window does NOT stop the servers (they have their own windows).
echo.
pause
