@echo off
REM ── Expose the local app over HTTPS for phone testing ─────────────────────
REM   Start the frontend FIRST (run-frontend.cmd or run-all.cmd), THEN run this.
REM   cloudflared prints a https://xxxxx.trycloudflare.com URL — open that on
REM   your phone. GPS + motion sensors only work over HTTPS, which this provides.
echo Opening an HTTPS tunnel to http://localhost:5173 ...
echo Look for the https://...trycloudflare.com URL below, then open it on your phone.
echo (Ctrl+C to stop the tunnel.)
echo.
"%~dp0cloudflared.exe" tunnel --url http://localhost:5173
