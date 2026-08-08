import axios from "axios"

// Default to same-origin "/api", which the Vite dev server proxies to the backend
// (HTTP + WebSocket). This makes a single HTTPS tunnel to the frontend "just work"
// on a phone — no second tunnel, no CORS, no mixed content. Set VITE_API_BASE_URL
// to an absolute URL to talk to a backend directly instead.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api"

// WebSocket origin. With the proxy default, derive it from the page origin (so it
// inherits https→wss on a tunnel); with an absolute override, swap http→ws.
const wsBase = () => {
  const override = import.meta.env.VITE_API_BASE_URL
  if (override) return override.replace(/^http/, "ws")
  const proto = window.location.protocol === "https:" ? "wss" : "ws"
  return `${proto}://${window.location.host}/api`
}

export const sessionSocketUrl = (sessionId: number, token: string) =>
  `${wsBase()}/ws/sessions/${sessionId}?token=${encodeURIComponent(token)}`

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
    // ngrok's free tier serves an HTML browser-warning interstitial to plain
    // requests; this header makes it pass the API call straight through so we
    // get JSON back instead of a warning page.
    "ngrok-skip-browser-warning": "true",
  },
})

// Called when the server rejects our token. Registered by the store (which
// can't be imported here — it imports this module).
let onUnauthorized: (() => void) | null = null
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn
}

// A stored token that the server no longer accepts — expired, or the account is
// gone — used to leave the app wedged: every request failed, the errors were
// swallowed, and the user sat on a "Loading…" screen forever with no way out
// short of clearing site data. Treat it as a sign-out instead.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status
    const url: string = error?.config?.url ?? ""
    // /auth/login answers 401 for a wrong password — that's a failed sign-in
    // attempt, not an expired session, and must not trigger a sign-out.
    if (status === 401 && !url.startsWith("/auth/")) {
      onUnauthorized?.()
    }
    return Promise.reject(error)
  }
)

// Turn an axios error into a message a driver can act on — distinguishing
// "can't reach the server" (backend/tunnel down) from a real API rejection.
export const errorMessage = (err: any, fallback = "Something went wrong"): string => {
  if (err?.response) {
    // Server answered — use its detail, or a status-specific hint.
    const detail = err.response.data?.detail
    if (typeof detail === "string") return detail
    if (err.response.status === 401) return "Incorrect email or password."
    return `Server error (${err.response.status}).`
  }
  if (err?.request) {
    // Request sent, no response — network/DNS/tunnel problem.
    return "Can't reach the Stratum server. Check your connection, and that the backend + tunnel are running."
  }
  return fallback
}

export const setAuthToken = (token: string) => {
  if (token) {
    api.defaults.headers.common["Authorization"] = `Bearer ${token}`
    localStorage.setItem("token", token)
  } else {
    delete api.defaults.headers.common["Authorization"]
    localStorage.removeItem("token")
  }
}

const savedToken = localStorage.getItem("token")
if (savedToken) {
  setAuthToken(savedToken)
}

export const auth = {
  signup: (email: string, username: string, displayName: string, password: string) =>
    api.post("/auth/signup", { email, username, display_name: displayName, password }),
  login: (email: string, password: string) =>
    api.post("/auth/login", { email, password }),
}

export const user = {
  getProfile: () => api.get("/users/me"),
  updateProfile: (data: any) => api.patch("/users/me", data),
  mySessions: () => api.get("/users/me/sessions"),
  stats: (days: number) => api.get(`/users/me/stats?days=${days}`),
}

export const vehicles = {
  list: () => api.get("/vehicles"),
  create: (data: any) => api.post("/vehicles", data),
  activate: (vehicleId: number) => api.post(`/vehicles/${vehicleId}/activate`),
  remove: (vehicleId: number) => api.delete(`/vehicles/${vehicleId}`),
}

export const drives = {
  start: () => api.post("/drives"),
}

export const sessions = {
  create: (data: any) => api.post("/sessions", data),
  getById: (id: number) => api.get(`/sessions/${id}`),
  getByRoom: (roomCode: string) => api.get(`/sessions/room/${roomCode}`),
  join: (roomCode: string) => api.post("/sessions/join", { room_code: roomCode }),
  leave: (id: number) => api.post(`/sessions/${id}/leave`),
  ready: (id: number) => api.post(`/sessions/${id}/ready`),
  start: (id: number) => api.post(`/sessions/${id}/start`),
  end: (id: number) => api.post(`/sessions/${id}/end`),
  participants: (id: number) => api.get(`/sessions/${id}/participants`),
  results: (id: number) => api.get(`/sessions/${id}/results`),
  telemetry: (id: number) => api.get(`/sessions/${id}/telemetry`),
  driveAnalytics: (id: number) => api.get(`/sessions/${id}/drive-analytics`),
  remove: (id: number) => api.delete(`/sessions/${id}`),
}
