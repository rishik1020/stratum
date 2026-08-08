import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { useAppStore } from "../store"
import { user as userApi, vehicles as vehiclesApi, drives as drivesApi } from "../api"
import { Plus, Users, Car, Navigation } from "lucide-react"
import { staggerParent, staggerChild } from "../landing/ui"

export const HomeScreen = ({ onNavigate }: { onNavigate: (screen: string) => void }) => {
  const [loading, setLoading] = useState(!useAppStore.getState().user)
  const user = useAppStore((s) => s.user)
  const vehicles = useAppStore((s) => s.vehicles)
  const setUser = useAppStore((s) => s.setUser)
  const setAnalyticsFilter = useAppStore((s) => s.setAnalyticsFilter)
  const setCurrentSession = useAppStore((s) => s.setCurrentSession)
  const [starting, setStarting] = useState(false)

  const startSolo = async () => {
    setStarting(true)
    try {
      const res = await drivesApi.start()
      setCurrentSession(res.data)
      onNavigate("live")
    } catch (err) {
      console.error(err)
      setStarting(false)
    }
  }

  // Tapping a stat jumps to Analytics, pre-filtered (e.g. Wins → won sprints).
  const openHistory = (filter: "all" | "wins" | "podiums") => {
    setAnalyticsFilter(filter)
    onNavigate("analytics")
  }

  useEffect(() => {
    const loadData = async () => {
      try {
        const res = await userApi.getProfile()
        setUser(res.data)
        const vehiclesRes = await vehiclesApi.list()
        useAppStore.setState({ vehicles: vehiclesRes.data })
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const hasActiveVehicle = vehicles.some((v) => v.is_active)

  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>

  const statCard = "card text-left transition-colors hover:bg-white/[0.05] hover:border-white/15 active:bg-white/[0.07]"

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-5xl mx-auto">
      <div className="mb-8 md:mb-10">
        <span className="eyebrow">Dashboard</span>
        <h2 className="display text-3xl sm:text-4xl md:text-5xl mt-2 mb-6 md:mb-8">Welcome back, {user?.display_name}</h2>
        <motion.div variants={staggerParent} initial="hidden" animate="show" className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <motion.button variants={staggerChild} whileHover={{ y: -4 }} onClick={() => openHistory("all")} className={statCard}>
            <span className="eyebrow">Sessions</span>
            <strong className="stat-num text-3xl font-medium block mt-2">{user?.total_sessions ?? 0}</strong>
            <span className="text-[11px] text-white/35 mt-1 block">View history →</span>
          </motion.button>
          <motion.button variants={staggerChild} whileHover={{ y: -4 }} onClick={() => openHistory("wins")} className={statCard}>
            <span className="eyebrow">Wins</span>
            <strong className="stat-num text-3xl font-medium block mt-2">{user?.total_wins ?? 0}</strong>
            <span className="text-[11px] text-white/35 mt-1 block">View wins →</span>
          </motion.button>
          <motion.button variants={staggerChild} whileHover={{ y: -4 }} onClick={() => openHistory("all")} className={statCard}>
            <span className="eyebrow">Top Speed</span>
            <strong className="stat-num text-3xl font-medium block mt-2">
              {user?.top_speed_kmh ?? 0}
              <span className="text-base text-white/40 ml-1.5">km/h</span>
            </strong>
          </motion.button>
          <motion.button variants={staggerChild} whileHover={{ y: -4 }} onClick={() => openHistory("all")} className={statCard}>
            <span className="eyebrow">Distance</span>
            <strong className="stat-num text-3xl font-medium block mt-2">
              {((user?.total_distance_m || 0) / 1000).toFixed(1)}
              <span className="text-base text-white/40 ml-1.5">km</span>
            </strong>
          </motion.button>
        </motion.div>
      </div>

      {!hasActiveVehicle && (
        <button
          onClick={() => onNavigate("garage")}
          className="card w-full mb-8 flex items-center justify-between border-stratum-violet/30 hover:bg-white/[0.05] transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <Car size={22} className="text-stratum-violet" />
            <div>
              <strong className="block font-medium">Set up your garage</strong>
              <span className="text-sm text-white/50">Add and activate a vehicle to start racing.</span>
            </div>
          </div>
          <span className="text-stratum-violet font-medium text-sm">Go →</span>
        </button>
      )}

      <button
        onClick={startSolo}
        disabled={!hasActiveVehicle || starting}
        className="card w-full mb-4 md:mb-6 flex items-center justify-between text-left bg-stratum-violet/10 border-stratum-violet/30 hover:bg-stratum-violet/[0.16] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <div className="flex items-center gap-3">
          <Navigation size={22} className="text-stratum-violet" />
          <div>
            <strong className="block font-medium">{starting ? "Starting…" : "Start a solo drive"}</strong>
            <span className="text-sm text-white/50">Track a drive — speed, route & score. No opponents.</span>
          </div>
        </div>
        <span className="text-stratum-violet font-medium text-sm shrink-0 ml-2">Go →</span>
      </button>

      <div className="grid grid-cols-2 gap-4 md:gap-6">
        <button
          onClick={() => onNavigate("createSession")}
          disabled={!hasActiveVehicle}
          className="card hover:bg-white/[0.05] hover:border-white/15 transition-colors h-40 md:h-48 flex flex-col justify-between group disabled:opacity-40 disabled:cursor-not-allowed text-left"
        >
          <div>
            <span className="eyebrow">Quick action</span>
            <h3 className="text-2xl font-medium mt-2">Create Sprint</h3>
          </div>
          <Plus size={28} className="text-white/40 group-hover:text-stratum-violet transition-colors" />
        </button>

        <button
          onClick={() => onNavigate("joinSession")}
          disabled={!hasActiveVehicle}
          className="card hover:bg-white/[0.05] hover:border-white/15 transition-colors h-40 md:h-48 flex flex-col justify-between group disabled:opacity-40 disabled:cursor-not-allowed text-left"
        >
          <div>
            <span className="eyebrow">Join a session</span>
            <h3 className="text-2xl font-medium mt-2">Join by Code</h3>
          </div>
          <Users size={28} className="text-white/40 group-hover:text-stratum-violet transition-colors" />
        </button>
      </div>
    </div>
  )
}
