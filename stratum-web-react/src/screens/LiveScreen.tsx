import { useState, useEffect, useRef, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { useAppStore } from "../store"
import { sessions } from "../api"
import { routes } from "../routes"
import { useRouteSession } from "../lib/useRouteSession"
import { SessionEvent, useSessionSocket } from "../lib/useSessionSocket"
import { LiveMap, MapPosition, AvatarInfo } from "../components/LiveMap"
import { Standings } from "../components/Standings"
import { TelemetryHUD, TelemetryFrame } from "../components/TelemetryHUD"
import { MapPin, ChevronDown, ChevronUp } from "lucide-react"

interface DriverState {
  user: string
  distance: number
  speed: number
  lat?: number
  lng?: number
}

// Haversine distance between two lat/lng points, in metres.
const distanceM = (a: GeolocationCoordinates, b: GeolocationCoordinates) => {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.latitude - a.latitude)
  const dLng = toRad(b.longitude - a.longitude)
  const lat1 = toRad(a.latitude)
  const lat2 = toRad(b.latitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

const G = 9.80665 // m/s² — to convert accelerometer magnitude into g

export const LiveScreen = () => {
  const navigate = useNavigate()
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
  const [roster, setRoster] = useState<Record<string, { displayName: string; avatarUrl?: string | null }>>({})

  const lastCoordRef = useRef<GeolocationCoordinates | null>(null)
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
        const next: Record<string, { displayName: string; avatarUrl?: string | null }> = {}
        for (const p of res.data as Array<{ username?: string; display_name?: string; profile_picture_url?: string | null }>) {
          if (p.username) next[p.username] = { displayName: p.display_name || p.username, avatarUrl: p.profile_picture_url }
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
      } else if (msg.event === "roster.changed") {
        loadRoster()
      } else if (msg.event === "session.ended") {
        navigate(routes.results(routeSessionId))
      }
    },
    [loadRoster, navigate, routeSessionId]
  )

  const { connected, send } = useSessionSocket(routeSessionId, handleEvent)

  // Geolocation → telemetry frames on the shared socket.
  useEffect(() => {
    let watchId: number | null = null
    if ("geolocation" in navigator) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const coords = pos.coords
          const last = lastCoordRef.current
          let delta = 0
          if (last) delta = distanceM(last, coords)
          lastCoordRef.current = coords
          cumulativeRef.current += delta

          // coords.speed is m/s and may be null indoors; fall back to 0.
          const speedKmh = coords.speed != null ? Math.max(0, coords.speed * 3.6) : 0
          setMySpeed(Math.round(speedKmh))
          setMyDistance(Math.round(cumulativeRef.current))
          setMyPos({ lat: coords.latitude, lng: coords.longitude })
          setAltitude(coords.altitude)
          setHeading(coords.heading != null && !Number.isNaN(coords.heading) ? coords.heading : null)
          if (speedKmh > topSpeedRef.current) {
            topSpeedRef.current = speedKmh
            setTopSpeed(Math.round(speedKmh))
          }

          send({
            event: "telemetry.update",
            payload: {
              latitude: coords.latitude,
              longitude: coords.longitude,
              speed_kmh: speedKmh,
              heading_deg: coords.heading,
              distance_delta_m: delta,
              cumulative_distance_m: cumulativeRef.current,
              accuracy_m: coords.accuracy,
              altitude_m: coords.altitude,
              g_force: gForceRef.current || null,
            },
          })
        },
        (err) => setGeoError(err.message || "Location unavailable"),
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
      )
    } else {
      setGeoError("Geolocation not supported by this browser")
    }

    return () => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId)
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

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-stratum-darker">
      {/* Map backdrop */}
      <div className="absolute inset-0">
        <LiveMap positions={mapPositions} meName={myName} avatars={avatars} showControls={false} />
      </div>

      {!hasPositions && (
        <div className="absolute inset-0 z-[400] pointer-events-none flex items-center justify-center">
          <div className="text-center">
            <MapPin size={40} className="mx-auto mb-3 opacity-40" />
            <p className="text-white/50 text-sm">Waiting for GPS positions…</p>
          </div>
        </div>
      )}

      {/* Top: telemetry HUD */}
      <div className="absolute top-0 inset-x-0 z-[600]">
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
            className="w-full bg-stratum-violet/15 text-stratum-violet text-xs font-medium py-2 border-b border-stratum-violet/20"
          >
            Tap to enable G-force (motion access)
          </button>
        )}
        {geoError && (
          <div className="w-full bg-red-500/15 text-red-300/90 text-xs py-2 px-4 text-center border-b border-red-500/20">
            Location: {geoError} — allow location access and move to capture telemetry.
          </div>
        )}
      </div>

      {/* Bottom: standings (races only) + controls */}
      <div className="absolute bottom-0 inset-x-0 z-[600] bg-stratum-darker/85 backdrop-blur-md border-t border-white/10">
        {!isSolo && (
          <>
            <button
              onClick={() => setShowBoard((s) => !s)}
              className="w-full flex items-center justify-between px-4 py-3"
            >
              <span className="font-semibold text-sm">Leaderboard</span>
              <span className="flex items-center gap-1.5 text-xs text-white/45">
                {myStanding ? `P${myStanding.position} / ${standings.length}` : "Gap · Interval"}
                {showBoard ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              </span>
            </button>
            {showBoard && (
              <div className="px-4 pb-3 max-h-[38vh] overflow-y-auto">
                <Standings standings={standings} myName={myName} avatars={avatars} />
              </div>
            )}
          </>
        )}

        <div className="flex gap-2 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
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
      </div>
    </div>
  )
}
