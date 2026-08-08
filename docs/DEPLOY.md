# Deploying Stratum — backend to the cloud, app to phones

The APK/IPA works "on all phones, anytime" only when the backend is reachable
without your PC. This deploys the FastAPI backend to **Render** (free tier) with a
managed Postgres, then points the app at the permanent URL.

Everything in the codebase is already prepared for this:
- `backend/app/database.py` uses `DATABASE_URL` (Postgres) when present, SQLite otherwise.
- `backend/requirements.txt` includes the Postgres driver.
- `backend/render.yaml` provisions the web service **and** the database.
- CORS already allows the Capacitor app origins (`https://localhost`, `capacitor://localhost`).

---

## Step 1 — Put the project on GitHub (one-time)

Render deploys from a Git repo, and this project isn't one yet.

```bash
cd "Stratum"
git init
git add .
git commit -m "Stratum: native app + deploy-ready backend"
# create an empty repo on github.com first, then:
git remote add origin https://github.com/<you>/stratum.git
git branch -M main
git push -u origin main
```

> `cloudflared.exe` and `ngrok.exe` are large (~90 MB total). Add a `.gitignore`
> for them and `node_modules`, `dist`, `android/`, `ios/build/`, `*.db` before the
> first commit to keep the repo lean. (Ask me and I'll generate the `.gitignore`.)

## Step 2 — Deploy on Render

1. Create a free account at <https://render.com> and connect your GitHub.
2. **New + → Blueprint**, pick the repo. Render reads `backend/render.yaml` and
   shows a web service (`stratum-api`) + a Postgres (`stratum-db`).
3. Click **Apply**. First build takes a few minutes. When done you'll get a URL
   like `https://stratum-api.onrender.com`.
4. Sanity check: open `https://stratum-api.onrender.com/docs` — the Swagger UI
   should load.

`STRATUM_SECRET_KEY` and `DATABASE_URL` are set automatically by the blueprint.

## Step 3 — Point the app at the deployed backend

Edit `stratum-web-react/.env.production`:

```
VITE_API_BASE_URL=https://stratum-api.onrender.com
```

Then rebuild the apps:

```bash
cd stratum-web-react
npm run build
npx cap sync android      # (and: npx cap sync ios, on a Mac)
cd android && gradlew.bat assembleDebug
```

Install the new APK. Login now works from **any phone, on mobile data**, with no
PC or tunnel running.

---

## Notes & caveats (be aware)

- **Free tier sleeps.** Render's free web service spins down after ~15 min idle;
  the next request cold-starts in ~30–60 s. Fine for a demo, not for production.
- **Free Postgres expires.** Render's free database is time-limited; upgrade or
  re-provision when it lapses. Data lives only in Postgres now, so don't rely on
  it for anything you can't recreate.
- **WebSockets** work on Render web services (live telemetry is fine), but the
  in-memory room manager means **one instance only** — don't scale to 2+ workers
  without moving rooms to Redis.
- **HTTPS is automatic** on Render, so `wss://` live telemetry works out of the box.
