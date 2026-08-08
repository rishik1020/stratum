# Stratum Web

React + TypeScript + Tailwind frontend, also the source for the Capacitor
Android/iOS shells. See the [root README](../README.md) for the module layout.

## Install dependencies

```bash
cd stratum-web-react
npm install
```

## Run locally

```bash
npm run dev
```

Starts at `http://localhost:3000`. Requests go to same-origin `/api`, which Vite
proxies to the backend on `:8000` — HTTP and the telemetry WebSocket both.

## Build for production

```bash
npm run build
```

Reads `VITE_API_BASE_URL` from `.env.production` — there's no dev proxy outside
`npm run dev`, so a built app needs an absolute backend URL.

## Lint

```bash
npm run lint
```

## Features

- Authentication (signup/login)
- Garage — cascading make/model/year/trim picker with editable specs
- Create and join sprint sessions, plus solo tracked drives
- Live lobby and leaderboard pushed over WebSocket
- Live map with eased avatar pins, telemetry HUD (speed / altitude / g-force)
- Session replay with interpolated playback and a scrubber
- Analytics: Drive Score, coach insights, trends, personal bests
- Deep-linkable routes, km/h ↔ mph, responsive down to phone widths

## Next steps

- Native geolocation via `@capacitor/geolocation` for higher-frequency fixes
- Background location so drives keep recording with the screen off
- Stream 3-axis accelerometer instead of a single g-force scalar, which would
  unlock a friction-circle (g-g) plot
