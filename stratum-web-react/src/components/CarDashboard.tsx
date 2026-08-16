import { ReactNode } from "react"
import { Navigation, Square, Wifi, WifiOff } from "lucide-react"

import { LiveMap, MapPosition, AvatarInfo } from "./LiveMap"
import { fmtClock } from "../lib/format"

export interface DashboardState {
  /** Live speed, km/h. Converted for display by the caller's unit preference. */
  speedKmh: number
  /** Metres covered so far. */
  distanceM: number
  /** 0–100 driving score, or null before there's enough telemetry. */
  score: number | null
  /** Metres to the leader; null in a solo drive. */
  gapM: number | null
  /** Seconds since the drive started. */
  elapsedS: number
  /** Whether telemetry is actually flowing. */
  connected: boolean
  /** Whether a drive is recording. */
  recording: boolean
}

/**
 * The in-car screen — a landscape dashboard for a phone mounted in the car.
 *
 * Deliberately not called CarPlay or Android Auto: neither platform permits a
 * racing/telemetry app (their third-party categories are navigation, audio,
 * messaging, EV charging and parking, and none of them expose vehicle data).
 * This is a phone-in-a-mount view, which is a thing that can actually ship.
 *
 * Everything is sized for a glance at speed: one enormous number, a handful of
 * pills, and the map doing the rest. The same component backs the landing
 * film — fed by its fake clock — and the live drive, fed by real telemetry.
 */

/** Frosted panel — the glass the reference floats over its map. */
const Glass = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <div
    className={`rounded-2xl border border-white/10 bg-black/45 backdrop-blur-xl ${className}`}
    style={{ boxShadow: "0 8px 40px rgba(0,0,0,0.5)" }}
  >
    {children}
  </div>
)

export function CarDashboard({
  state,
  sessionName,
  vehicleLabel,
  positions = {},
  trails,
  meName,
  avatars,
  speedUnit = "km/h",
  distUnit = "km",
  toSpeed = (v) => Math.round(v),
  toDist = (m) => +(m / 1000).toFixed(1),
  onPrimary,
  primaryLabel,
  interactive = true,
  map,
}: {
  state: DashboardState
  sessionName?: string
  vehicleLabel?: string
  positions?: Record<string, MapPosition>
  trails?: Record<string, MapPosition[]>
  meName?: string
  avatars?: Record<string, AvatarInfo>
  speedUnit?: string
  distUnit?: string
  toSpeed?: (kmh: number) => number
  toDist?: (m: number) => number
  onPrimary?: () => void
  primaryLabel?: string
  /** Off for the landing film, where the screen is scenery rather than a control. */
  interactive?: boolean
  /**
   * What backs the screen. Defaults to the live Leaflet map; the landing film
   * passes a lightweight SVG instead, so a 15-second beat doesn't pull Leaflet
   * and a stream of satellite tiles into the marketing page.
   */
  map?: ReactNode
}) {
  const { speedKmh, distanceM, score, gapM, elapsedS, connected, recording } = state

  return (
    // containerType makes this box the reference for the cqw units used
    // throughout, so the same component reads correctly full-screen in Car mode
    // and shrunk into the cabin photo's centre display.
    <div
      className="relative h-full w-full overflow-hidden bg-ink"
      style={{ containerType: "size" }}
    >
      {/* Map fills the screen, exactly as in the reference — the UI is nearly
          weightless on top of it. */}
      <div className="absolute inset-0">
        {map ?? (
          <LiveMap
            positions={positions}
            trails={trails}
            meName={meName}
            avatars={avatars}
            selected={meName}
            showControls={false}
            followSelected
          />
        )}
      </div>

      {/* Readability wash: darkest at the left where the speed panel sits. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(100deg, rgba(8,8,10,0.85) 0%, rgba(8,8,10,0.35) 38%, rgba(8,8,10,0.1) 60%, rgba(8,8,10,0.45) 100%)",
        }}
      />

      {/* --- Status, top right ------------------------------------------- */}
      <div className="absolute right-[2.5%] top-[5%] z-20 flex items-center gap-3 text-[1.4cqw] text-white/70">
        <span className="flex items-center gap-1.5">
          {connected ? <Wifi size={13} /> : <WifiOff size={13} />}
          {connected ? "Live" : "No signal"}
        </span>
        <span className="stat-num tabular-nums">{fmtClock(elapsedS)}</span>
      </div>

      {/* --- Speed panel, left ------------------------------------------- */}
      <Glass className="absolute left-[2.5%] top-[8%] z-20 flex h-[74%] w-[22%] min-w-[132px] flex-col items-center justify-between px-3 py-[3%]">
        <div className="text-center">
          <div className="stat-num text-[6.4cqw] font-medium leading-none text-white">
            {toSpeed(speedKmh)}
          </div>
          <div className="mt-1 text-[1.2cqw] uppercase tracking-[0.18em] text-white/40">
            {speedUnit}
          </div>
        </div>

        {/* Stands in for the reference's top-down car render. */}
        <div className="flex flex-1 items-center justify-center">
          <svg viewBox="0 0 40 74" className="h-[58%] w-auto" aria-hidden>
            <path
              d="M20 3 C 29 3, 33 13, 33.5 26 L 35 44 C 35.5 58, 31 70, 20 71 C 9 70, 4.5 58, 5 44 L 6.5 26 C 7 13, 11 3, 20 3 Z"
              fill="rgba(255,255,255,0.09)"
              stroke="rgba(255,255,255,0.4)"
              strokeWidth="1.2"
            />
            <path d="M12 20 C 15 17, 25 17, 28 20 L 29 30 L 11 30 Z" fill="rgba(255,255,255,0.16)" />
            <rect x="11" y="40" width="18" height="14" rx="3" fill="rgba(255,255,255,0.1)" />
          </svg>
        </div>

        <div className="text-center">
          <div
            className={`stat-num text-[1.6cqw] font-medium ${recording ? "text-amber" : "text-white/35"}`}
          >
            {recording ? "REC" : "P"}
          </div>
          {vehicleLabel && (
            <div className="mt-1 truncate text-[1cqw] text-white/35">{vehicleLabel}</div>
          )}
        </div>
      </Glass>

      {/* --- Session block, centre-left ---------------------------------- */}
      <div className="absolute left-[27%] top-[26%] z-20 max-w-[42%]">
        <h2 className="display text-[4.4cqw] font-medium leading-none text-white drop-shadow-lg">
          {sessionName || "Ready to drive"}
        </h2>
        <div className="mt-2 flex items-center gap-4 text-[1.4cqw] text-white/60">
          <span className="stat-num">
            {toDist(distanceM)} {distUnit}
          </span>
          {gapM != null && <span className="stat-num text-amber">+{gapM} m to leader</span>}
        </div>

        {primaryLabel && (
          <button
            onClick={interactive ? onPrimary : undefined}
            disabled={!interactive}
            className={`mt-4 inline-flex items-center gap-2 rounded-pill border px-5 py-2 text-[1.3cqw] font-medium uppercase tracking-[0.16em] transition-colors ${
              recording
                ? "border-white/25 text-white/85 hover:border-white/50"
                : "border-amber bg-amber text-amber-ink hover:bg-amber-soft"
            } ${interactive ? "" : "cursor-default"}`}
          >
            {recording ? <Square size={12} /> : <Navigation size={12} />}
            {primaryLabel}
          </button>
        )}
      </div>

      {/* --- Score / gap pill, bottom centre ------------------------------ */}
      <Glass className="absolute bottom-[5%] left-1/2 z-20 flex -translate-x-1/2 items-center gap-4 px-5 py-2">
        <div className="text-center">
          <div className="text-[0.95cqw] uppercase tracking-[0.16em] text-white/35">Score</div>
          <div className="stat-num text-[2cqw] font-medium leading-tight text-white">
            {score ?? "—"}
          </div>
        </div>
        <span className="h-7 w-px bg-white/12" />
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10">
          <Navigation size={14} className="text-amber" />
        </div>
        <span className="h-7 w-px bg-white/12" />
        <div className="text-center">
          <div className="text-[0.95cqw] uppercase tracking-[0.16em] text-white/35">Dist</div>
          <div className="stat-num text-[2cqw] font-medium leading-tight text-white">
            {toDist(distanceM)}
          </div>
        </div>
      </Glass>
    </div>
  )
}
