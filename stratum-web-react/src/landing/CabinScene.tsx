import { useEffect, useState } from "react"
import { motion } from "framer-motion"
import { CarDashboard, DashboardState } from "../components/CarDashboard"

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

/**
 * A drawn route standing in for the live map.
 *
 * The real dashboard mounts Leaflet over satellite tiles; a 15-second landing
 * beat shouldn't pull either. Same shape, none of the weight.
 */
function FilmMap({ p }: { p: number }) {
  return (
    <div className="h-full w-full bg-[#0b0d0a]">
      <svg viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
        <defs>
          <radialGradient id="terrain" cx="62%" cy="38%" r="72%">
            <stop offset="0%" stopColor="#26301f" />
            <stop offset="60%" stopColor="#151a12" />
            <stop offset="100%" stopColor="#0b0d0a" />
          </radialGradient>
        </defs>
        <rect width="400" height="220" fill="url(#terrain)" />
        {[0, 1, 2, 3, 4].map((i) => (
          <path
            key={i}
            d={`M${-40 + i * 46} 220 C ${30 + i * 46} 150, ${10 + i * 46} 90, ${80 + i * 52} 0`}
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="18"
          />
        ))}
        <path
          d="M40 196 C 118 190, 128 128, 196 118 S 292 118, 330 56 S 372 26, 392 16"
          fill="none"
          stroke="rgba(255,255,255,0.16)"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M40 196 C 118 190, 128 128, 196 118 S 292 118, 330 56 S 372 26, 392 16"
          fill="none"
          stroke="#FFB020"
          strokeWidth="4"
          strokeLinecap="round"
          pathLength={1}
          style={{ strokeDasharray: 1, strokeDashoffset: 1 - p, filter: "drop-shadow(0 0 6px rgba(255,176,32,0.6))" }}
        />
      </svg>
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

  const dash: DashboardState = {
    speedKmh: speedAt(t),
    distanceM: Math.round(p * 12_500),
    score: started ? 60 + Math.round(p * 34) : null,
    gapM: started ? Math.round(180 * (1 - p)) : null,
    elapsedS: Math.max(0, Math.round(t - START_PRESS)),
    connected: true,
    recording: started,
  }

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
      {hasPhoto && (
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
          <CarDashboard
            state={dash}
            sessionName="Hyderabad run"
            map={<FilmMap p={p} />}
            primaryLabel={started ? "End drive" : "Start drive"}
            interactive={false}
          />
        </div>
      </div>
      )}

      {/* Without the photo the beat still plays, just plainly. */}
      {!hasPhoto && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="aspect-[16/10] w-[min(620px,86vw)] overflow-hidden rounded-2xl border border-hairline-strong shadow-float">
            <CarDashboard
              state={dash}
              sessionName="Hyderabad run"
              map={<FilmMap p={p} />}
              primaryLabel={started ? "End drive" : "Start drive"}
              interactive={false}
            />
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
