import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Navigation } from "lucide-react"

import { BEATS, ramp, window_ } from "./useCinematic"

/**
 * The "inside the car" beat, composited onto a real interior photograph.
 *
 * The 911 model is a body shell with no cabin, so rather than model or fake an
 * interior this lays the Stratum UI onto the actual infotainment screen in a
 * driver's-POV photo. The telemetry appears where it genuinely would — on the
 * car's own display — and the surroundings are photoreal rather than CSS
 * approximations of leather.
 *
 * Falls back to a plain dark cabin if the photo isn't present, so the film
 * never breaks on a missing asset.
 */

const CABIN_IMAGE = "/cabin/driver.jpg"

/**
 * Where the infotainment screen sits in that photo, as percentages of the
 * image box, plus the perspective it's seen at.
 *
 * Tune these against the real photo — open the film at `#/?t=10.5` and nudge
 * until the overlay sits inside the bezel. They're percentages so they hold as
 * the image scales, and they're here rather than inline precisely because
 * they're the numbers most likely to need adjusting.
 */
const SCREEN = {
  left: 52.6,
  top: 38.5,
  width: 12.6,
  height: 8.3,
  /** The dash angles the display toward the driver. */
  rotateY: -13,
  rotateX: 2,
}

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

const driveProgress = (t: number) => ramp(t, BEATS.launch, BEATS.runtime)

/** What's rendered onto the car's screen. Kept dense — it's a small target. */
function ScreenContent({ t, started }: { t: number; started: boolean }) {
  const p = driveProgress(t)
  return (
    <div className="flex h-full w-full flex-col bg-[#08080a]">
      <div className="flex items-center justify-between px-[4%] pt-[3%]">
        <span className="display text-[min(1.1vw,13px)] leading-none tracking-tight text-white/80">
          STRATUM
        </span>
        <span className="flex items-center gap-[0.3em] text-[min(0.75vw,9px)] uppercase leading-none tracking-[0.14em] text-amber">
          <span className={`h-[0.4em] w-[0.4em] rounded-full bg-amber ${started ? "live-dot" : ""}`} />
          {started ? "Rec" : "Ready"}
        </span>
      </div>

      <div className="relative mx-[4%] mt-[3%] flex-1 overflow-hidden rounded-[3px] bg-[#0e0e11]">
        <svg viewBox="0 0 200 74" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <path
            d="M14 64 C 50 64, 56 36, 84 34 S 130 40, 152 20 S 182 10, 192 7"
            fill="none"
            stroke="#FFB020"
            strokeWidth="3"
            strokeLinecap="round"
            pathLength={1}
            style={{ strokeDasharray: 1, strokeDashoffset: 1 - p }}
          />
          {started && <circle cx={14 + p * 178} cy={64 - p * 57} r="3.4" fill="#FFB020" />}
        </svg>

        {!started && (
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div
              animate={{ scale: [1, 1.09, 1] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
              className="flex h-[46%] w-auto aspect-square items-center justify-center rounded-full bg-amber text-amber-ink"
            >
              <Navigation size={11} />
            </motion.div>
          </div>
        )}
      </div>

      <div className="flex items-end justify-between px-[4%] pb-[3.5%] pt-[3%]">
        <div>
          <div className="text-[min(0.7vw,8px)] uppercase leading-none tracking-[0.14em] text-white/35">
            Speed
          </div>
          <div className="stat-num text-[min(1.6vw,19px)] font-medium leading-none text-white">
            {speedAt(t)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[min(0.7vw,8px)] uppercase leading-none tracking-[0.14em] text-white/35">
            Score
          </div>
          <div className="stat-num text-[min(1.6vw,19px)] font-medium leading-none text-amber">
            {started ? 60 + Math.round(p * 34) : "—"}
          </div>
        </div>
      </div>
    </div>
  )
}

export function CabinScene({ t }: { t: number }) {
  const [hasPhoto, setHasPhoto] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    const img = new Image()
    img.onload = () => !cancelled && setHasPhoto(true)
    img.onerror = () => !cancelled && setHasPhoto(false)
    img.src = CABIN_IMAGE
    return () => {
      cancelled = true
    }
  }, [])

  const opacity = window_(t, BEATS.uiIn, BEATS.uiOut, 0.8)
  if (opacity <= 0 || hasPhoto === null) return null

  const started = t >= START_PRESS
  const p = driveProgress(t)

  return (
    <motion.div style={{ opacity }} className="absolute inset-0 z-30 overflow-hidden bg-ink">
      {/* The cabin itself. object-cover keeps the driver's eyeline centred as
          the viewport changes shape. */}
      {hasPhoto && (
        <img
          src={CABIN_IMAGE}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          style={{
            // A slow push-in gives the still some life without a second asset.
            transform: `scale(${1.04 + ramp(t, BEATS.uiIn, BEATS.uiOut) * 0.06})`,
            transformOrigin: "58% 45%",
          }}
        />
      )}

      {/* Graded down so the bright daylight photo sits in the film's night
          palette, and so the lit screen is the brightest thing on frame. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(8,8,10,0.72), rgba(8,8,10,0.5) 40%, rgba(8,8,10,0.78))",
        }}
      />

      {/* Speed streaks through the windscreen once the car is moving. */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[34%]"
        style={{
          opacity: p * 0.55,
          backgroundImage:
            "repeating-linear-gradient(96deg, transparent 0 38px, rgba(255,255,255,0.16) 38px 42px)",
          maskImage: "radial-gradient(60% 100% at 50% 100%, black, transparent 72%)",
          WebkitMaskImage: "radial-gradient(60% 100% at 50% 100%, black, transparent 72%)",
        }}
      />

      {/* --- The app, on the car's screen -------------------------------- */}
      <div className="absolute inset-0" style={{ perspective: "900px" }}>
        <div
          className="absolute overflow-hidden rounded-[3px]"
          style={{
            left: `${SCREEN.left}%`,
            top: `${SCREEN.top}%`,
            width: `${SCREEN.width}%`,
            height: `${SCREEN.height}%`,
            transform: `rotateY(${SCREEN.rotateY}deg) rotateX(${SCREEN.rotateX}deg)`,
            transformStyle: "preserve-3d",
            boxShadow: "0 0 22px rgba(255,176,32,0.22)",
          }}
        >
          <ScreenContent t={t} started={started} />
        </div>
      </div>

      {/* Without the photo the beat still plays, just plainly. */}
      {!hasPhoto && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-[min(340px,80vw)] overflow-hidden rounded-xl border border-hairline-strong bg-ink-1 shadow-float">
            <div className="h-[190px]">
              <ScreenContent t={t} started={started} />
            </div>
          </div>
        </div>
      )}

      {/* --- Caption ------------------------------------------------------ */}
      <div className="absolute inset-x-0 top-[8%] z-10 px-6 text-center">
        <p className="text-[10px] font-medium uppercase tracking-[0.4em] text-amber">In the car</p>
        <h2 className="display mt-2.5 text-2xl leading-tight text-white md:text-4xl">
          {started ? "And it's recording." : "Tap start. That's it."}
        </h2>
        <p className="mx-auto mt-3 max-w-sm text-[11px] uppercase tracking-[0.22em] text-white/40">
          CarPlay · Android Auto · Phone
        </p>
      </div>
    </motion.div>
  )
}
