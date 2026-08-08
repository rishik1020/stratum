@echo off
REM ── Print a quick snapshot of the backend database (no server needed) ──────
cd /d "%~dp0backend"
python snapshot.py
pause
