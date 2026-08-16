import { useState, useEffect, useRef, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { useAppStore } from "../store"
import { sessions } from "../api"
import { routes } from "../routes"
import { useRouteSession } from "../lib/useRouteSession"
import { SessionEvent, useSessionSocket } from "../lib/useSessionSocket"
import {
  Fix,
  Tracker,
  createWakeLock,
  haversineM,
  startTracking,
  webBackgroundLimitation,
} from "../lib/tracking"
import { LiveMap, MapPosition, AvatarInfo } from "../components/LiveMap"
import { RacerPanel } from "../components/RacerPanel"
import { RacerCard } from "../components/RacerCard"
import { TelemetryHUD, TelemetryFrame } from "../components/TelemetryHUD"
import { fmtClock } from "../lib/format"
import { useUnits } from "../lib/units"
import { AnimatePresence } from "framer-motion"
import { MapPin, ChevronDown, ChevronUp, Maximize2 } from "lucide-react"

interface RosterEntry {
  displayName: string
  avatarUrl?: string | null
  /** "2024 Honda Civic" — shown on the selected racer's card. */
  vehicleLabel?: string
}

interface DriverState {
  user: string
  distance: number
  speed: number
  lat?: number
  lng?: number
}

const G = 9.80665 // m/s² — to convert accelerometer magnitude into g

// Cap on stored breadcrumb points per racer. A long drive at ~1 Hz would grow
// without bound and the polyline redraw cost grows with it; the oldest fixes
// are the least interesting, so drop from the front.
const MAX_TRAIL_POINTS = 600

const appendFix = (
  trails: Record<string, MapPosition[]>,
  who: string,
  fix: MapPosition
): Record<string, MapPosition[]> => {
  const existing = trails[who] ?? []
  const last = existing[existing.length - 1]
  // Skip fixes that haven't meaningfully moved (~1 m), so a parked car doesn't
  // pile up thousands of identical points.
  if (last && Math.abs(last.lat - fix.lat) < 1e-5 && Math.abs(last.lng - fix.lng) < 1e-5) {
    return trails
  }
  const next = [...existing, fix]
  return { ...trails, [who]: next.length > MAX_TRAIL_POINTS ? next.slice(-MAX_TRAIL_POINTS) : next }
}

export const LiveScreen = () => {
  const navigate = useNavigate()
  const { toSpeed } = useUnits()
  const { id: routeSessionId, session: currentSession } = useRouteSession()
  const setCurrentSession = useAppStore((s) => s.setCurrentSession)
  const user = useAppStore((s) => s.user)

  const [elapsedTime, setElapsedTime] = useState(0)
  const [geoError, setGeoError] = useState("")
  const [mySpeed, setMySpeed] = useState(0)
  const [myDistance, setMyDistance] = useState(0)
  const [topSpeed, setTopSpeed] = useState(0)
  const [altitude, setAltitude] = useState<number | null>(null)
  const [heading, setHeading] = useState<number | null>(null)
  const [gForce, setGForce] = useState<number | null>(null)
  const [drivers, setDrivers] = useState<Record<string, DriverState>>({})
  const [myPos, setMyPos] = useState<MapPosition | null>(null)
  const [needsMotionPermission, setNeedsMotionPermission] = useState(false)
  const [showBoard, setShowBoard] = useState(true)
  const [roster, setRoster] = useState<Record<string, RosterEntry>>({})
  const [selected, setSelected] = useState<string | undefined>(undefined)
  // Breadcrumb per racer, appended as fixes arrive, so the map can draw where
  // everyone has actually been rather than just where they are.
  const [trails, setTrails] = useState<Record<string, MapPosition[]>>({})

  // Our own username, held in a ref so the geolocation callback can tag trail
  // points without the watch being torn down and re-registered on every render.
  const meRef = useRef<string | undefined>(undefined)
  const lastCoordRef = useRef<Fix | null>(null)
  const cumulativeRef = useRef(0)
  const topSpeedRef = useRef(0)
  const gForceRef = useRef(0)
  const lastGSetRef = useRef(0)

  // --- DeviceMotion → g-force -------------------------------------------------
  // Phone-native metric. Prefer gravity-removed linear acceleration (reads ~0 at
  // rest); fall back to gravity-inclusive magnitude minus 1g. Smoothed and
  // throttled so we don't re-render at the sensor's ~60 Hz.
  const handleMotion = useCallback((e: DeviceMotionEvent) => {
    const lin = e.acceleration
    let g: number
    if (lin && lin.x != null) {
      g = Math.sqrt((lin.x || 0) ** 2 + (lin.y || 0) ** 2 + (lin.z || 0) ** 2) / G
    } else {
      const ag = e.accelerationIncludingGravity
      if (!ag || ag.x == null) return
      const mag = Math.sqrt((ag.x || 0) ** 2 + (ag.y || 0) ** 2 + (ag.z || 0) ** 2)
      g = Math.abs(mag - G) / G
    }
    gForceRef.current = gForceRef.current * 0.6 + g * 0.4
    const now = Date.now()
    if (now - lastGSetRef.current > 150) {
      lastGSetRef.current = now
      setGForce(Math.max(0, gForceRef.current))
    }
  }, [])

  const enableMotion = async () => {
    const DME = window.DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> }
    try {
      const res = await DME.requestPermission?.()
      if (res === "granted") {
        window.addEventListener("devicemotion", handleMotion)
        setNeedsMotionPermission(false)
      }
    } catch {
      /* permission denied / unavailable — gauge stays "—" */
    }
  }

  useEffect(() => {
    const DME = window.DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> } | undefined
    if (!DME) return
    // iOS 13+ gates motion behind a user-gesture permission prompt.
    if (typeof DME.requestPermission === "function") {
      setNeedsMotionPermission(true)
    } else {
      window.addEventListener("devicemotion", handleMotion)
    }
    return () => window.removeEventListener("devicemotion", handleMotion)
  }, [handleMotion])

  // Elapsed-time ticker.
  useEffect(() => {
    const timer = setInterval(() => setElapsedTime((t) => t + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  // Roster: participant display names + avatars, keyed by username (telemetry is
  // keyed by username too). Loaded on arrival, then refreshed only when the
  // server says the roster changed — it used to re-poll every 10 seconds.
  const loadRoster = useCallback(() => {
    if (!routeSessionId) return
    sessions
      .participants(routeSessionId)
      .then((res) => {
        const next: Record<string, RosterEntry> = {}
        for (const p of res.data as Array<{ username?: string; display_name?: string; profile_picture_url?: string | null; vehicle_label?: string | null }>) {
          if (p.username)
            next[p.username] = {
              displayName: p.display_name || p.username,
              avatarUrl: p.profile_picture_url,
              vehicleLabel: p.vehicle_label ?? undefined,
            }
        }
        setRoster(next)
      })
      .catch(() => {})
  }, [routeSessionId])

  useEffect(() => {
    loadRoster()
  }, [loadRoster])

  const handleEvent = useCallback(
    (msg: SessionEvent) => {
      if (msg.event === "telemetry.update") {
        const { user: who, speed_kmh, cumulative_distance_m, latitude, longitude } = msg.payload
        setDrivers((prev) => ({
          ...prev,
          [who]: {
            user: who,
            speed: Math.round(speed_kmh ?? 0),
            distance: Math.round(cumulative_distance_m ?? prev[who]?.distance ?? 0),
            lat: latitude ?? prev[who]?.lat,
            lng: longitude ?? prev[who]?.lng,
          },
        }))
        if (latitude != null && longitude != null) {
          setTrails((prev) => appendFix(prev, who, { lat: latitude, lng: longitude }))
        }
      } else if (msg.event === "roster.changed") {
        loadRoster()
      } else if (msg.event === "session.ended") {
        navigate(routes.results(routeSessionId))
      }
    },
    [loadRoster, navigate, routeSessionId]
  )

  const { connected, send, queuedCount } = useSessionSocket(routeSessionId, handleEvent)

  // Location → telemetry frames on the shared socket.
  //
  // Goes through `startTracking` rather than watchPosition directly: on a phone
  // that means an Android foreground service, so the drive keeps recording with
  // the screen off. In a browser it's still watchPosition and still stops when
  // you leave the tab — hence the wake lock, and the warning in the UI.
  useEffect(() => {
    let tracker: Tracker | null = null
    let stopped = false
    const wakeLock = createWakeLock()

    void startTracking({
      notificationText: "Recording your drive",
      onError: (message) => setGeoError(message),
      onFix: (fix) => {
        const last = lastCoordRef.current
        const delta = last ? haversineM(last, fix) : 0
        lastCoordRef.current = fix
        cumulativeRef.current += delta

        const speedKmh = fix.speedKmh ?? 0
        setMySpeed(Math.round(speedKmh))
        setMyDistance(Math.round(cumulativeRef.current))
        setMyPos({ lat: fix.latitude, lng: fix.longitude })
        // Our own trail comes straight from the device rather than waiting
        // for the broadcast to echo back.
        if (meRef.current) {
          const point = { lat: fix.latitude, lng: fix.longitude }
          setTrails((prev) => appendFix(prev, meRef.current as string, point))
        }
        setAltitude(fix.altitudeM)
        setHeading(fix.headingDeg)
        if (speedKmh > topSpeedRef.current) {
          topSpeedRef.current = speedKmh
          setTopSpeed(Math.round(speedKmh))
        }

        send({
          event: "telemetry.update",
          payload: {
            latitude: fix.latitude,
            longitude: fix.longitude,
            speed_kmh: speedKmh,
            heading_deg: fix.headingDeg,
            distance_delta_m: delta,
            cumulative_distance_m: cumulativeRef.current,
            accuracy_m: fix.accuracyM,
            altitude_m: fix.altitudeM,
            g_force: gForceRef.current || null,
            // Stamped on the device. Frames queued while the socket was down
            // replay later, and without this they'd all land at flush time —
            // collapsing minutes of driving into one instant.
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
  }, [send])

  const handleEnd = async () => {
    if (!currentSession) return
    try {
      await sessions.end(currentSession.id)
      // The session.ended broadcast will navigate everyone (including us),
      // but navigate directly too in case our own socket already closed.
      navigate(routes.results(currentSession.id))
    } catch (err) {
      console.error(err)
    }
  }

  // Actually leave the session, not just navigate away from it. Without the
  // call the racer stays in the participant list and keeps getting ranked at
  // the finish on whatever distance they'd covered.
  const handleLeave = async () => {
    if (currentSession) {
      try {
        await sessions.leave(currentSession.id)
      } catch (err) {
        console.error(err)
      }
    }
    setCurrentSession(null)
    navigate(routes.dashboard)
  }

  const leaderboard = Object.values(drivers).sort((a, b) => b.distance - a.distance)
  const leaderDistance = leaderboard[0]?.distance ?? 0
  const myName = user?.username

  useEffect(() => {
    meRef.current = myName
  }, [myName])

  // Default the selection to yourself once telemetry starts, so the map opens
  // showing your own trail rather than nothing.
  useEffect(() => {
    if (!selected && myName && drivers[myName]) setSelected(myName)
  }, [selected, myName, drivers])

  // F1 timing-tower style standings: for each racer, the gap to the leader and
  // the interval to the car directly ahead (both in metres, since the sprint is
  // won on distance covered).
  const standings = leaderboard.map((driver, idx) => ({
    ...driver,
    position: idx + 1,
    gapToLeaderM: Math.max(0, Math.round(leaderDistance - driver.distance)),
    intervalM: idx === 0 ? 0 : Math.max(0, Math.round(leaderboard[idx - 1].distance - driver.distance)),
  }))
  const myStanding = standings.find((s) => s.user === myName)

  // Latest known position per racer for the live map. Our own device fix takes
  // precedence over the echoed-back broadcast for the freshest dot.
  const mapPositions: Record<string, MapPosition> = {}
  for (const [name, d] of Object.entries(drivers)) {
    if (d.lat != null && d.lng != null) mapPositions[name] = { lat: d.lat, lng: d.lng }
  }
  if (myName && myPos) mapPositions[myName] = myPos
  const hasPositions = Object.keys(mapPositions).length > 0

  // Avatar + display-name lookup for the map pins and the roster.
  const avatars: Record<string, AvatarInfo> = {}
  for (const [name, r] of Object.entries(roster)) {
    avatars[name] = { url: r.avatarUrl, label: r.displayName }
  }
  if (myName) {
    avatars[myName] = { url: user?.profile_picture_url, label: user?.display_name || myName }
  }

  const frame: TelemetryFrame = {
    speedKmh: mySpeed,
    altitudeM: altitude,
    gForce,
    headingDeg: heading,
    distanceM: myDistance,
    topSpeedKmh: topSpeed,
  }

  const isHost = user?.id === currentSession?.host_user_id
  const isSolo = !!currentSession?.is_solo

  // Live speed chip under each pin, as in the reference.
  const badges: Record<string, string> = {}
  for (const s of standings) badges[s.user] = `${toSpeed(s.speed)}`

  const selectedRacer = standings.find((s) => s.user === selected)

  const controls = (
    <div className="flex gap-2">
      {isSolo ? (
        <button onClick={handleEnd} className="btn-primary flex-1">
          End drive
        </button>
      ) : (
        <>
          <button onClick={handleLeave} className="btn-secondary flex-1">
            Leave
          </button>
          {isHost && (
            <button onClick={handleEnd} className="btn-primary flex-1">
              End Session
            </button>
          )}
        </>
      )}
    </div>
  )

  const mapPane = (
    <div className="relative h-full w-full">
      <LiveMap
        positions={mapPositions}
        meName={myName}
        avatars={avatars}
        trails={trails}
        badges={badges}
        selected={selected}
        onSelect={setSelected}
        showControls={false}
      />

      {!hasPositions && (
        <div className="pointer-events-none absolute inset-0 z-[400] flex items-center justify-center">
          <div className="text-center">
            <MapPin size={40} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm text-white/50">Waiting for GPS positions…</p>
          </div>
        </div>
      )}

      {/* Into the mounted-phone view. */}
      <button
        onClick={() => routeSessionId && navigate(routes.carMode(routeSessionId))}
        aria-label="Car mode"
        title="Car mode"
        className="absolute right-4 top-4 z-[500] rounded-full border border-hairline-strong bg-ink-2/90 p-2.5 text-white/70 backdrop-blur-xl transition-colors hover:text-white md:hidden"
      >
        <Maximize2 size={16} />
      </button>

      {/* Floating detail card for the picked racer. */}
      <div className="pointer-events-none absolute right-4 top-4 z-[500] hidden md:block">
        <AnimatePresence>
          {selectedRacer && (
            <div className="pointer-events-auto">
              <RacerCard
                racer={selectedRacer}
                avatar={avatars[selectedRacer.user]}
                isMe={selectedRacer.user === myName}
                vehicleLabel={roster[selectedRacer.user]?.vehicleLabel}
                onClose={() => setSelected(undefined)}
              />
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-ink md:flex">
      {/* --- Desktop: roster rail beside the map ---------------------------- */}
      <aside className="hidden w-[320px] shrink-0 flex-col border-r border-hairline bg-ink-1 md:flex">
        <div className="safe-top px-4 pt-4">
          <span className="eyebrow">{isSolo ? "Drive" : "Session"}</span>
          <h1 className="display mt-1 truncate text-xl">{currentSession?.name || "Live"}</h1>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`h-1.5 w-1.5 rounded-full ${connected ? "live-dot bg-amber" : "bg-white/25"}`}
            />
            <span className="stat-num text-xs text-white/45">
              {connected ? "Live" : "Reconnecting"} · {fmtClock(elapsedTime)}
              {/* Losing the socket no longer loses the drive — say so, or a
                  driver watching "Reconnecting" assumes it's being thrown away. */}
              {queuedCount > 0 && ` · ${queuedCount} held`}
            </span>
          </div>
        </div>

        <div className="mt-4 min-h-0 flex-1">
          <RacerPanel
            racers={standings}
            avatars={avatars}
            meName={myName}
            selected={selected}
            onSelect={setSelected}
            title={isSolo ? "You" : "Racers"}
          />
        </div>

        <div className="border-t border-hairline p-4">{controls}</div>
      </aside>

      {/* --- Map ----------------------------------------------------------- */}
      <div className="absolute inset-0 md:relative md:flex-1">{mapPane}</div>

      {/* --- Mobile: HUD on top, sheet at the bottom ------------------------ */}
      <div className="absolute inset-x-0 top-0 z-[600] md:hidden">
        <TelemetryHUD
          frame={frame}
          title={currentSession?.name}
          mode="live"
          elapsedS={elapsedTime}
          online={connected}
        />
        {needsMotionPermission && (
          <button
            onClick={enableMotion}
            className="w-full border-b border-amber/20 bg-amber/15 py-2 text-xs font-medium text-amber"
          >
            Tap to enable G-force (motion access)
          </button>
        )}
        {geoError && (
          <div className="w-full border-b border-negative/20 bg-negative/15 px-4 py-2 text-center text-xs text-negative">
            Location: {geoError} — allow location access and move to capture telemetry.
          </div>
        )}
        {/* A browser tab cannot track in the background, whatever we do here.
            Better they hear it from us now than discover it from a drive that
            recorded three minutes of a forty-minute trip. */}
        {webBackgroundLimitation && !geoError && (
          <div className="w-full border-b border-hairline bg-ink/85 px-4 py-2 text-center text-[11px] text-white/50">
            Keep this tab open — browsers stop recording when you switch away. The
            Android app keeps going with the screen off.
          </div>
        )}
        {queuedCount > 0 && (
          <div className="w-full border-b border-amber/20 bg-amber/10 px-4 py-2 text-center text-[11px] text-amber">
            Offline — {queuedCount} fixes held, they’ll upload when you reconnect.
          </div>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 z-[600] border-t border-hairline bg-ink/90 backdrop-blur-md md:hidden">
        {!isSolo && (
          <>
            <button
              onClick={() => setShowBoard((s) => !s)}
              className="flex w-full items-center justify-between px-4 py-3"
            >
              <span className="text-sm font-semibold">Leaderboard</span>
              <span className="flex items-center gap-1.5 text-xs text-white/45">
                {myStanding ? `P${myStanding.position} / ${standings.length}` : "Gap · Interval"}
                {showBoard ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              </span>
            </button>
            {showBoard && (
              <div className="max-h-[38vh] overflow-y-auto pb-3">
                <RacerPanel
                  racers={standings}
                  avatars={avatars}
                  meName={myName}
                  selected={selected}
                  onSelect={setSelected}
                  title="Racers"
                />
              </div>
            )}
          </>
        )}

        <div className="px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">{controls}</div>
      </div>
    </div>
  )
}
