import { ReactNode } from "react"
import { useAppStore } from "../store"
import { LayoutDashboard, Car, BarChart3, Settings, LogOut } from "lucide-react"
import { AuroraBackground } from "../landing/AuroraBackground"
import { Logo } from "../landing/ui"

interface NavItem {
  key: string
  label: string
  icon: ReactNode
}

const NAV: NavItem[] = [
  { key: "home", label: "Dashboard", icon: <LayoutDashboard size={20} /> },
  { key: "garage", label: "Garage", icon: <Car size={20} /> },
  { key: "analytics", label: "Analytics", icon: <BarChart3 size={20} /> },
  { key: "settings", label: "Settings", icon: <Settings size={20} /> },
]

export const Layout = ({
  current,
  onNavigate,
  children,
}: {
  current: string
  onNavigate: (screen: string) => void
  children: ReactNode
}) => {
  const user = useAppStore((s) => s.user)
  const logout = useAppStore((s) => s.logout)

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
            {NAV.map((item) => {
              const active = current === item.key
              return (
                <button
                  key={item.key}
                  onClick={() => onNavigate(item.key)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-sm transition-colors ${
                    active
                      ? "bg-stratum-violet/12 text-white border border-stratum-violet/25"
                      : "text-white/45 border border-transparent hover:bg-white/[0.04] hover:text-white/80"
                  }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              )
            })}
          </nav>

          <div className="px-3 pb-4">
            <div className="px-3 py-3 mb-1 rounded-lg border border-white/[0.06] bg-white/[0.02]">
              <p className="text-sm font-medium truncate">{user?.display_name || "Driver"}</p>
              <p className="text-xs text-white/40 truncate">@{user?.username || "—"}</p>
            </div>
            <button
              onClick={() => logout()}
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
          <button onClick={() => logout()} className="-mr-2 p-2 text-white/50 active:text-white" aria-label="Sign out">
            <LogOut size={18} />
          </button>
        </header>

        {/* Content (leaves room for the fixed bottom nav on mobile) */}
        <main className="flex-1 md:overflow-y-auto md:max-h-screen pb-24 md:pb-0">{children}</main>

        {/* Mobile bottom tab bar */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 grid grid-cols-4 border-t border-white/[0.06] bg-stratum-darker/90 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]">
          {NAV.map((item) => {
            const active = current === item.key
            return (
              <button
                key={item.key}
                onClick={() => onNavigate(item.key)}
                className={`flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] font-medium transition-colors ${
                  active ? "text-stratum-violet" : "text-white/45 active:text-white/80"
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
