import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Minimize2 } from "lucide-react"

import { sessions } from "../api"
import { routes } from "../routes"
import { useAppStore } from "../store"
import { useRouteSession } from "../lib/useRouteSession"
import { SessionEvent, useSessionSocket } from "../lib/useSessionSocket"
import { Fix, Tracker, createWakeLock, haversineM, startTracking } from "../lib/tracking"
import { useUnits } from "../lib/units"
import { CarDashboard, DashboardState } from "../components/CarDashboard"
import { MapPosition, AvatarInfo } from "../components/LiveMap"

/**
 * Car mode — the live drive on a phone mounted in the car.
 *
 * Same dashboard the landing film shows, wired to real telemetry instead of a
 * scripted clock. Landscape, one huge number, everything else a glance.
 *
 * Not CarPlay/Android Auto: neither platform allows this app category. This is
 * the phone itself, in a mount, which is what actually ships.
 */

const MAX_TRAIL_POINTS = 600

export const CarModeScreen = () => {
  const navigate = useNavigate()
  const { id: sessionId, session } = useRouteSession()
  const user = useAppStore((s) => s.user)
  const { speedUnit, distUnit, toSpeed, toDist } = useUnits()

  const [speed, setSpeed] = useState(0)
  const [distance, setDistance] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [gapM, setGapM] = useState<number | null>(null)
  const [score, setScore] = useState<number | null>(null)
  const [positions, setPositions] = useState<Record<string, MapPosition>>({})
  const [trails, setTrails] = useState<Record<string, MapPosition[]>>({})
  const [distances, setDistances] = useState<Record<string, number>>({})

  const myName = user?.username
  const meRef = useRef<string | undefined>(undefined)
  const lastCoord = useRef<Fix | null>(null)
  const cumulative = useRef(0)

  useEffect(() => {
    meRef.current = myName
  }, [myName])

  useEffect(() => {
    const timer = setInterval(() => setElapsed((t) => t + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  const appendFix = useCallback((who: string, fix: MapPosition) => {
    setTrails((prev) => {
      const existing = prev[who] ?? []
      const last = existing[existing.length - 1]
      if (last && Math.abs(last.lat - fix.lat) < 1e-5 && Math.abs(last.lng - fix.lng) < 1e-5) return prev
      const next = [...existing, fix]
      return { ...prev, [who]: next.length > MAX_TRAIL_POINTS ? next.slice(-MAX_TRAIL_POINTS) : next }
    })
  }, [])

  const handleEvent = useCallback(
    (msg: SessionEvent) => {
      if (msg.event !== "telemetry.update") return
      const { user: who, speed_kmh, cumulative_distance_m, latitude, longitude } = msg.payload
      const dist = Math.round(cumulative_distance_m ?? 0)
      setDistances((prev) => ({ ...prev, [who]: dist }))
      if (latitude != null && longitude != null) {
        setPositions((prev) => ({ ...prev, [who]: { lat: latitude, lng: longitude } }))
        appendFix(who, { lat: latitude, lng: longitude })
      }
      if (who === meRef.current) {
        setSpeed(Math.round(speed_kmh ?? 0))
        setDistance(dist)
      }
    },
    [appendFix]
  )

  const { connected, send } = useSessionSocket(sessionId, handleEvent)

  // Gap to whoever's furthest along. Solo drives have no one to measure against.
  useEffect(() => {
    const values = Object.entries(distances)
    if (values.length < 2 || !myName) {
      setGapM(null)
      return
    }
    const leader = Math.max(...values.map(([, d]) => d))
    setGapM(Math.max(0, leader - (distances[myName] ?? 0)))
  }, [distances, myName])

  // Score is computed server-side from stored telemetry, so poll it gently —
  // it only changes meaningfully over tens of seconds.
  useEffect(() => {
    if (!sessionId) return
    let cancelled = false
    const read = () =>
      sessions
        .driveAnalytics(sessionId)
        .then((r) => !cancelled && r.data?.status === "ok" && setScore(r.data.score.overall))
        .catch(() => {})
    read()
    const id = setInterval(read, 20000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [sessionId])

  // Own GPS → telemetry, same as the live screen: background service on a
  // phone, watchPosition on the web. Car mode is the mount-on-the-dash view, so
  // the wake lock matters here more than anywhere — the screen going dark
  // mid-drive is the whole failure mode.
  useEffect(() => {
    let tracker: Tracker | null = null
    let stopped = false
    const wakeLock = createWakeLock()

    void startTracking({
      notificationText: "Recording your drive",
      onError: () => {},
      onFix: (fix) => {
        const last = lastCoord.current
        const delta = last ? haversineM(last, fix) : 0
        lastCoord.current = fix
        cumulative.current += delta
        const kmh = fix.speedKmh ?? 0
        setSpeed(Math.round(kmh))
        setDistance(Math.round(cumulative.current))
        if (meRef.current) {
          const point = { lat: fix.latitude, lng: fix.longitude }
          setPositions((p) => ({ ...p, [meRef.current as string]: point }))
          appendFix(meRef.current, point)
        }
        send({
          event: "telemetry.update",
          payload: {
            latitude: fix.latitude,
            longitude: fix.longitude,
            speed_kmh: kmh,
            heading_deg: fix.headingDeg,
            distance_delta_m: delta,
            cumulative_distance_m: cumulative.current,
            accuracy_m: fix.accuracyM,
            altitude_m: fix.altitudeM,
            recorded_at: fix.recordedAt.toISOString(),
          },
        })
      },
    }).then((t) => {
      if (stopped) void t.stop()
      else tracker = t
    })

    return () => {
      stopped = true
      void tracker?.stop()
      void wakeLock.release()
    }
  }, [send, appendFix])

  const avatars: Record<string, AvatarInfo> = {}
  if (myName) avatars[myName] = { url: user?.profile_picture_url, label: user?.display_name || myName }

  const state: DashboardState = {
    speedKmh: speed,
    distanceM: distance,
    score,
    gapM,
    elapsedS: elapsed,
    connected,
    recording: true,
  }

  const endDrive = async () => {
    if (!sessionId) return
    try {
      await sessions.end(sessionId)
    } catch {
      /* host-only; a guest just leaves the view */
    }
    navigate(routes.results(sessionId))
  }

  return (
    <div className="relative h-[100dvh] w-full bg-ink">
      <CarDashboard
        state={state}
        sessionName={session?.name}
        positions={positions}
        trails={trails}
        meName={myName}
        avatars={avatars}
        speedUnit={speedUnit}
        distUnit={distUnit}
        toSpeed={toSpeed}
        toDist={(m) => toDist(m, 1)}
        primaryLabel="End drive"
        onPrimary={endDrive}
      />

      <button
        onClick={() => sessionId && navigate(routes.live(sessionId))}
        aria-label="Leave car mode"
        className="absolute right-[2.5%] top-[16%] z-30 rounded-full border border-white/15 bg-black/50 p-2.5 text-white/70 backdrop-blur-xl transition-colors hover:text-white"
      >
        <Minimize2 size={16} />
      </button>
    </div>
  )
}
