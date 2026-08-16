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

/** The photo's aspect ratio. The overlay is positioned against this, not the
 *  viewport — see the cover box in the render. */
const PHOTO_W = 1920
const PHOTO_H = 1080

/**
 * Where the infotainment screen sits in the photo, measured off driver.jpg:
 * the lit area runs x 1010→1277, y 427→508 of 1920×1080.
 *
 * Percentages of the photo box, so they hold at any size. Nudge with the film
 * paused at `#/?t=10.5` if the overlay drifts off the bezel.
 */
const SCREEN = {
  left: (1010 / PHOTO_W) * 100,
  top: (427 / PHOTO_H) * 100,
  width: ((1277 - 1010) / PHOTO_W) * 100,
  height: ((508 - 427) / PHOTO_H) * 100,
  /** The dash cants the display toward the driver. */
  rotateY: -9,
  rotateX: 1,
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
      {/* The cabin, and the screen overlay, inside one box that keeps the
          photo's aspect ratio and covers the viewport (min-w/h-full + a fixed
          ratio is cover behaviour). Both are positioned against this box, so
          the overlay stays on the bezel at any window shape — with the image
          on object-cover and the overlay on the container, they only lined up
          at exactly 16:9. */}
      {hasPhoto && (
        <div className="absolute inset-0 overflow-hidden">
          <div
            className="absolute left-1/2 top-1/2 aspect-[16/9] min-h-full min-w-full -translate-x-1/2 -translate-y-1/2"
            style={{
              // A slow push-in gives the still some life without a second asset.
              transform: `translate(-50%, -50%) scale(${1.03 + ramp(t, BEATS.uiIn, BEATS.uiOut) * 0.05})`,
              transformOrigin: "58% 45%",
            }}
          >
            <img src={CABIN_IMAGE} alt="" className="h-full w-full" />

            <div className="absolute inset-0" style={{ perspective: "900px" }}>
              <div
                className="absolute overflow-hidden"
                style={{
                  left: `${SCREEN.left}%`,
                  top: `${SCREEN.top}%`,
                  width: `${SCREEN.width}%`,
                  height: `${SCREEN.height}%`,
                  transform: `rotateY(${SCREEN.rotateY}deg) rotateX(${SCREEN.rotateX}deg)`,
                  transformStyle: "preserve-3d",
                  boxShadow: "0 0 26px rgba(255,176,32,0.28)",
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
          </div>
        </div>
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
