/**
 * Every route in one place, as builders rather than string literals, so a path
 * change is a single edit and typos are a compile error.
 */
export const routes = {
  landing: "/",
  signin: "/signin",

  dashboard: "/dashboard",
  garage: "/garage",
  analytics: "/analytics",
  settings: "/settings",

  createSession: "/sessions/new",
  joinSession: "/sessions/join",
  lobby: (id: number | string) => `/sessions/${id}/lobby`,
  live: (id: number | string) => `/sessions/${id}/live`,
  results: (id: number | string) => `/sessions/${id}/results`,
  replay: (id: number | string) => `/sessions/${id}/replay`,
} as const

/** The four screens that sit inside the persistent sidebar/tab-bar shell. */
export const HUB_ROUTES = [
  routes.dashboard,
  routes.garage,
  routes.analytics,
  routes.settings,
] as string[]
