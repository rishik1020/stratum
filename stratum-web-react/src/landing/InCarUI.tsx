import { motion } from "framer-motion"
import { Navigation } from "lucide-react"

import { BEATS, ramp, window_ } from "./useCinematic"

/**
 * The "inside the car" beat, shown from the driver's seat.
 *
 * The shipped 911 is a body shell with no cabin, so the interior is composed
 * here rather than modelled: a windscreen with the road moving past, a dash,
 * and the app running on the centre screen with a phone in a vent mount beside
 * it. The point of the beat is the telemetry appearing on the car's own
 * display, and that reads correctly whether the geometry exists or not.
 *
 * Everything is keyed off film time so it stays in step with the camera.
 */

const START_PRESS = BEATS.start

/**
 * Speed on the head unit.
 *
 * Keyed to the launch, not the button press — between tapping start and the
 * car actually moving the readout has to sit at zero, or the dash claims
 * triple digits while the car is visibly parked.
 */
const speedAt = (t: number) =>
  Math.round(Math.pow(ramp(t, BEATS.launch, BEATS.runtime), 0.8) * 214)

/** How far the drive has progressed, for the route line and the score. */
const driveProgress = (t: number) => ramp(t, BEATS.launch, BEATS.runtime)

const Readout = ({ label, value, unit, max }: { label: string; value: number; unit?: string; max: number }) => (
  <div className="min-w-0">
    <div className="text-[8px] uppercase tracking-[0.18em] text-white/35">{label}</div>
    <div className="stat-num mt-0.5 flex items-baseline gap-1 text-xl font-medium leading-none text-white">
      {value}
      {unit && <span className="text-[9px] text-white/40">{unit}</span>}
    </div>
    <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-white/10">
      <div className="h-full rounded-full bg-amber" style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
    </div>
  </div>
)

/** What's actually on the infotainment display. */
function ScreenContent({ t, started }: { t: number; started: boolean }) {
  const p = driveProgress(t)
  return (
    <div className="flex h-full flex-col bg-ink">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-3 py-1.5">
        <span className="display text-[9px] tracking-tight text-white/75">STRATUM</span>
        <span className="flex items-center gap-1 text-[7px] uppercase tracking-[0.18em] text-amber">
          <span className={`h-1 w-1 rounded-full bg-amber ${started ? "live-dot" : ""}`} />
          {started ? "Recording" : "Ready"}
        </span>
      </div>

      <div className="relative flex-1 bg-ink-1">
        <svg viewBox="0 0 300 120" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <defs>
            <pattern id="cabinGrid" width="26" height="26" patternUnits="userSpaceOnUse">
              <path d="M26 0 L0 0 0 26" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="300" height="120" fill="url(#cabinGrid)" />
          <path
            d="M20 104 C 70 104, 78 62, 122 60 S 190 70, 224 40 S 268 22, 284 18"
            fill="none"
            stroke="#FFB020"
            strokeWidth="2.5"
            strokeLinecap="round"
            pathLength={1}
            style={{
              strokeDasharray: 1,
              strokeDashoffset: 1 - p,
              filter: "drop-shadow(0 0 4px rgba(255,176,32,0.55))",
            }}
          />
          {started && <circle cx={20 + p * 264} cy={104 - p * 86} r="4" fill="#FFB020" />}
        </svg>

        {!started && (
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div
              animate={{ scale: [1, 1.07, 1] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-amber text-amber-ink"
            >
              <Navigation size={16} />
            </motion.div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 border-t border-white/[0.07] px-3 py-2">
        <Readout label="Speed" value={speedAt(t)} unit="km/h" max={220} />
        <Readout label="Score" value={started ? 60 + Math.round(p * 34) : 0} max={100} />
        <Readout label="Gap" value={started ? Math.round(180 * (1 - p)) : 0} unit="m" max={180} />
      </div>
    </div>
  )
}

export function InCarUI({ t }: { t: number }) {
  const opacity = window_(t, BEATS.uiIn, BEATS.uiOut, 0.8)
  if (opacity <= 0) return null

  const started = t >= START_PRESS
  const p = driveProgress(t)
  // Road rushes past faster as the car picks up speed.
  const streak = 0.15 + p * 0.85

  return (
    <motion.div style={{ opacity }} className="absolute inset-0 z-30 overflow-hidden">
      {/* --- Windscreen: the road going past ------------------------------ */}
      <div className="absolute inset-x-0 top-0 h-[42%] overflow-hidden">
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to bottom, #0d0d12 0%, #101018 60%, #08080a 100%)" }}
        />
        {/* Motion streaks — density and brightness ramp with the launch. */}
        <div
          className="absolute inset-0"
          style={{
            opacity: streak,
            backgroundImage:
              "repeating-linear-gradient(96deg, transparent 0 42px, rgba(255,255,255,0.10) 42px 46px)",
            maskImage: "radial-gradient(70% 100% at 50% 100%, black, transparent 75%)",
            WebkitMaskImage: "radial-gradient(70% 100% at 50% 100%, black, transparent 75%)",
          }}
        />
        <div
          className="absolute inset-x-0 bottom-0 h-1/2"
          style={{ background: "radial-gradient(60% 100% at 50% 100%, rgba(255,176,32,0.10), transparent 70%)" }}
        />
      </div>

      {/* --- A-pillars and roof line, framing the view -------------------- */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(105deg, #0a0a0d 0 9%, transparent 16%), linear-gradient(255deg, #0a0a0d 0 9%, transparent 16%), linear-gradient(to bottom, #0a0a0d 0 4%, transparent 12%)",
        }}
      />

      {/* --- Dash ---------------------------------------------------------- */}
      <div className="absolute inset-x-0 bottom-0 h-[62%]">
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(to bottom, #16161c 0%, #0d0d11 42%, #08080a 100%)",
            borderTop: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "0 -24px 60px rgba(0,0,0,0.8)",
          }}
        />

        {/* Screens sit on the dash, angled as if seen from the driver's seat. */}
        <div
          className="absolute inset-x-0 top-[8%] flex items-start justify-center gap-4 px-6 sm:gap-7"
          style={{ perspective: "1100px" }}
        >
          {/* Centre infotainment display */}
          <div
            className="w-[300px] shrink-0 sm:w-[360px]"
            style={{ transform: "rotateX(9deg) rotateY(6deg)", transformStyle: "preserve-3d" }}
          >
            <div className="rounded-[14px] bg-[#0a0a0c] p-[7px] shadow-float ring-1 ring-white/10">
              <div className="h-[168px] overflow-hidden rounded-[8px] ring-1 ring-white/[0.06] sm:h-[192px]">
                <ScreenContent t={t} started={started} />
              </div>
            </div>
            <p className="mt-2 text-center text-[8px] uppercase tracking-[0.22em] text-white/25">
              CarPlay · Android Auto
            </p>
          </div>

          {/* Phone in a vent mount */}
          <div
            className="w-[92px] shrink-0 sm:w-[104px]"
            style={{ transform: "rotateX(9deg) rotateY(-11deg)", transformStyle: "preserve-3d" }}
          >
            <div className="rounded-[16px] bg-[#0a0a0c] p-[5px] shadow-float ring-1 ring-white/10">
              <div className="overflow-hidden rounded-[12px] bg-ink">
                <div className="px-2 pt-2">
                  <div className="text-[6px] uppercase tracking-[0.18em] text-white/30">Live</div>
                  <div className="stat-num mt-0.5 text-2xl font-medium leading-none text-white">
                    {speedAt(t)}
                  </div>
                  <div className="text-[6px] text-white/30">km/h</div>
                </div>
                <div className="mt-1 h-[46px] px-1.5">
                  <svg viewBox="0 0 90 46" className="h-full w-full">
                    <path
                      d="M5 40 C 22 40, 26 18, 45 17 S 72 12, 86 6"
                      fill="none"
                      stroke="#FFB020"
                      strokeWidth="2"
                      strokeLinecap="round"
                      pathLength={1}
                      style={{ strokeDasharray: 1, strokeDashoffset: 1 - p }}
                    />
                  </svg>
                </div>
                <div className="flex items-center justify-between border-t border-white/[0.07] px-2 py-1">
                  <span className="text-[6px] uppercase tracking-[0.14em] text-white/30">
                    {started ? "Rec" : "Ready"}
                  </span>
                  <span className={`h-1 w-1 rounded-full ${started ? "live-dot bg-amber" : "bg-white/25"}`} />
                </div>
              </div>
            </div>
            <p className="mt-2 text-center text-[8px] uppercase tracking-[0.22em] text-white/25">Phone</p>
          </div>
        </div>
      </div>

      {/* --- Caption ------------------------------------------------------- */}
      <div className="absolute inset-x-0 top-[7%] z-10 px-6 text-center">
        <p className="text-[10px] font-medium uppercase tracking-[0.4em] text-amber">In the car</p>
        <h2 className="display mt-2.5 text-2xl leading-tight md:text-3xl">
          {started ? "And it's recording." : "Tap start. That's it."}
        </h2>
      </div>
    </motion.div>
  )
}
