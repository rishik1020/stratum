/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Base URL of the Stratum backend. Defaults to http://127.0.0.1:8000 for local
  // dev; set this (in a .env file) to the host machine's LAN IP or public/tunnel
  // URL so phones and other devices can reach the API. See README.
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
