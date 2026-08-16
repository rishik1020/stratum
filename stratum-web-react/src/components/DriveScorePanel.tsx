import { useEffect, useState } from "react"
import { sessions as sessionsApi } from "../api"
import { fmtDuration } from "../lib/format"
import { useUnits } from "../lib/units"
import { Shield, Leaf, Gauge, Sofa, TrendingUp, AlertTriangle, Lightbulb } from "lucide-react"

interface DriveAnalytics {
  status: string
  metrics: {
    distance_m: number
    duration_s: number
    moving_time_s: number
    idle_time_s: number
    avg_speed_kmh: number
    max_speed_kmh: number
    stop_count: number
    day_ratio: number
    night_ratio: number
    fuel_liters_est: number | null
    co2_grams_est: number | null
  }
  events: {
    harsh_braking: number
    rapid_acceleration: number
    sharp_cornering: number
    speeding_ratio: number
    /** Worst moment, km/h over the limit. Only meaningful when limits_matched. */
    max_over_limit_kmh?: number
    /**
     * Whether real road limits were map-matched for this drive. False means the
     * lenient flat fallback was used — usually a cold road-tile cache. The UI
     * must not report a speeding figure derived from that as if it were
     * measured against actual roads.
     */
    limits_matched?: boolean
  }
  score: { overall: number; safety: number; eco: number; performance: number; comfort: number }
  insights: {
    summary: string
    smooth_pct: number
    strengths: string[]
    weaknesses: string[]
    recommendations: string[]
    explanations: string[]
  }
}

const scoreColor = (v: number) => (v >= 80 ? "#5cb98a" : v >= 60 ? "#cda349" : "#d97b7b")

const ScoreRing = ({ value }: { value: number }) => {
  const r = 52
  const c = 2 * Math.PI * r
  const offset = c * (1 - value / 100)
  return (
    <div className="relative w-32 h-32">
      <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
        <circle
          cx="60" cy="60" r={r} fill="none" stroke={scoreColor(value)} strokeWidth="10"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <strong className="stat-num text-3xl font-medium leading-none">{value}</strong>
        <span className="text-[10px] uppercase tracking-widest text-white/45">Overall</span>
      </div>
    </div>
  )
}

const SubBar = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) => (
  <div>
    <div className="flex items-center justify-between mb-1">
      <span className="flex items-center gap-1.5 text-sm text-white/70">{icon}{label}</span>
      <strong className="text-sm">{value}</strong>
    </div>
    <div className="h-2 rounded-full bg-ink-3 overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${value}%`, background: scoreColor(value) }} />
    </div>
  </div>
)

export const DriveScorePanel = ({ sessionId }: { sessionId: number }) => {
  const { speedUnit, distUnit, toSpeed, toDist } = useUnits()
  const [data, setData] = useState<DriveAnalytics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    sessionsApi
      .driveAnalytics(sessionId)
      .then((res) => setData(res.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [sessionId])

  if (loading) return <div className="card">Analyzing your drive…</div>
  if (!data || data.status !== "ok") {
    return (
      <div className="card text-white/60 text-sm">
        Not enough telemetry to score your latest drive. Race with location enabled (and move) to
        capture a scored drive.
      </div>
    )
  }

  const { metrics, events, score, insights } = data

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2"><TrendingUp size={18} className="text-white/50" /> Drive Score & Coach</h3>
        <span className="eyebrow">latest drive</span>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="flex flex-col items-center justify-center">
          <ScoreRing value={score.overall} />
          <p className="text-xs text-white/60 mt-3 text-center">{insights.summary}</p>
        </div>

        <div className="col-span-2 space-y-3">
          <SubBar icon={<Shield size={14} className="text-amber" />} label="Safety" value={score.safety} />
          <SubBar icon={<Leaf size={14} className="text-positive" />} label="Eco" value={score.eco} />
          <SubBar icon={<Gauge size={14} className="text-amber" />} label="Performance" value={score.performance} />
          <SubBar icon={<Sofa size={14} className="text-pink-400" />} label="Comfort" value={score.comfort} />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mt-6">
        {[
          ["Distance", `${toDist(metrics.distance_m)} ${distUnit}`],
          ["Moving", fmtDuration(metrics.moving_time_s)],
          ["Idle", fmtDuration(metrics.idle_time_s)],
          ["Stops", `${metrics.stop_count}`],
          ["Avg speed", `${toSpeed(metrics.avg_speed_kmh)} ${speedUnit}`],
          ["Max speed", `${toSpeed(metrics.max_speed_kmh)} ${speedUnit}`],
          ["Fuel est.", metrics.fuel_liters_est != null ? `${metrics.fuel_liters_est} L` : "—"],
          ["CO₂ est.", metrics.co2_grams_est != null ? `${(metrics.co2_grams_est / 1000).toFixed(2)} kg` : "—"],
        ].map(([k, v]) => (
          <div key={k} className="bg-ink-2 border border-hairline rounded-lg px-3 py-2">
            <span className="text-[11px] text-white/45 block">{k}</span>
            <strong className="stat-num text-sm font-medium">{v}</strong>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        {events.harsh_braking > 0 && <Chip text={`${events.harsh_braking} harsh braking`} tone="bad" />}
        {events.rapid_acceleration > 0 && <Chip text={`${events.rapid_acceleration} hard accel`} tone="bad" />}
        {events.sharp_cornering > 0 && <Chip text={`${events.sharp_cornering} sharp corners`} tone="bad" />}
        {events.speeding_ratio > 0.05 && (
          <Chip
            text={
              events.max_over_limit_kmh
                ? `${Math.round(events.speeding_ratio * 100)}% over limit · peak +${Math.round(events.max_over_limit_kmh)}`
                : `${Math.round(events.speeding_ratio * 100)}% over limit`
            }
            tone="bad"
          />
        )}
        {insights.smooth_pct >= 70 && <Chip text={`${insights.smooth_pct}% smooth`} tone="good" />}
      </div>

      {/* Say so when the Safety score couldn't be checked against real roads,
          rather than letting a clean-looking number imply it was. */}
      {events.limits_matched === false && (
        <p className="mt-2 text-[11px] text-white/40">
          Road speed limits weren’t available for this drive, so speeding wasn’t assessed.
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 mt-5">
        <div>
          {insights.strengths.length > 0 && (
            <>
              <p className="text-xs font-medium text-positive mb-1">Strengths</p>
              <ul className="space-y-1 mb-3">
                {insights.strengths.map((s, i) => (
                  <li key={i} className="text-sm text-white/75">• {s}</li>
                ))}
              </ul>
            </>
          )}
          {insights.weaknesses.length > 0 && (
            <>
              <p className="text-xs font-medium text-negative mb-1 flex items-center gap-1"><AlertTriangle size={12} /> Weaknesses</p>
              <ul className="space-y-1">
                {insights.weaknesses.map((s, i) => (
                  <li key={i} className="text-sm text-white/75">• {s}</li>
                ))}
              </ul>
            </>
          )}
        </div>
        <div>
          <p className="text-xs font-medium text-amber mb-1 flex items-center gap-1"><Lightbulb size={12} /> Coach recommends</p>
          <ul className="space-y-1">
            {insights.recommendations.map((s, i) => (
              <li key={i} className="text-sm text-white/75">• {s}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

const Chip = ({ text, tone }: { text: string; tone: "good" | "bad" }) => (
  <span
    className={`text-xs font-medium px-2.5 py-1 rounded-full ${
      tone === "good" ? "bg-positive/15 text-positive" : "bg-negative/15 text-negative"
    }`}
  >
    {text}
  </span>
)
