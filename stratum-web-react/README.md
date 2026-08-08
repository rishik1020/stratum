# Stratum Web MVP - React Edition

A modern, responsive web frontend for Stratum built with React, TypeScript, and Tailwind CSS.

## Install dependencies

```bash
cd stratum-web-react
npm install
```

## Run locally

```bash
npm run dev
```

The app will start at `http://localhost:3000` and connects to the backend at `http://127.0.0.1:8000`.

## Build for production

```bash
npm run build
```

## Features

- Authentication (signup/login)
- Create and join sprint sessions
- Live lobby with participant tracking
- Real-time leaderboard and session dashboard
- Results and shareable session cards
- Premium dark automotive UI
- Responsive design

## Next steps

- Add WebSocket integration for live telemetry
- Connect to real GPS location data
- Add vehicle profile management
- Implement friend system and notifications
- Add persistent session state with Redis
