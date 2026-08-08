@echo off
REM ── Start the Stratum backend (FastAPI + SQLite) ──────────────────────────
REM   API:  http://127.0.0.1:8000     Interactive docs: http://127.0.0.1:8000/docs
REM   --reload restarts automatically when you edit backend code.
cd /d "%~dp0backend"
set STRATUM_SECRET_KEY=dev-local-key
echo Starting backend on http://127.0.0.1:8000  (Ctrl+C to stop)
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
