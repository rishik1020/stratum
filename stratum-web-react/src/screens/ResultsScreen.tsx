import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAppStore } from "../store"
import { sessions } from "../api"
import { routes } from "../routes"
import { useRouteSession } from "../lib/useRouteSession"
import { Share2, Trophy, Play, Navigation, Trash2 } from "lucide-react"

interface Result {
  final_rank: number | null
  user_id: number
  username: string
  display_name: string
  vehicle_label?: string | null
  total_distance_m: number
  top_speed_kmh: number
  average_speed_kmh: number
}

export const ResultsScreen = () => {
  const navigate = useNavigate()
  const { session: currentSession } = useRouteSession()
  const setCurrentSession = useAppStore((s) => s.setCurrentSession)
  const user = useAppStore((s) => s.user)
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!currentSession) {
      setLoading(false)
      return
    }
    sessions
      .results(currentSession.id)
      .then((res) => setResults(res.data))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false))
  }, [currentSession])

  const winner = results[0]
  const isSolo = !!currentSession?.is_solo
  const isHost = user?.id === currentSession?.host_user_id

  const handleDelete = async () => {
    if (!currentSession) return
    const label = isSolo ? "drive" : "session"
    if (!window.confirm(`Delete this ${label}? This permanently removes it and its telemetry.`)) return
    setDeleting(true)
    try {
      await sessions.remove(currentSession.id)
      setCurrentSession(null)
      navigate(routes.dashboard)
    } catch (err) {
      console.error(err)
      window.alert("Could not delete it.")
      setDeleting(false)
    }
  }

  const handleShare = () => {
    const text = isSolo
      ? `I tracked a drive on Stratum — ${winner?.top_speed_kmh ?? 0} km/h top speed!`
      : winner
      ? `${winner.display_name} won a sprint on Stratum with ${winner.top_speed_kmh} km/h top speed!`
      : "Check out my sprint on Stratum!"
    navigator.share?.({ title: isSolo ? "Stratum Drive" : "Stratum Sprint Results", text, url: window.location.href }).catch(() => {
      navigator.clipboard?.writeText(text)
    })
  }

  const handleHome = () => {
    setCurrentSession(null)
    navigate(routes.dashboard)
  }

  return (
    <div className="min-h-screen bg-ink">
      <nav className="safe-top border-b border-hairline">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <button onClick={handleHome} className="btn-secondary">
            Back to Home
          </button>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto p-6">
        <div className="mb-8">
          <span className="eyebrow">{isSolo ? "Drive" : "Results"}</span>
          <h2 className="display text-4xl md:text-5xl mt-2">{isSolo ? "Drive complete" : "Sprint complete"}</h2>
        </div>

        {loading ? (
          <div className="card">Loading results...</div>
        ) : results.length === 0 ? (
          <div className="card text-white/60">No results recorded for this session.</div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              <div className="lg:col-span-2 card">
                <div className="flex items-center gap-4 mb-6">
                  {isSolo ? <Navigation size={36} className="text-amber" /> : <Trophy size={40} className="text-amber" />}
                  <div>
                    <span className="eyebrow">{isSolo ? "Your drive" : "Winner"}</span>
                    <h3 className="display text-3xl">{winner?.display_name}</h3>
                    {winner?.vehicle_label && (
                      <span className="text-sm text-white/50">{winner.vehicle_label}</span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-ink-2 border border-hairline rounded-lg px-4 py-3">
                    <span className="eyebrow">Top Speed</span>
                    <strong className="stat-num text-2xl font-medium block mt-1">{winner?.top_speed_kmh} <span className="text-sm text-white/40">km/h</span></strong>
                  </div>
                  <div className="bg-ink-2 border border-hairline rounded-lg px-4 py-3">
                    <span className="eyebrow">Distance</span>
                    <strong className="stat-num text-2xl font-medium block mt-1">{((winner?.total_distance_m || 0) / 1000).toFixed(2)} <span className="text-sm text-white/40">km</span></strong>
                  </div>
                  <div className="bg-ink-2 border border-hairline rounded-lg px-4 py-3">
                    <span className="eyebrow">Avg Speed</span>
                    <strong className="stat-num text-2xl font-medium block mt-1">{winner?.average_speed_kmh} <span className="text-sm text-white/40">km/h</span></strong>
                  </div>
                </div>
              </div>

              <div className="card space-y-3">
                <button
                  onClick={() => {
                    if (currentSession) navigate(routes.replay(currentSession.id))
                  }}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  <Play size={18} />
                  Watch replay
                </button>
                <button onClick={handleShare} className="btn-secondary w-full flex items-center justify-center gap-2">
                  <Share2 size={18} />
                  Share Result
                </button>
                {isHost && (
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-medium text-sm text-negative bg-negative/10 border border-negative/20 hover:bg-negative/15 transition-colors disabled:opacity-50"
                  >
                    <Trash2 size={16} />
                    {deleting ? "Deleting…" : `Delete ${isSolo ? "drive" : "session"}`}
                  </button>
                )}
              </div>
            </div>

            {!isSolo && (
            <div className="card">
              <h3 className="font-semibold mb-4">Final Leaderboard</h3>
              <ol className="space-y-2">
                {results.map((r) => (
                  <li key={r.user_id} className="flex items-center justify-between bg-ink-2 border border-hairline rounded-lg px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="stat-num w-5 shrink-0 text-center font-semibold text-white/40">{r.final_rank ?? "-"}</span>
                      <div className="min-w-0">
                        <strong className="block font-medium truncate">{r.display_name}</strong>
                        <span className="stat-num text-xs text-white/45">
                          {r.total_distance_m}m{r.vehicle_label ? ` · ${r.vehicle_label}` : ""}
                        </span>
                      </div>
                    </div>
                    <strong className="stat-num font-medium">{r.top_speed_kmh} <span className="text-white/40 text-sm">km/h</span></strong>
                  </li>
                ))}
              </ol>
            </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
