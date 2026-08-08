import { create } from "zustand"
import { setAuthToken, setUnauthorizedHandler } from "./api"

interface User {
  id: number
  email: string
  username: string
  display_name: string
  bio?: string
  profile_picture_url?: string
  total_sessions: number
  total_distance_m: number
  total_wins: number
  top_speed_kmh: number
}

interface Vehicle {
  id: number
  user_id: number
  manufacturer: string
  model: string
  year: number
  horsepower: number
  is_active: boolean
}

interface Session {
  id: number
  host_user_id: number
  name: string
  room_code: string
  visibility: string
  max_players: number
  is_solo?: boolean
  status: string
  created_at: string
  started_at?: string
  ended_at?: string
}

type Units = "kmh" | "mph"
export type SessionFilter = "all" | "wins" | "podiums"

interface AppStore {
  token: string | null
  user: User | null
  vehicles: Vehicle[]
  currentSession: Session | null
  units: Units
  analyticsFilter: SessionFilter

  setToken: (token: string) => void
  setUser: (user: User) => void
  setVehicles: (vehicles: Vehicle[]) => void
  setCurrentSession: (session: Session | null) => void
  setUnits: (units: Units) => void
  setAnalyticsFilter: (filter: SessionFilter) => void
  logout: () => void
}

const loadSession = (): Session | null => {
  const raw = localStorage.getItem("currentSession")
  if (!raw) return null
  try {
    return JSON.parse(raw) as Session
  } catch {
    return null
  }
}

export const useAppStore = create<AppStore>((set) => ({
  token: localStorage.getItem("token"),
  user: null,
  vehicles: [],
  currentSession: loadSession(),
  units: (localStorage.getItem("units") as Units) || "kmh",
  analyticsFilter: "all",

  // setAuthToken owns both the Authorization header and localStorage, so the
  // token has exactly one writer. Previously the store and api.ts each wrote
  // localStorage, and logging out cleared storage while leaving the header set
  // on the axios instance for the rest of the page's life.
  setToken: (token: string) => {
    setAuthToken(token)
    set({ token })
  },

  setUser: (user: User) => set({ user }),

  setVehicles: (vehicles: Vehicle[]) => set({ vehicles }),

  setUnits: (units: Units) => {
    localStorage.setItem("units", units)
    set({ units })
  },

  setAnalyticsFilter: (filter: SessionFilter) => set({ analyticsFilter: filter }),

  setCurrentSession: (session: Session | null) => {
    if (session) {
      localStorage.setItem("currentSession", JSON.stringify(session))
    } else {
      localStorage.removeItem("currentSession")
    }
    set({ currentSession: session })
  },

  logout: () => {
    setAuthToken("")
    localStorage.removeItem("currentSession")
    set({ token: null, user: null, vehicles: [], currentSession: null })
  },
}))

// A rejected token signs the user out, which drops them back to the landing
// page via the route guards rather than stranding them on a loading screen.
setUnauthorizedHandler(() => {
  if (useAppStore.getState().token) useAppStore.getState().logout()
})
