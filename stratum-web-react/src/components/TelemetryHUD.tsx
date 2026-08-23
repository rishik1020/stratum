import { Radio } from "lucide-react"
import { fmtClock } from "../lib/format"

/**
 * One frame of telemetry to display. Phone-derived fields are populated live;
 * anything the phone can't produce (engine internals) is simply omitted for now
 * and can be added later without touching this layout.
 */
export interface TelemetryFrame {
  speedKmh: number
  altitudeM: number | null
  gForce: number | null
  headingDeg: number | null
  distanceM: number
  topSpeedKmh: number
}

const CARDINALS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
const cardinal = (deg: number) => CARDINALS[Math.round((((deg % 360) + 360) % 360) / 45) % 8]

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

const Bar = ({ fill }: { fill: number }) => (
  <div className="h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
    <div
      className="h-full rounded-full bg-amber/80 transition-[width] duration-300 ease-out"
      style={{ width: `${clamp01(fill) * 100}%` }}
    />
  </div>
)

const Gauge = ({
  label,
  value,
  unit,
  fill,
}: {
  label: string
  value: string
  unit?: string
  fill?: number
}) => (
  <div className="min-w-0">
    <span className="eyebrow block truncate">{label}</span>
    <div className="flex items-baseline gap-1 mt-1 mb-2">
      <span className="stat-num text-xl font-medium leading-none">{value}</span>
      {unit && <span className="text-xs text-white/40">{unit}</span>}
    </div>
    {fill !== undefined ? <Bar fill={fill} /> : <div className="h-1.5 rounded-full bg-white/[0.04]" />}
  </div>
)

/**
 * Telemetry HUD overlay — the gauge panel that sits over the live map during a
 * session (and, later, over a replay). One component drives both live and replay
 * modes via the `frame` it's handed.
 */
export const TelemetryHUD = ({
  frame,
  title,
  mode = "live",
  elapsedS,
  durationS,
  onSeek,
  online = true,
  speedMax = 220,
  gMax = 1.5,
}: {
  frame: TelemetryFrame
  title?: string
  mode?: "live" | "replay"
  elapsedS: number
  durationS?: number
  onSeek?: (seconds: number) => void
  online?: boolean
  speedMax?: number
  gMax?: number
}) => {
  const total = durationS ?? elapsedS
  const progress = total > 0 ? clamp01(elapsedS / total) : 0

  return (
    <div className="safe-top bg-ink/80 backdrop-blur-md border-b border-hairline overflow-hidden">
      {/* Top strip: title + LIVE / playback position */}
      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3">
        <div className="min-w-0">
          <span className="eyebrow">
            Telemetry{mode === "live" ? ` · ${fmtClock(elapsedS)}` : ""}
          </span>
          <h1 className="text-base font-medium truncate">{title || "Sprint in progress"}</h1>
        </div>
        {mode === "live" ? (
          online ? (
            <span className="shrink-0 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-negative">
              <Radio size={13} className="animate-pulse" />
              Live
            </span>
          ) : (
            <span className="shrink-0 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.16em] text-white/40">
              <Radio size={13} />
              Offline
            </span>
          )
        ) : (
          <span className="stat-num shrink-0 text-sm text-white/60">
            {fmtClock(elapsedS)} <span className="text-white/30">/ {fmtClock(total)}</span>
          </span>
        )}
      </div>

      {/* Scrubber — interactive in replay, a thin progress line in live */}
      <div className="px-4">
        {mode === "replay" ? (
          <input
            type="range"
            min={0}
            max={Math.max(1, Math.floor(total))}
            value={Math.floor(elapsedS)}
            onChange={(e) => onSeek?.(Number(e.target.value))}
            // The HUD floats over the map inside a pointer-events-none layer, so map
            // drags pass through its empty areas. Nothing re-enabled events for the
            // scrubber, which meant it animated along but could never be grabbed —
            // onSeek had no way to fire. Only this control opts back in.
            className="scrub pointer-events-auto w-full cursor-pointer accent-amber"
          />
        ) : (
          <div className="h-0.5 rounded-full bg-ink-3 overflow-hidden">
            <div className="h-full bg-white/30" style={{ width: `${progress * 100}%` }} />
          </div>
        )}
      </div>

      {/* Gauge grid — phone-derived metrics */}
      <div className="grid grid-cols-3 gap-x-4 gap-y-4 px-4 py-4">
        <Gauge label="Speed" value={`${Math.round(frame.speedKmh)}`} unit="km/h" fill={frame.speedKmh / speedMax} />
        <Gauge
          label="Altitude"
          value={frame.altitudeM != null ? `${Math.round(frame.altitudeM)}` : "—"}
          unit={frame.altitudeM != null ? "m" : undefined}
        />
        <Gauge
          label="G-force"
          value={frame.gForce != null ? frame.gForce.toFixed(2) : "—"}
          unit={frame.gForce != null ? "g" : undefined}
          fill={frame.gForce != null ? frame.gForce / gMax : undefined}
        />
        <Gauge
          label="Heading"
          value={frame.headingDeg != null ? `${cardinal(frame.headingDeg)} ${String(Math.round(frame.headingDeg)).padStart(3, "0")}°` : "—"}
        />
        <Gauge label="Distance" value={(frame.distanceM / 1000).toFixed(2)} unit="km" />
        <Gauge label="Top speed" value={`${Math.round(frame.topSpeedKmh)}`} unit="km/h" />
      </div>
    </div>
  )
}
