import { ReactNode } from "react"
import { NavLink, useNavigate } from "react-router-dom"
import { useAppStore } from "../store"
import { routes } from "../routes"
import { LayoutDashboard, Car, BarChart3, Settings, LogOut } from "lucide-react"
import { AuroraBackground } from "../landing/AuroraBackground"
import { Logo } from "../landing/ui"

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

  const signOut = () => {
    logout()
    navigate(routes.landing, { replace: true })
  }

  return (
    <div className="relative min-h-[100dvh] bg-stratum-darker">
      <AuroraBackground className="opacity-70" />

      <div className="relative z-10 min-h-[100dvh] md:flex">
        {/* Desktop sidebar */}
        <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-white/[0.06] bg-stratum-darker/40 backdrop-blur-md">
          <div className="px-6 py-6">
            <Logo size={30} />
          </div>

          <nav className="flex-1 px-3 space-y-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-sm transition-colors ${
                    isActive
                      ? "bg-stratum-violet/12 text-white border border-stratum-violet/25"
                      : "text-white/45 border border-transparent hover:bg-white/[0.04] hover:text-white/80"
                  }`
                }
              >
                {item.icon}
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="px-3 pb-4">
            <div className="px-3 py-3 mb-1 rounded-lg border border-white/[0.06] bg-white/[0.02]">
              <p className="text-sm font-medium truncate">{user?.display_name || "Driver"}</p>
              <p className="text-xs text-white/40 truncate">@{user?.username || "—"}</p>
            </div>
            <button
              onClick={signOut}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-sm text-white/45 hover:bg-white/[0.04] hover:text-white/80 transition-colors"
            >
              <LogOut size={18} />
              Sign out
            </button>
          </div>
        </aside>

        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-40 flex items-center justify-between px-4 pt-safe pb-3 border-b border-white/[0.06] bg-stratum-darker/80 backdrop-blur-md">
          <Logo size={26} />
          <button onClick={signOut} className="-mr-2 p-2 text-white/50 active:text-white" aria-label="Sign out">
            <LogOut size={18} />
          </button>
        </header>

        {/* Content (leaves room for the fixed bottom nav on mobile) */}
        <main className="flex-1 md:overflow-y-auto md:max-h-screen pb-24 md:pb-0">{children}</main>

        {/* Mobile bottom tab bar */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 grid grid-cols-4 border-t border-white/[0.06] bg-stratum-darker/90 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium transition-colors ${
                  isActive ? "text-stratum-violet" : "text-white/45 active:text-white/80"
                }`
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
