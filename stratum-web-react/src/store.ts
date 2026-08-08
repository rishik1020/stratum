import { create } from "zustand"

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
  activeVehicle: Vehicle | null
  currentSession: Session | null
  units: Units
  replaySessionId: number | null
  analyticsFilter: SessionFilter

  setToken: (token: string) => void
  setUser: (user: User) => void
  setVehicles: (vehicles: Vehicle[]) => void
  setActiveVehicle: (vehicle: Vehicle) => void
  setCurrentSession: (session: Session | null) => void
  setUnits: (units: Units) => void
  setReplaySessionId: (id: number | null) => void
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
  activeVehicle: null,
  currentSession: loadSession(),
  units: (localStorage.getItem("units") as Units) || "kmh",
  replaySessionId: null,
  analyticsFilter: "all",

  setToken: (token: string) => {
    localStorage.setItem("token", token)
    set({ token })
  },

  setUser: (user: User) => set({ user }),

  setVehicles: (vehicles: Vehicle[]) => {
    set({ vehicles })
    const active = vehicles.find((v) => v.is_active)
    if (active) set({ activeVehicle: active })
  },

  setActiveVehicle: (vehicle: Vehicle) => set({ activeVehicle: vehicle }),

  setUnits: (units: Units) => {
    localStorage.setItem("units", units)
    set({ units })
  },

  setReplaySessionId: (id: number | null) => set({ replaySessionId: id }),

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
    localStorage.removeItem("token")
    localStorage.removeItem("currentSession")
    set({ token: null, user: null, currentSession: null })
  },
}))
