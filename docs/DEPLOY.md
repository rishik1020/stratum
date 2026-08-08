# Deploying Stratum — backend to the cloud, app to phones

The APK/IPA works "on all phones, anytime" only when the backend is reachable
without your PC. This deploys the FastAPI backend to **Render** (free tier) with a
managed Postgres, then points the app at the permanent URL.

Everything in the codebase is already prepared for this:
- `backend/app/database.py` uses `DATABASE_URL` (Postgres) when present, SQLite otherwise.
- `backend/requirements.txt` includes the Postgres driver.
- `backend/render.yaml` provisions the web service **and** the database.
- `backend/migrations/` runs on startup, against Postgres as well as SQLite.
- CORS already allows the Capacitor app origins (`https://localhost`, `capacitor://localhost`).

---

## Step 1 — Push to GitHub (one-time)

Render deploys from a Git repo. This project is already a local repo with a
`.gitignore` that keeps the tunnel binaries, `node_modules`, build output and
the local database out of history — so you only need a remote:

```bash
cd "Stratum"
# create an empty repo on github.com first, then:
git remote add origin https://github.com/<you>/stratum.git
git branch -M main
git push -u origin main
```

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
- **Set `STRATUM_SECRET_KEY`.** The blueprint generates one. Without it the app
  falls back to a known dev key and logs a warning — anyone could forge a token.

---

## Schema changes

Migrations run automatically at startup (`create_db_and_tables` → `alembic
upgrade head`), so a deploy applies them with no extra step.

To add one after changing `models.py`:

```bash
cd backend
python -m alembic revision --autogenerate -m "what changed"
# read the generated file in migrations/versions/ before committing it
python -m alembic upgrade head    # applies locally; the deploy does its own
```

Two things autogenerate gets wrong here, both worth checking:

- **`user` ↔ `vehicle` is a foreign-key cycle** (`user.active_vehicle_id` and
  `vehicle.user_id`). Autogenerate will happily emit a `CREATE TABLE user` that
  references `vehicle` before it exists. SQLite allows it; Postgres rejects it.
  See `0001_baseline.py` for the shape that works.
- **SQLite can't `ALTER` most things in place.** `render_as_batch` is on in
  `migrations/env.py`, which rebuilds the table instead — keep it.

A database created before Alembic existed (tables present, no `alembic_version`)
is stamped at the baseline on first startup and carried forward from there, so
adopting migrations doesn't recreate anything.
