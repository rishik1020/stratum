import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import { CarDashboard, DashboardState } from "../components/CarDashboard"

import { BEATS, easeInOut, ramp } from "./useCinematic"

/**
 * The "inside the car" beat, composited onto a real interior photograph.
 *
 * The 911 model is a body shell with no cabin, so rather than fake an interior
 * this lays the Stratum UI onto the actual infotainment screen in a driver's-POV
 * photo — the telemetry appears where it genuinely would, and the surroundings
 * are photoreal rather than CSS approximations of leather.
 *
 * **Then it lifts off the dash.** The display is 267 px wide in a 1920 px photo:
 * 14% of the frame. A landscape UI rendered into that is an amber smudge no
 * matter how it's tuned — the first version of this beat spent its whole
 * duration showing the one thing it exists to show at a size nobody can read.
 * So the shot establishes the screen in place, then floats it out to fill the
 * frame at full resolution while the cabin stays behind it. Cropping into the
 * photo instead was rejected: filling the frame from a 267 px source is a 4.8×
 * upscale, i.e. mush.
 *
 * Falls back to a plain dark cabin if the photo isn't present, so the film never
 * breaks on a missing asset.
 */

const CABIN_IMAGE = "/cabin/driver.jpg"

/** The photo's aspect ratio. The bezel is measured against this, not the
 *  viewport — see the cover box in the render. */
const PHOTO_W = 1920
const PHOTO_H = 1080

/**
 * Where the infotainment screen sits in the photo, measured off driver.jpg:
 * the lit area runs x 1010→1277, y 427→508 of 1920×1080.
 *
 * Percentages of the photo box, so they hold at any size. Nudge with the film
 * paused at `#/?t=7.0` (before the lift) if the overlay drifts off the bezel.
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

/** The lift, timed to finish before the start button is pressed at BEATS.start
 *  — so the press happens on the readable hero, not on the smudge. */
const LIFT_FROM = 7.4
const LIFT_TO = 9.1

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const lerpRect = (a: Rect, b: Rect, k: number): Rect => ({
  left: lerp(a.left, b.left, k),
  top: lerp(a.top, b.top, k),
  width: lerp(a.width, b.width, k),
  height: lerp(a.height, b.height, k),
})

/**
 * Where the dashboard ends up: centred, 16:9, big enough to read.
 *
 * Sized off height first and capped on width, then parked below the caption
 * band rather than dead-centre — a centred hero collides with the headline on
 * short viewports, which is how the caption ended up across the windscreen
 * line last time.
 */
function heroRect(vw: number, vh: number): Rect {
  let height = vh * 0.54
  let width = height * (16 / 9)
  if (width > vw * 0.86) {
    width = vw * 0.86
    height = width * (9 / 16)
  }
  // Reserve the caption band, then centre in what's left rather than pinning to
  // a fixed fraction. On a phone the 16:9 panel is width-limited and short, so a
  // fixed top left it stranded near the headline with 400 px of empty footwell
  // underneath; on a laptop it collided with the headline instead.
  const captionBand = Math.max(180, vh * 0.26)
  const top = captionBand + Math.max(0, (vh - captionBand - height) / 2)
  return { left: (vw - width) / 2, top, width, height }
}

const START_PRESS = BEATS.start

/**
 * Speed on the head unit.
 *
 * Keyed to the car pulling away, not to the button press — between tapping
 * start and actually moving, the readout has to sit at zero or the dash claims
 * triple digits while the car is visibly parked.
 *
 * It also can't stay at zero for the whole hero: this beat exists to show live
 * telemetry, so the numbers have to be moving by the time the panel is big
 * enough to read. Tops out at a city speed rather than the exterior shot's
 * headline number — this is a car pulling into traffic, not a launch.
 */
const speedAt = (t: number) =>
  Math.round(Math.pow(ramp(t, BEATS.cabinRoll, BEATS.uiOut), 0.7) * 68)

const driveProgress = (t: number) => ramp(t, BEATS.cabinRoll, BEATS.uiOut)

/**
 * A drawn route standing in for the live map.
 *
 * The real dashboard mounts Leaflet over satellite tiles; a 15-second landing
 * beat shouldn't pull either. Same shape, none of the weight.
 */
const ROUTE_D = "M40 196 C 118 190, 128 128, 196 118 S 292 118, 330 56 S 372 26, 392 16"

function FilmMap({ p }: { p: number }) {
  return (
    <div className="h-full w-full bg-[#0A0C10]">
      <svg viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
        <defs>
          <radialGradient id="ground" cx="58%" cy="40%" r="80%">
            <stop offset="0%" stopColor="#161C24" />
            <stop offset="70%" stopColor="#0E131A" />
            <stop offset="100%" stopColor="#0A0C10" />
          </radialGradient>
        </defs>
        <rect width="400" height="220" fill="url(#ground)" />

        {/* City blocks. The previous version was a dark olive wash with five
            faint arcs, which read as a green smear rather than a map — at
            hero size the panel needs to look like it's showing somewhere. */}
        <g stroke="rgba(255,255,255,0.055)" strokeWidth="9" fill="none">
          {[24, 62, 100, 138, 176, 214].map((y) => (
            <line key={`h${y}`} x1="-20" y1={y} x2="420" y2={y - 14} />
          ))}
          {[30, 96, 162, 228, 294, 360].map((x) => (
            <line key={`v${x}`} x1={x} y1="-20" x2={x + 16} y2="240" />
          ))}
        </g>
        {/* A couple of arterials, brighter than the side streets. */}
        <g stroke="rgba(255,255,255,0.11)" strokeWidth="3.5" fill="none" strokeLinecap="round">
          <path d="M-20 168 C 90 160, 150 120, 250 104 S 360 74, 420 46" />
          <path d="M120 -20 C 132 60, 176 110, 214 240" />
        </g>
        {/* Water, for a landmark the eye can hold on to. */}
        <path
          d="M-20 92 C 40 84, 70 62, 128 58 C 170 55, 196 40, 214 -20 L -20 -20 Z"
          fill="rgba(46,86,120,0.20)"
        />

        {/* The driven route: grey where it's going, amber where it's been. */}
        <path d={ROUTE_D} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="5" strokeLinecap="round" />
        <path
          d={ROUTE_D}
          fill="none"
          stroke="#FFB020"
          strokeWidth="4.5"
          strokeLinecap="round"
          pathLength={1}
          style={{
            strokeDasharray: 1,
            strokeDashoffset: 1 - p,
            filter: "drop-shadow(0 0 7px rgba(255,176,32,0.65))",
          }}
        />
        {/* The car itself, riding the head of the drawn trail. */}
        {p > 0.02 && (
          <circle r="4.5" fill="#FFC65C" stroke="#08080A" strokeWidth="1.5">
            <animateMotion dur="0.001s" fill="freeze" keyPoints={`${p};${p}`} keyTimes="0;1" path={ROUTE_D} />
          </circle>
        )}
      </svg>
    </div>
  )
}

export function CabinScene({ t }: { t: number }) {
  const [hasPhoto, setHasPhoto] = useState<boolean | null>(null)
  const photoRef = useRef<HTMLDivElement>(null)
  // The bezel's position in *viewport* pixels. The photo box deliberately
  // overflows the viewport to cover it, so a percentage of the photo is not a
  // percentage of the screen — the two only agreed at exactly 16:9. Measuring
  // gets both rects into one coordinate space so they can be interpolated.
  const [photoBox, setPhotoBox] = useState<Rect | null>(null)
  const [viewport, setViewport] = useState({ w: 0, h: 0 })

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

  useEffect(() => {
    const measure = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight })
      const el = photoRef.current
      if (el) {
        const r = el.getBoundingClientRect()
        setPhotoBox({ left: r.left, top: r.top, width: r.width, height: r.height })
      }
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (photoRef.current) ro.observe(photoRef.current)
    window.addEventListener("resize", measure)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", measure)
    }
  }, [hasPhoto])

  // Eases in, but leaves quickly. A long dissolve cross-fades a driver's-POV
  // interior against a three-quarter exterior of the same car, and for most of
  // it a small 911 hangs in the passenger footwell. Two shots this incompatible
  // want a cut, so the exit is short enough to read as one.
  const opacity = Math.min(
    ramp(t, BEATS.uiIn, BEATS.uiIn + 0.8),
    1 - ramp(t, BEATS.uiOut - 0.3, BEATS.uiOut)
  )
  if (opacity <= 0 || hasPhoto === null) return null

  const started = t >= START_PRESS
  const p = driveProgress(t)
  const lift = easeInOut(ramp(t, LIFT_FROM, LIFT_TO))

  const dash: DashboardState = {
    speedKmh: speedAt(t),
    distanceM: Math.round(p * 12_500),
    score: started ? 60 + Math.round(p * 34) : null,
    gapM: started ? Math.round(180 * (1 - p)) : null,
    elapsedS: Math.max(0, Math.round(t - START_PRESS)),
    connected: true,
    recording: started,
  }

  const dashboard = (
    <CarDashboard
      state={dash}
      sessionName="Hyderabad run"
      map={<FilmMap p={p} />}
      primaryLabel={started ? "End drive" : "Start drive"}
      interactive={false}
    />
  )

  // The bezel, in viewport pixels, and where it's heading.
  const bezel: Rect | null =
    photoBox && photoBox.width > 0
      ? {
          left: photoBox.left + (photoBox.width * SCREEN.left) / 100,
          top: photoBox.top + (photoBox.height * SCREEN.top) / 100,
          width: (photoBox.width * SCREEN.width) / 100,
          height: (photoBox.height * SCREEN.height) / 100,
        }
      : null
  const hero = viewport.w > 0 ? heroRect(viewport.w, viewport.h) : null
  const rect = bezel && hero ? lerpRect(bezel, hero, lift) : null

  return (
    <motion.div style={{ opacity }} className="absolute inset-0 z-30 overflow-hidden bg-ink">
      {/* The cabin, in a box that keeps the photo's aspect ratio and covers the
          viewport (min-w/h-full + a fixed ratio is cover behaviour). */}
      {hasPhoto && (
        <div className="absolute inset-0 overflow-hidden">
          <div
            ref={photoRef}
            className="absolute left-1/2 top-1/2 aspect-[16/9] min-h-full min-w-full -translate-x-1/2 -translate-y-1/2"
            style={{
              // A slow push-in gives the still some life without a second asset.
              transform: `translate(-50%, -50%) scale(${1.03 + ramp(t, BEATS.uiIn, BEATS.uiOut) * 0.05})`,
              transformOrigin: "58% 45%",
            }}
          >
            <img src={CABIN_IMAGE} alt="" className="h-full w-full" />
          </div>
        </div>
      )}

      {/* Grading. Light while the interior is establishing — the point of those
          seconds is that you recognise a real car — then deepening as the UI
          lifts, so the screen becomes the brightest thing on frame. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(8,8,10,0.65), rgba(8,8,10,0.42) 40%, rgba(8,8,10,0.72))",
          opacity: 0.5 + lift * 0.5,
        }}
      />

      {/* Speed streaks through the windscreen once the car is moving. */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[34%]"
        style={{
          opacity: p * 0.4 * (1 - lift * 0.5),
          backgroundImage:
            "repeating-linear-gradient(96deg, transparent 0 38px, rgba(255,255,255,0.16) 38px 42px)",
          maskImage: "radial-gradient(60% 100% at 50% 100%, black, transparent 72%)",
          WebkitMaskImage: "radial-gradient(60% 100% at 50% 100%, black, transparent 72%)",
        }}
      />

      {/* --- The dashboard ------------------------------------------------ */}
      {/* Positioned in viewport pixels rather than nested in the photo, because
          it has to travel from the bezel to the middle of the screen. Rendered
          above the grading so the lifted panel reads as lit, not tinted. */}
      {hasPhoto && rect && (
        <div
          className="pointer-events-none absolute z-20"
          style={{
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            perspective: "1100px",
            // Leaves ahead of the cabin itself. Both layers used to dissolve
            // together, and since the exterior car is bright and sits directly
            // behind this panel, the 911 appeared to be driving around inside
            // the map for most of the crossfade.
            opacity: 1 - easeInOut(ramp(t, BEATS.launch, BEATS.launch + 0.55)),
          }}
        >
          <div
            className="h-full w-full overflow-hidden"
            style={{
              // Flattens out of the dash's cant as it comes off the console.
              transform: `rotateY(${SCREEN.rotateY * (1 - lift)}deg) rotateX(${SCREEN.rotateX * (1 - lift)}deg)`,
              transformStyle: "preserve-3d",
              borderRadius: lerp(3, 16, lift),
              border: lift > 0.5 ? "1px solid rgba(255,255,255,0.10)" : "none",
              boxShadow: `0 ${lerp(0, 40, lift)}px ${lerp(26, 110, lift)}px rgba(0,0,0,${lerp(0.3, 0.75, lift)}), 0 0 ${lerp(26, 60, lift)}px rgba(255,176,32,${lerp(0.28, 0.16, lift)})`,
            }}
          >
            {dashboard}
          </div>
        </div>
      )}

      {/* Without the photo the beat still plays, just plainly. */}
      {!hasPhoto && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="aspect-[16/9] w-[min(880px,86vw)] overflow-hidden rounded-2xl border border-hairline-strong shadow-float">
            {dashboard}
          </div>
        </div>
      )}

      {/* --- Caption ------------------------------------------------------ */}
      {/* Kept in the band above the hero rect. It used to sit across the
          windscreen line at any viewport, because nothing related the two. */}
      <div className="absolute inset-x-0 top-[8%] z-30 px-6 text-center">
        <p className="text-[10px] font-medium uppercase tracking-[0.4em] text-amber">In the car</p>
        <h2 className="display mt-2.5 text-2xl leading-tight text-white md:text-4xl">
          {started ? "And it's recording." : "Tap start. That's it."}
        </h2>
        <p className="mx-auto mt-3 max-w-sm text-[11px] uppercase tracking-[0.22em] text-white/45">
          {/* Not CarPlay/Android Auto — neither platform allows this app
              category, and the product is called Car mode everywhere else. */}
          Car mode · Phone in a mount
        </p>
      </div>
    </motion.div>
  )
}
