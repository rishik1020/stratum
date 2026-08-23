import { ReactNode, useRef } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { NavLink, useLocation, useNavigate } from "react-router-dom"
import { useAppStore } from "../store"
import { HUB_ROUTES, routes } from "../routes"
import { useSwipeNav } from "../lib/useSwipeNav"
import { requestRefresh } from "../lib/refresh"
import { PullToRefresh } from "./PullToRefresh"
import { LayoutDashboard, Car, BarChart3, Settings, LogOut } from "lucide-react"
import { Logo } from "./Logo"

interface NavItem {
  to: string
  label: string
  icon: ReactNode
}

const NAV: NavItem[] = [
  { to: routes.dashboard, label: "Dashboard", icon: <LayoutDashboard size={20} /> },
  { to: routes.garage, label: "Garage", icon: <Car size={20} /> },
  { to: routes.analytics, label: "Analytics", icon: <BarChart3 size={20} /> },
  { to: routes.settings, label: "Settings", icon: <Settings size={20} /> },
]

export const Layout = ({ children }: { children: ReactNode }) => {
  const user = useAppStore((s) => s.user)
  const logout = useAppStore((s) => s.logout)
  const navigate = useNavigate()
  const location = useLocation()

  // Swipe between the four tabs on touch devices.
  useSwipeNav()

  // Which way the next screen should come from. Comparing tab indices means a
  // swipe (or a tap two tabs across) animates in the direction you actually
  // travelled, instead of every screen sliding the same way.
  const index = HUB_ROUTES.indexOf(location.pathname)
  const prevIndex = useRef(index)
  const direction = index >= 0 && prevIndex.current >= 0 && index !== prevIndex.current
    ? Math.sign(index - prevIndex.current)
    : 0
  prevIndex.current = index

  const signOut = () => {
    logout()
    navigate(routes.landing, { replace: true })
  }

  return (
    <div className="relative min-h-[100dvh] bg-ink">
      <div className="mesh-dots pointer-events-none fixed inset-0 opacity-40" />

      <div className="relative z-10 min-h-[100dvh] md:flex">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-hairline bg-ink-1">
          <div className="px-6 py-6">
            <Logo size={30} />
          </div>

          <nav className="flex-1 px-3 space-y-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-amber-10 text-amber"
                      : "text-white/45 hover:bg-ink-3 hover:text-white/80"
                  }`
                }
              >
                {item.icon}
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="px-3 pb-4">
            <div className="px-3 py-3 mb-1 rounded-xl border border-hairline bg-ink-2">
              <p className="text-sm font-medium truncate">{user?.display_name || "Driver"}</p>
              <p className="text-xs text-white/40 truncate">@{user?.username || "—"}</p>
            </div>
            <button
              onClick={signOut}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-white/45 transition-colors hover:bg-ink-3 hover:text-white/80"
            >
              <LogOut size={18} />
              Sign out
            </button>
          </div>
        </aside>

        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-40 flex items-center justify-between px-4 pt-safe pb-3 bg-ink/90 backdrop-blur-md">
          <Logo size={26} />
          <button onClick={signOut} className="tap pressable -mr-2 p-2 text-white/50 active:text-white" aria-label="Sign out">
            <LogOut size={18} />
          </button>
        </header>

        {/* Content. pb-nav keeps the last row clear of the floating pill. */}
        <main className="flex-1 overflow-x-hidden pb-nav md:max-h-screen md:overflow-y-auto md:pb-0">
          {/* Slides in from the side you swiped from. mode="popLayout" keeps the
              outgoing screen out of flow so the two never stack and double the
              page height mid-transition. */}
          <PullToRefresh onRefresh={requestRefresh}>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, x: direction === 0 ? 0 : direction * 28 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction === 0 ? 0 : direction * -28 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </PullToRefresh>
        </main>

        {/* Mobile floating pill nav.
            Inset from the edges with its own elevation so it reads as floating
            above the content rather than as docked chrome. Icon-only — labels
            don't fit a compact pill, so each link carries an aria-label and a
            title instead of visible text. */}
        <nav
          aria-label="Primary"
          className="md:hidden fixed inset-x-0 z-40 flex justify-center px-4 pointer-events-none"
          style={{ bottom: "calc(var(--safe-bottom) + 1rem)" }}
        >
          <div className="pointer-events-auto flex items-center gap-1 rounded-pill bg-ink-2/95 backdrop-blur-xl border border-hairline-strong shadow-float px-2 py-2">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                aria-label={item.label}
                title={item.label}
                className={({ isActive }) =>
                  `pressable flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
                    isActive ? "bg-amber text-amber-ink" : "text-white/45 active:text-white/80"
                  }`
                }
              >
                {item.icon}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  )
}
