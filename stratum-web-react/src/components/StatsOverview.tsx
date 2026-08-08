import { useEffect, useState } from "react"
import { useAppStore } from "../store"
import { user as userApi } from "../api"
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts"

interface Stats {
  range_days: number
  totals: { distance_m: number; drives: number; moving_time_s: number }
  deltas: { distance_pct: number | null; drives_pct: number | null; time_pct: number | null }
  trend: { label: string; distance_m: number; overall_score: number | null }[]
  score_trend: { label: string; overall: number; safety: number; eco: number; comfort: number; performance: number }[]
  personal_bests: { top_speed_kmh: number; longest_distance_m: number; best_avg_speed_kmh: number; best_overall_score: number | null }
  by_vehicle: { vehicle_id: number; label: string; drives: number; distance_m: number; top_speed_kmh: number }[]
}

const GOLD = "#8b5cf6"
const SCORE_LINES = [
  { key: "overall", color: "#8b5cf6" },
  { key: "safety", color: "#a3e635" },
  { key: "eco", color: "#34d399" },
  { key: "comfort", color: "#c084fc" },
  { key: "performance", color: "#d946ef" },
]
const RANGES = [
  { d: 7, l: "7D" },
  { d: 30, l: "30D" },
  { d: 90, l: "90D" },
  { d: 0, l: "All" },
]

const tooltipStyle = {
  background: "#14121f",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 12,
  color: "#fff",
  fontSize: 12,
}
const axisProps = { stroke: "rgba(255,255,255,0.4)", tick: { fontSize: 11 } }

const Delta = ({ pct }: { pct: number | null | undefined }) =>
  pct == null ? (
    <span className="text-xs text-white/30">— vs prev</span>
  ) : (
    <span className={`text-xs font-medium ${pct >= 0 ? "text-emerald-400/80" : "text-red-400/80"}`}>
      {pct >= 0 ? "▲" : "▼"} {Math.abs(pct)}% vs prev
    </span>
  )

const Best = ({ label, value, unit }: { label: string; value: string; unit?: string }) => (
  <div className="bg-white/[0.03] border border-white/8 rounded-lg px-4 py-3">
    <span className="eyebrow">{label}</span>
    <strong className="stat-num text-xl font-medium block mt-1">
      {value}
      {unit && <span className="text-sm text-white/40 ml-1">{unit}</span>}
    </strong>
  </div>
)

/**
 * Dashboard overview: time-range KPIs with period deltas, a distance sparkline,
 * all-time personal bests, a per-vehicle breakdown, and the Driving Score trend.
 * Reads the cheap pre-aggregated /users/me/stats snapshot.
 */
export const StatsOverview = ({ refreshKey = 0 }: { refreshKey?: number }) => {
  const units = useAppStore((s) => s.units)
  const mph = units === "mph"
  const speedUnit = mph ? "mph" : "km/h"
  const distUnit = mph ? "mi" : "km"
  const toSpeed = (k: number) => Math.round(mph ? k * 0.621371 : k)
  const toDist = (m: number) => +(m / 1000 * (mph ? 0.621371 : 1)).toFixed(1)

  const [days, setDays] = useState(30)
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    userApi.stats(days).then((r) => setStats(r.data)).catch(() => setStats(null))
  }, [days, refreshKey])

  const fmtTime = (s: number) => {
    const h = Math.floor(s / 3600)
    const m = Math.round((s % 3600) / 60)
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }

  return (
    <div className="space-y-6">
      {/* Range selector */}
      <div className="flex items-center justify-between gap-2">
        <span className="eyebrow">Overview</span>
        <div className="flex gap-1 rounded-lg bg-white/[0.03] border border-white/8 p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.d}
              onClick={() => setDays(r.d)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                days === r.d ? "bg-white/[0.08] text-white" : "text-white/45 hover:text-white/80"
              }`}
            >
              {r.l}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        <div className="card">
          <span className="eyebrow">Distance</span>
          <strong className="stat-num text-2xl md:text-3xl font-medium block mt-2">
            {toDist(stats?.totals.distance_m || 0)} <span className="text-sm text-white/40">{distUnit}</span>
          </strong>
          <div className="mt-1.5">
            <Delta pct={stats?.deltas.distance_pct} />
          </div>
        </div>
        <div className="card">
          <span className="eyebrow">Drives</span>
          <strong className="stat-num text-2xl md:text-3xl font-medium block mt-2">{stats?.totals.drives ?? 0}</strong>
          <div className="mt-1.5">
            <Delta pct={stats?.deltas.drives_pct} />
          </div>
        </div>
        <div className="card">
          <span className="eyebrow">Active time</span>
          <strong className="stat-num text-2xl md:text-3xl font-medium block mt-2">{fmtTime(stats?.totals.moving_time_s || 0)}</strong>
          <div className="mt-1.5">
            <Delta pct={stats?.deltas.time_pct} />
          </div>
        </div>
      </div>

      {/* Distance sparkline */}
      {stats && stats.trend.length > 1 && (
        <div className="card">
          <h3 className="font-semibold mb-3 text-sm">Distance per drive ({distUnit})</h3>
          <div className="h-28">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.trend.map((t) => ({ label: t.label, d: toDist(t.distance_m) }))} margin={{ top: 5, right: 6, bottom: 0, left: -24 }}>
                <defs>
                  <linearGradient id="distFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={GOLD} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" {...axisProps} tick={{ fontSize: 10 }} />
                <YAxis {...axisProps} width={28} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="d" name={distUnit} stroke={GOLD} strokeWidth={2} fill="url(#distFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Personal bests */}
      <div className="card">
        <h3 className="font-semibold mb-4">Personal bests</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Best label="Top speed" value={`${toSpeed(stats?.personal_bests.top_speed_kmh || 0)}`} unit={speedUnit} />
          <Best label="Longest" value={`${toDist(stats?.personal_bests.longest_distance_m || 0)}`} unit={distUnit} />
          <Best label="Best avg" value={`${toSpeed(stats?.personal_bests.best_avg_speed_kmh || 0)}`} unit={speedUnit} />
          <Best label="Best score" value={stats?.personal_bests.best_overall_score != null ? `${stats.personal_bests.best_overall_score}` : "—"} />
        </div>
      </div>

      {/* By vehicle */}
      {stats && stats.by_vehicle.length > 0 && (
        <div className="card">
          <h3 className="font-semibold mb-4">By vehicle</h3>
          <ul className="space-y-2">
            {stats.by_vehicle.map((v) => (
              <li key={v.vehicle_id} className="flex items-center justify-between bg-white/[0.03] border border-white/8 rounded-lg px-4 py-3">
                <div className="min-w-0">
                  <strong className="block font-medium truncate">{v.label}</strong>
                  <span className="stat-num text-xs text-white/45">
                    {v.drives} {v.drives === 1 ? "drive" : "drives"} · top {toSpeed(v.top_speed_kmh)} {speedUnit}
                  </span>
                </div>
                <strong className="stat-num font-medium shrink-0">
                  {toDist(v.distance_m)} <span className="text-white/40 text-sm">{distUnit}</span>
                </strong>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Driving Score trend */}
      {stats && stats.score_trend.length > 1 && (
        <div className="card">
          <h3 className="font-semibold mb-4">Driving Score trend</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.score_trend} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} domain={[0, 100]} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                {SCORE_LINES.map((s) => (
                  <Line key={s.key} type="monotone" dataKey={s.key} name={s.key} stroke={s.color} strokeWidth={s.key === "overall" ? 2.5 : 1.5} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}
