import { useEffect, useMemo, useState } from "react"
import { Trash2, Play } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { useAppStore, SessionFilter } from "../store"
import { routes } from "../routes"
import { user as userApi, sessions as sessionsApi } from "../api"
import { axisProps, gridProps, RACER_PALETTE, tooltipStyle } from "../lib/charts"
import { useUnits } from "../lib/units"
import { DriveScorePanel } from "../components/DriveScorePanel"
import { StatsOverview } from "../components/StatsOverview"
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts"

interface SessionSummary {
  session_id: number
  host_user_id: number
  name: string
  is_solo?: boolean
  status: string
  created_at: string
  ended_at?: string
  final_rank: number | null
  total_distance_m: number
  top_speed_kmh: number
  average_speed_kmh: number
}

interface SeriesPoint {
  username: string
  elapsed_s: number
  speed_kmh: number
  cumulative_distance_m?: number
}

export const AnalyticsScreen = () => {
  const navigate = useNavigate()
  const { mph, speedUnit, distUnit, toSpeed, toDist } = useUnits()
  const user = useAppStore((s) => s.user)
  const setUser = useAppStore((s) => s.setUser)
  const initialFilter = useAppStore((s) => s.analyticsFilter)
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [trace, setTrace] = useState<SeriesPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [filter, setFilter] = useState<SessionFilter>(initialFilter)
  const [statsRefresh, setStatsRefresh] = useState(0)

  useEffect(() => {
    const run = async () => {
      try {
        if (!user) {
          const profile = await userApi.getProfile()
          setUser(profile.data)
        }
        const res = await userApi.mySessions()
        const data: SessionSummary[] = res.data
        setSessions(data)
        // Speed trace from the most recent ended session that has telemetry.
        const ended = data.filter((s) => s.status === "ended")
        if (ended.length) {
          const t = await sessionsApi.telemetry(ended[0].session_id)
          setTrace(t.data)
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Speed trace for the latest sprint, pivoted so every racer is one line:
  // rows are keyed by whole-second elapsed time with a speed column per racer.
  const { traceRows, racers } = useMemo(() => {
    if (!trace.length) return { traceRows: [] as any[], racers: [] as string[] }
    const names = Array.from(new Set(trace.map((p) => p.username)))
    const byT = new Map<number, any>()
    for (const p of trace) {
      const t = Math.round(p.elapsed_s)
      const row = byT.get(t) ?? { t }
      row[p.username] = toSpeed(p.speed_kmh)
      byT.set(t, row)
    }
    const rows = Array.from(byT.values()).sort((a, b) => a.t - b.t)
    // Show the current user's line first so it gets the lead colour.
    const ordered = user?.username
      ? [user.username, ...names.filter((n) => n !== user.username)].filter((n) => names.includes(n))
      : names
    return { traceRows: rows, racers: ordered }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trace, user?.username, mph])

  // Wins/podiums are races only — solo drives are always "1st" and don't count.
  const podiums = sessions.filter((s) => (s.final_rank ?? 99) <= 3 && s.status === "ended" && !s.is_solo).length
  const wins = sessions.filter((s) => s.final_rank === 1 && s.status === "ended" && !s.is_solo).length
  const endedCount = sessions.filter((s) => s.status === "ended").length
  const latestEndedId = sessions.find((s) => s.status === "ended")?.session_id

  // Sessions shown in the history list, per the active filter.
  const visibleSessions = sessions.filter((s) => {
    if (filter === "wins") return s.status === "ended" && s.final_rank === 1 && !s.is_solo
    if (filter === "podiums") return s.status === "ended" && (s.final_rank ?? 99) <= 3 && !s.is_solo
    return true
  })

  const handleDelete = async (sessionId: number, name: string) => {
    if (!window.confirm(`Delete "${name}"? This permanently removes the session and its telemetry.`)) return
    setDeletingId(sessionId)
    try {
      await sessionsApi.remove(sessionId)
      setSessions((prev) => prev.filter((s) => s.session_id !== sessionId))
      // Refresh the overview stats + the lifetime profile (dashboard cards).
      setStatsRefresh((n) => n + 1)
      userApi.getProfile().then((r) => setUser(r.data)).catch(() => {})
    } catch (err) {
      console.error(err)
      window.alert("Could not delete that session.")
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) return <div className="p-8">Loading analytics…</div>

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-5xl mx-auto">
      <div className="mb-6 md:mb-8">
        <span className="eyebrow">Analytics</span>
        <h2 className="display text-4xl md:text-5xl mt-2">Performance</h2>
      </div>

      <div className="grid grid-cols-2 gap-3 md:gap-4 mb-6">
        <div className="card">
          <span className="eyebrow">Wins</span>
          <strong className="stat-num text-2xl font-medium block mt-2">{wins}</strong>
        </div>
        <div className="card">
          <span className="eyebrow">Podiums</span>
          <strong className="stat-num text-2xl font-medium block mt-2">
            {podiums} <span className="text-sm text-white/40">/ {endedCount}</span>
          </strong>
        </div>
      </div>

      <div className="mb-6">
        <StatsOverview refreshKey={statsRefresh} />
      </div>

      {endedCount === 0 ? (
        <div className="card text-white/60">
          No completed sprints yet. Finish a session to unlock your performance charts.
        </div>
      ) : (
        <div className="space-y-6">
          {latestEndedId && <DriveScorePanel sessionId={latestEndedId} />}

          <div className="card">
            <h3 className="font-semibold mb-4">Latest sprint — speed by racer ({speedUnit})</h3>
            <div className="h-72">
              {traceRows.length === 0 ? (
                <div className="h-full flex items-center justify-center text-white/50 text-sm text-center px-4">
                  No telemetry recorded for your latest sprint (race with location enabled to capture a trace).
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={traceRows} margin={{ top: 5, right: 10, bottom: 5, left: -10 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="t" {...axisProps} unit="s" />
                    <YAxis {...axisProps} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                    {racers.map((name, i) => (
                      <Line
                        key={name}
                        type="monotone"
                        dataKey={name}
                        name={name}
                        stroke={RACER_PALETTE[i % RACER_PALETTE.length]}
                        strokeWidth={2}
                        dot={false}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="card">
            <div className="flex items-center justify-between gap-2 mb-4">
              <h3 className="font-semibold">Past sprints</h3>
              <div className="flex gap-1 rounded-lg bg-ink-2 border border-hairline p-0.5">
                {(["all", "wins", "podiums"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors ${
                      filter === f ? "bg-white/[0.08] text-white" : "text-white/45 hover:text-white/80"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            {visibleSessions.length === 0 ? (
              <p className="text-white/50 text-sm py-2">
                {filter === "wins" ? "No wins yet — go take P1." : filter === "podiums" ? "No podium finishes yet." : "No sprints yet."}
              </p>
            ) : (
            <ul className="space-y-2">
              {visibleSessions.slice(0, 15).map((s) => (
                <li key={s.session_id} className="flex items-center justify-between bg-ink-2 border border-hairline rounded-lg px-4 py-3">
                  <div>
                    <strong className="block">{s.name}</strong>
                    <span className="text-xs text-white/60">
                      {new Date(s.created_at).toLocaleDateString()} · {s.is_solo ? "solo drive" : s.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <strong className="block">{toSpeed(s.top_speed_kmh)} {speedUnit}</strong>
                      <span className="text-xs text-white/60">
                        {s.final_rank ? `P${s.final_rank}` : "—"} · {toDist(s.total_distance_m)} {distUnit}
                      </span>
                    </div>
                    {s.status === "ended" && (
                      <button
                        onClick={() => navigate(routes.replay(s.session_id))}
                        title="Watch replay"
                        aria-label={`Replay ${s.name}`}
                        className="p-2 rounded-lg text-white/40 hover:text-amber hover:bg-white/[0.05] transition-colors"
                      >
                        <Play size={16} />
                      </button>
                    )}
                    {s.host_user_id === user?.id && (
                      <button
                        onClick={() => handleDelete(s.session_id, s.name)}
                        disabled={deletingId === s.session_id}
                        title="Delete session"
                        aria-label={`Delete ${s.name}`}
                        className="p-2 rounded-lg text-white/40 hover:text-negative hover:bg-negative/10 transition-colors disabled:opacity-40"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
