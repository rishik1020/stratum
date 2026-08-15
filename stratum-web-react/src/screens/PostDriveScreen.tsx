import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { AnimatePresence, motion } from "framer-motion"
import { Play, Pause, RotateCcw, Share2, Trash2, ArrowLeft, Trophy, Navigation } from "lucide-react"

import { sessions } from "../api"
import { routes } from "../routes"
import { useAppStore } from "../store"
import { useRouteSession } from "../lib/useRouteSession"
import { SeriesPoint, groupByRacer, sampleAt, standingsAt, trailsUpTo } from "../lib/replay"
import { fmtClock } from "../lib/format"
import { useUnits } from "../lib/units"
import { LiveMap, MapPosition, AvatarInfo } from "../components/LiveMap"
import { RacerPanel } from "../components/RacerPanel"
import { TelemetryHUD, TelemetryFrame } from "../components/TelemetryHUD"
import { DriveScorePanel } from "../components/DriveScorePanel"

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

const SPEEDS = [1, 2, 4, 8]

/**
 * The single screen you land on when a drive ends.
 *
 * Merges what used to be two screens: Results (final table, share, delete) and
 * Replay (scrubbable playback). They described one moment — the drive is over,
 * here's what happened — and splitting them meant the route animation and the
 * numbers it produced lived in different places.
 *
 * Playback starts automatically, which is what draws the route on: the trail
 * passed to the map is sliced at the playhead, so the line grows behind each
 * car as the replay runs.
 */
export const PostDriveScreen = () => {
  const navigate = useNavigate()
  const sessionId = Number(useParams().sessionId)
  const { session } = useRouteSession()
  const user = useAppStore((s) => s.user)
  const setCurrentSession = useAppStore((s) => s.setCurrentSession)
  const { speedUnit, distUnit, toSpeed, toDist } = useUnits()

  const [byRacer, setByRacer] = useState<Record<string, SeriesPoint[]>>({})
  const [results, setResults] = useState<Result[]>([])
  const [duration, setDuration] = useState(0)
  const [playhead, setPlayhead] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(2)
  const [selected, setSelected] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [deleting, setDeleting] = useState(false)

  const isSolo = !!session?.is_solo
  const isHost = user?.id === session?.host_user_id
  const myName = user?.username

  // --- Load telemetry + final results -----------------------------------
  useEffect(() => {
    if (!Number.isFinite(sessionId)) return
    let cancelled = false

    Promise.all([sessions.telemetry(sessionId), sessions.results(sessionId)])
      .then(([tel, res]) => {
        if (cancelled) return
        const pts: SeriesPoint[] = tel.data
        setResults(res.data)
        if (!pts.length) {
          setError("No telemetry was recorded for this session.")
          return
        }
        const grouped = groupByRacer(pts)
        setByRacer(grouped)
        setDuration(Math.max(0, ...pts.map((p) => p.elapsed_s)))
        const names = Object.keys(grouped)
        setSelected(myName && names.includes(myName) ? myName : names[0])
        setPlayhead(0)
        setPlaying(true) // the route drawing itself is the point
      })
      .catch(() => !cancelled && setError("Couldn't load this drive."))
      .finally(() => !cancelled && setLoading(false))

    return () => {
      cancelled = true
    }
  }, [sessionId, myName])

  // --- Playback clock ----------------------------------------------------
  useEffect(() => {
    if (!playing || duration <= 0) return
    let raf = 0
    let last: number | null = null
    const tick = (ts: number) => {
      if (last != null) {
        const dt = ((ts - last) / 1000) * rate
        setPlayhead((p) => {
          const np = p + dt
          if (np >= duration) {
            setPlaying(false)
            return duration
          }
          return np
        })
      }
      last = ts
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, rate, duration])

  const racers = useMemo(() => Object.keys(byRacer), [byRacer])

  const trails = useMemo(() => trailsUpTo(byRacer, playhead), [byRacer, playhead])
  const standings = useMemo(() => standingsAt(byRacer, playhead), [byRacer, playhead])

  const positions = useMemo(() => {
    const out: Record<string, MapPosition> = {}
    for (const name of racers) {
      const s = sampleAt(byRacer[name], playhead)
      if (s?.latitude != null && s?.longitude != null) out[name] = { lat: s.latitude, lng: s.longitude }
    }
    return out
  }, [byRacer, racers, playhead])

  const avatars = useMemo(() => {
    const out: Record<string, AvatarInfo> = {}
    for (const r of results) out[r.username] = { url: null, label: r.display_name }
    return out
  }, [results])

  const badges = useMemo(() => {
    const out: Record<string, string> = {}
    for (const s of standings) out[s.user] = `${toSpeed(s.speed)}`
    return out
  }, [standings, toSpeed])

  const sel = selected ? sampleAt(byRacer[selected], playhead) : null
  const topSpeed = selected
    ? Math.max(0, ...byRacer[selected].filter((p) => p.elapsed_s <= playhead + 0.01).map((p) => p.speed_kmh))
    : 0

  const frame: TelemetryFrame = {
    speedKmh: sel?.speed_kmh ?? 0,
    altitudeM: sel?.altitude_m ?? null,
    gForce: sel?.g_force ?? null,
    headingDeg: sel?.heading_deg ?? null,
    distanceM: sel?.cumulative_distance_m ?? 0,
    topSpeedKmh: topSpeed,
  }

  const restart = useCallback(() => {
    setPlayhead(0)
    setPlaying(true)
  }, [])

  const seek = useCallback((s: number) => {
    setPlayhead(s)
    setPlaying(false)
  }, [])

  const winner = results[0]

  const handleShare = () => {
    const text = isSolo
      ? `I tracked a drive on Stratum — ${winner?.top_speed_kmh ?? 0} km/h top speed!`
      : winner
      ? `${winner.display_name} won a sprint on Stratum with ${winner.top_speed_kmh} km/h top speed!`
      : "Check out my sprint on Stratum!"
    navigator
      .share?.({ title: isSolo ? "Stratum Drive" : "Stratum Sprint", text, url: window.location.href })
      .catch(() => navigator.clipboard?.writeText(text))
  }

  const handleDelete = async () => {
    const label = isSolo ? "drive" : "session"
    if (!window.confirm(`Delete this ${label}? This permanently removes it and its telemetry.`)) return
    setDeleting(true)
    try {
      await sessions.remove(sessionId)
      setCurrentSession(null)
      navigate(routes.dashboard)
    } catch {
      window.alert("Could not delete it.")
      setDeleting(false)
    }
  }

  const goHome = () => {
    setCurrentSession(null)
    navigate(routes.dashboard)
  }

  if (loading) {
    return <div className="flex h-[100dvh] items-center justify-center text-white/50">Loading drive…</div>
  }

  if (error) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-white/60">{error}</p>
        <button onClick={goHome} className="btn-secondary">
          Back to dashboard
        </button>
      </div>
    )
  }

  const transport = (
    <div className="flex items-center gap-3">
      <button
        onClick={() => (playhead >= duration ? restart() : setPlaying((p) => !p))}
        aria-label={playing ? "Pause" : "Play"}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber text-amber-ink transition-colors hover:bg-amber-soft"
      >
        {playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
      </button>
      <button
        onClick={restart}
        aria-label="Restart"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-hairline bg-ink-2 text-white/70 transition-colors hover:text-white"
      >
        <RotateCcw size={15} />
      </button>
      <div className="ml-auto flex items-center gap-1">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => setRate(s)}
            className={`stat-num rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
              rate === s
                ? "border-amber bg-amber-10 text-amber"
                : "border-hairline bg-transparent text-white/45 hover:text-white/80"
            }`}
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <div className="min-h-[100dvh] bg-ink">
      {/* --- Header ------------------------------------------------------ */}
      <header className="safe-top border-b border-hairline px-4 py-4 md:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="min-w-0">
            <span className="eyebrow">{isSolo ? "Drive complete" : "Sprint complete"}</span>
            <h1 className="display mt-1 truncate text-2xl md:text-3xl">{session?.name || "Drive"}</h1>
          </div>
          <button onClick={goHome} className="btn-secondary shrink-0">
            <span className="flex items-center gap-2">
              <ArrowLeft size={16} />
              Done
            </span>
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
        {/* --- Headline result ------------------------------------------- */}
        {winner && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="card-active mb-6 flex flex-col gap-5 md:flex-row md:items-center md:justify-between"
          >
            <div className="flex items-center gap-4">
              {isSolo ? (
                <Navigation size={32} className="shrink-0 text-amber" />
              ) : (
                <Trophy size={32} className="shrink-0 text-amber" />
              )}
              <div className="min-w-0">
                <span className="eyebrow">{isSolo ? "Your drive" : "Winner"}</span>
                <h2 className="display truncate text-2xl">{winner.display_name}</h2>
                {winner.vehicle_label && (
                  <p className="truncate text-sm text-white/45">{winner.vehicle_label}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                ["Top speed", `${toSpeed(winner.top_speed_kmh)}`, speedUnit],
                ["Distance", `${toDist(winner.total_distance_m)}`, distUnit],
                ["Avg speed", `${toSpeed(winner.average_speed_kmh)}`, speedUnit],
              ].map(([label, value, unit]) => (
                <div key={label} className="rounded-xl bg-ink-3 px-4 py-3">
                  <span className="eyebrow">{label}</span>
                  <strong className="stat-num mt-1 block text-2xl font-medium">
                    {value}
                    <span className="ml-1 text-xs text-white/40">{unit}</span>
                  </strong>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* --- Replay: roster + map -------------------------------------- */}
        <div className="mb-6 overflow-hidden rounded-card border border-hairline bg-ink-1 lg:flex lg:h-[560px]">
          <aside className="flex flex-col border-hairline lg:w-[300px] lg:shrink-0 lg:border-r">
            <div className="border-b border-hairline px-4 py-3">
              <div className="flex items-baseline justify-between">
                <span className="eyebrow">Replay</span>
                <span className="stat-num text-xs text-white/45">
                  {fmtClock(playhead)} <span className="text-white/25">/ {fmtClock(duration)}</span>
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(1, Math.floor(duration))}
                value={Math.floor(playhead)}
                onChange={(e) => seek(Number(e.target.value))}
                aria-label="Scrub replay"
                className="mt-2 w-full accent-amber"
              />
            </div>

            <div className="min-h-0 flex-1 py-2 max-lg:max-h-[280px]">
              <RacerPanel
                racers={standings}
                avatars={avatars}
                meName={myName}
                selected={selected}
                onSelect={setSelected}
                title={isSolo ? "You" : "Positions"}
              />
            </div>

            <div className="border-t border-hairline p-4">{transport}</div>
          </aside>

          <div className="relative h-[340px] lg:h-auto lg:flex-1">
            <LiveMap
              positions={positions}
              meName={myName}
              avatars={avatars}
              trails={trails}
              badges={badges}
              selected={selected}
              onSelect={setSelected}
              showControls={false}
            />
            <div className="pointer-events-none absolute inset-x-0 top-0 z-[500]">
              <AnimatePresence>
                {sel && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <TelemetryHUD
                      frame={frame}
                      title={avatars[selected!]?.label || selected}
                      mode="replay"
                      elapsedS={playhead}
                      durationS={duration}
                      onSeek={seek}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* --- Final classification (races only) -------------------------- */}
        {!isSolo && results.length > 0 && (
          <div className="card mb-6">
            <h3 className="mb-4 font-semibold">Final classification</h3>
            <ol className="space-y-2">
              {results.map((r) => (
                <li
                  key={r.user_id}
                  className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                    r.username === myName ? "border-amber-40 bg-amber-10" : "border-hairline bg-ink-2"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`stat-num w-5 shrink-0 text-center font-semibold ${
                        r.final_rank === 1 ? "text-amber" : "text-white/35"
                      }`}
                    >
                      {r.final_rank ?? "—"}
                    </span>
                    <div className="min-w-0">
                      <strong className="block truncate font-medium">{r.display_name}</strong>
                      <span className="stat-num text-xs text-white/45">
                        {toDist(r.total_distance_m)} {distUnit}
                        {r.vehicle_label ? ` · ${r.vehicle_label}` : ""}
                      </span>
                    </div>
                  </div>
                  <strong className="stat-num shrink-0 font-medium">
                    {toSpeed(r.top_speed_kmh)}
                    <span className="ml-1 text-xs text-white/40">{speedUnit}</span>
                  </strong>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* --- Score + coach ---------------------------------------------- */}
        <div className="mb-6">
          <DriveScorePanel sessionId={sessionId} />
        </div>

        {/* --- Actions ----------------------------------------------------- */}
        <div className="flex flex-wrap gap-3">
          <button onClick={handleShare} className="btn-secondary flex items-center gap-2">
            <Share2 size={16} />
            Share
          </button>
          {isHost && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-2 rounded-pill border border-negative/25 bg-negative/10 px-5 py-2.5 text-sm font-medium text-negative transition-colors hover:bg-negative/15 disabled:opacity-50"
            >
              <Trash2 size={16} />
              {deleting ? "Deleting…" : `Delete ${isSolo ? "drive" : "session"}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
