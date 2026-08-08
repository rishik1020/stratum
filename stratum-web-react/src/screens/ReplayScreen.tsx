import { useEffect, useState } from "react"
import { useAppStore } from "../store"
import { sessions } from "../api"
import { LiveMap, MapPosition } from "../components/LiveMap"
import { Standings } from "../components/Standings"
import { TelemetryHUD, TelemetryFrame } from "../components/TelemetryHUD"
import { Play, Pause, RotateCcw, ChevronDown, ChevronUp, ArrowLeft } from "lucide-react"

interface SeriesPoint {
  username: string
  elapsed_s: number
  speed_kmh: number
  cumulative_distance_m?: number | null
  latitude?: number | null
  longitude?: number | null
  altitude_m?: number | null
  heading_deg?: number | null
  g_force?: number | null
}

const lerp = (a: number, b: number, f: number) => a + (b - a) * f
// Shortest-path angular interpolation, result in [0,360).
const lerpAngle = (a: number, b: number, f: number) => {
  const d = ((b - a + 540) % 360) - 180
  return (a + d * f + 360) % 360
}

// Sample a racer's stream at time `t` (seconds), interpolating between the two
// bracketing fixes so playback is smooth despite the ~1 Hz capture cadence.
function sampleAt(points: SeriesPoint[], t: number): SeriesPoint | null {
  if (!points.length) return null
  if (t <= points[0].elapsed_s) return points[0]
  const last = points[points.length - 1]
  if (t >= last.elapsed_s) return last
  let i = 0
  while (i < points.length - 1 && points[i + 1].elapsed_s < t) i++
  const a = points[i]
  const b = points[i + 1]
  const span = b.elapsed_s - a.elapsed_s
  const f = span > 0 ? (t - a.elapsed_s) / span : 0
  const lerpN = (x?: number | null, y?: number | null) =>
    x != null && y != null ? lerp(x, y, f) : x ?? y ?? null
  return {
    username: a.username,
    elapsed_s: t,
    speed_kmh: lerp(a.speed_kmh, b.speed_kmh, f),
    cumulative_distance_m: lerpN(a.cumulative_distance_m, b.cumulative_distance_m),
    latitude: lerpN(a.latitude, b.latitude),
    longitude: lerpN(a.longitude, b.longitude),
    altitude_m: lerpN(a.altitude_m, b.altitude_m),
    heading_deg:
      a.heading_deg != null && b.heading_deg != null
        ? lerpAngle(a.heading_deg, b.heading_deg, f)
        : b.heading_deg ?? a.heading_deg ?? null,
    g_force: lerpN(a.g_force, b.g_force),
  }
}

const SPEEDS = [1, 2, 4, 8]

export const ReplayScreen = ({ onNavigate }: { onNavigate: (screen: string) => void }) => {
  const sessionId = useAppStore((s) => s.replaySessionId)
  const user = useAppStore((s) => s.user)

  const [byRacer, setByRacer] = useState<Record<string, SeriesPoint[]>>({})
  const [duration, setDuration] = useState(0)
  const [sessionName, setSessionName] = useState("")
  const [playhead, setPlayhead] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(1)
  const [selected, setSelected] = useState<string | undefined>(undefined)
  const [showBoard, setShowBoard] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  // Load the stored stream and group it per racer.
  useEffect(() => {
    if (!sessionId) {
      setLoading(false)
      setError("No session selected for replay.")
      return
    }
    let cancelled = false
    sessions.getById(sessionId).then((r) => !cancelled && setSessionName(r.data.name)).catch(() => {})
    sessions
      .telemetry(sessionId)
      .then((res) => {
        if (cancelled) return
        const pts: SeriesPoint[] = res.data
        if (!pts.length) {
          setError("No telemetry was recorded for this session.")
          return
        }
        const grouped: Record<string, SeriesPoint[]> = {}
        for (const p of pts) (grouped[p.username] ??= []).push(p)
        for (const k in grouped) grouped[k].sort((a, b) => a.elapsed_s - b.elapsed_s)
        const names = Object.keys(grouped)
        setByRacer(grouped)
        setDuration(Math.max(0, ...pts.map((p) => p.elapsed_s)))
        setSelected(user?.username && names.includes(user.username) ? user.username : names[0])
        setPlayhead(0)
        setPlaying(true)
      })
      .catch(() => !cancelled && setError("Could not load replay telemetry."))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  // Playback clock — advance the playhead in real time × rate while playing.
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

  const racers = Object.keys(byRacer)

  // Positions of every racer at the current playhead, for the map.
  const positions: Record<string, MapPosition> = {}
  for (const name of racers) {
    const s = sampleAt(byRacer[name], playhead)
    if (s?.latitude != null && s?.longitude != null) positions[name] = { lat: s.latitude, lng: s.longitude }
  }

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

  // Standings at the playhead (live gap/interval as the replay progresses).
  const board = racers
    .map((name) => {
      const s = sampleAt(byRacer[name], playhead)
      return { user: name, speed: Math.round(s?.speed_kmh ?? 0), distance: Math.round(s?.cumulative_distance_m ?? 0) }
    })
    .sort((a, b) => b.distance - a.distance)
  const leaderDistance = board[0]?.distance ?? 0
  const standings = board.map((d, i) => ({
    ...d,
    position: i + 1,
    gapToLeaderM: Math.max(0, Math.round(leaderDistance - d.distance)),
    intervalM: i === 0 ? 0 : Math.max(0, Math.round(board[i - 1].distance - d.distance)),
  }))

  const restart = () => {
    setPlayhead(0)
    setPlaying(true)
  }
  const seek = (s: number) => {
    setPlayhead(s)
    setPlaying(false)
  }

  if (loading) return <div className="flex items-center justify-center h-[100dvh] text-white/60">Loading replay…</div>

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[100dvh] gap-4 px-6 text-center">
        <p className="text-white/60">{error}</p>
        <button onClick={() => onNavigate("analytics")} className="btn-secondary">
          Back to Analytics
        </button>
      </div>
    )
  }

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-stratum-darker">
      <div className="absolute inset-0">
        <LiveMap positions={positions} meName={selected} showControls={false} />
      </div>

      {/* Top: telemetry HUD with the scrubber */}
      <div className="absolute top-0 inset-x-0 z-[600]">
        <TelemetryHUD
          frame={frame}
          title={sessionName || "Session replay"}
          mode="replay"
          elapsedS={playhead}
          durationS={duration}
          onSeek={seek}
        />
      </div>

      {/* Bottom: transport controls + standings */}
      <div className="absolute bottom-0 inset-x-0 z-[600] bg-stratum-darker/85 backdrop-blur-md border-t border-white/10">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => (playhead >= duration ? restart() : setPlaying((p) => !p))}
            className="w-10 h-10 shrink-0 rounded-full bg-white text-black flex items-center justify-center"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
          </button>
          <button onClick={restart} className="w-9 h-9 shrink-0 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/70 hover:text-white" aria-label="Restart">
            <RotateCcw size={15} />
          </button>
          <div className="flex items-center gap-1 ml-auto">
            {SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => setRate(s)}
                className={`stat-num text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                  rate === s ? "bg-white/[0.08] text-white border-white/20" : "bg-transparent text-white/45 border-white/8 hover:text-white/80"
                }`}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>

        {racers.length > 1 && (
          <div className="flex items-center gap-2 px-4 pb-2 overflow-x-auto">
            <span className="eyebrow shrink-0">Gauges</span>
            {racers.map((name) => (
              <button
                key={name}
                onClick={() => setSelected(name)}
                className={`text-xs px-2.5 py-1 rounded-full border shrink-0 transition-colors ${
                  selected === name ? "bg-stratum-violet/15 text-stratum-violet border-stratum-violet/30" : "bg-white/5 text-white/55 border-white/10 hover:text-white/80"
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        )}

        <button onClick={() => setShowBoard((s) => !s)} className="w-full flex items-center justify-between px-4 py-2.5">
          <span className="font-semibold text-sm">Leaderboard</span>
          {showBoard ? <ChevronDown size={14} className="text-white/45" /> : <ChevronUp size={14} className="text-white/45" />}
        </button>
        {showBoard && (
          <div className="px-4 pb-3 max-h-[30vh] overflow-y-auto">
            <Standings standings={standings} myName={selected} />
          </div>
        )}

        <div className="px-4 pt-1 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
          <button onClick={() => onNavigate("analytics")} className="btn-secondary w-full flex items-center justify-center gap-2">
            <ArrowLeft size={16} />
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
