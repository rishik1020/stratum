import { useEffect, useMemo, useState } from "react"
import { motion, MotionValue, useReducedMotion, useTransform } from "framer-motion"
import { Navigation, Square, Wifi } from "lucide-react"

import { SectionHead } from "./editorial"

/**
 * The phone beat: what a drive actually looks like while it is happening.
 *
 * The car sells the idea; this shows the product. It is a rebuilt Stratum
 * tracking screen rather than a screenshot, so the whole thing is driven by
 * scroll — the route draws, the speed climbs, the clock runs, and the score
 * resolves at the end. A static image of a map cannot show that the map is the
 * point.
 *
 * The UI is a faithful reduction of the real live screen: recording header,
 * full-bleed map with your trail drawing behind you, speed as the largest
 * thing on the display, and the drive score arriving when the drive ends.
 */

/**
 * The demo drive: Hitec City to Charminar, across Hyderabad.
 *
 * Real WGS84 waypoints, the same ones `backend/seed_demo.py` uses for the
 * seeded race, projected into the phone screen below. An invented squiggle
 * would have been easier and would have meant nothing — this is a route the
 * product has actually recorded, and it is 15.6 km of real city.
 */
const ORIGIN = "Hitec City"
const DESTINATION = "Charminar"
const ROUTE_WGS84: [number, number][] = [
  [17.4483, 78.3915], // Hitec City
  [17.4325, 78.4071], // Jubilee Hills
  [17.4156, 78.4347], // Banjara Hills
  [17.4062, 78.4691], // Khairatabad
  [17.385, 78.4867], // Nampally
  [17.3616, 78.4747], // Charminar
]
/** Measured along the polyline above. */
const ROUTE_KM = 15.6

const SCREEN_W = 220
const SCREEN_H = 400

/**
 * Project the route into the screen box.
 *
 * Equirectangular, with one scale for both axes so the shape stays
 * geographically honest — stretching it to fill a portrait frame would draw a
 * road layout that does not exist. Longitude is compressed by cos(lat), which
 * at 17.4°N is a ~5% difference and visible over 10 km.
 *
 * Fitted into the band the UI leaves clear: the header sits over the top of the
 * screen and the speed panel over the bottom.
 */
const PAD_X = 26
const BAND_TOP = 96
const BAND_BOTTOM = 300

function projectRoute(): { x: number; y: number }[] {
  const lats = ROUTE_WGS84.map((w) => w[0])
  const lngs = ROUTE_WGS84.map((w) => w[1])
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2
  const kx = Math.cos((midLat * Math.PI) / 180)

  const xs = lngs.map((l) => l * kx)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...lats)
  const maxY = Math.max(...lats)

  const scale = Math.min(
    (SCREEN_W - PAD_X * 2) / Math.max(1e-9, maxX - minX),
    (BAND_BOTTOM - BAND_TOP) / Math.max(1e-9, maxY - minY)
  )
  const w = (maxX - minX) * scale
  const h = (maxY - minY) * scale
  const offX = (SCREEN_W - w) / 2
  const offY = BAND_TOP + (BAND_BOTTOM - BAND_TOP - h) / 2

  return ROUTE_WGS84.map(([lat, lng]) => ({
    x: offX + (lng * kx - minX) * scale,
    // Latitude increases northward, y increases downward.
    y: offY + (maxY - lat) * scale,
  }))
}

/** Catmull-Rom through the waypoints, so the road curves like a road. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return ""
  let d = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
  }
  return d
}

/** The beats of the demo drive, as fractions of the section's scroll.
 *
 *  The drive ends at 0.7 rather than near the end of the section: the score is
 *  the payoff, and finishing at 0.82 left under a viewport of scroll to read it
 *  before the sticky released and carried the phone off the top. */
const START_AT = 0.18
const END_AT = 0.7

const ROUTE_PTS = projectRoute()
const ROUTE_D = smoothPath(ROUTE_PTS)
const START_PT = ROUTE_PTS[0]
const END_PT = ROUTE_PTS[ROUTE_PTS.length - 1]

const fmtClock = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`

/**
 * Position along the route at `t`.
 *
 * Measured off a detached path element rather than a rendered one, so it needs
 * no ref, no effect and no second state update — the first version set state
 * on every scroll frame, which re-rendered this whole subtree twice per frame
 * on top of everything else the page was doing.
 *
 * getPointAtLength is also exact at any t, unlike a SMIL animation, which
 * matters because scrolling up scrubs it backwards.
 */
const measurePath = (() => {
  let el: SVGPathElement | null = null
  return (t: number) => {
    if (typeof document === "undefined") return { x: 0, y: 0 }
    if (!el) {
      el = document.createElementNS("http://www.w3.org/2000/svg", "path")
      el.setAttribute("d", ROUTE_D)
    }
    try {
      const len = el.getTotalLength()
      const p = el.getPointAtLength(len * Math.min(1, Math.max(0, t)))
      return { x: p.x, y: p.y }
    } catch {
      // jsdom and very old engines have no path geometry; fall back to the start.
      return { x: START_PT.x, y: START_PT.y }
    }
  }
})()

function TrackingScreen({ p }: { p: number }) {
  // Drive progress: 0 before the tap, 1 at the end.
  const drive = Math.min(1, Math.max(0, (p - START_AT) / (END_AT - START_AT)))
  const started = p >= START_AT
  const finished = p >= END_AT

  const pt = useMemo(() => measurePath(drive), [drive])

  // Speed varies along the route rather than climbing in a straight line — a
  // constant ramp reads as a progress bar, not a car. Kept inside a plausible
  // city band: the first version was a raw sine that dipped to 8 km/h in the
  // middle of a drive, which reads as a fault rather than as traffic.
  const speed = finished
    ? 0
    : started
    ? Math.round(
        Math.min(
          78,
          Math.max(
            22,
            48 + 22 * Math.sin(drive * Math.PI * 1.7) + 7 * Math.sin(drive * 11)
          )
        )
      )
    : 0
  const distanceKm = (drive * ROUTE_KM).toFixed(1)
  const remainingKm = ((1 - drive) * ROUTE_KM).toFixed(1)
  const elapsed = drive * 17 * 60

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0A0C10]">
      {/* --- Map ---------------------------------------------------------- */}
      <svg
        viewBox={`0 0 ${SCREEN_W} ${SCREEN_H}`}
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
      >
        <defs>
          <radialGradient id="phone-ground" cx="50%" cy="46%" r="78%">
            <stop offset="0%" stopColor="#151B23" />
            <stop offset="70%" stopColor="#0D1219" />
            <stop offset="100%" stopColor="#0A0C10" />
          </radialGradient>
        </defs>
        <rect width={SCREEN_W} height={SCREEN_H} fill="url(#phone-ground)" />

        {/* City blocks */}
        <g stroke="rgba(255,255,255,0.05)" strokeWidth="7" fill="none">
          {[30, 78, 126, 174, 222, 270, 318, 366].map((y) => (
            <line key={`h${y}`} x1="-20" y1={y} x2="240" y2={y - 8} />
          ))}
          {[18, 66, 114, 162, 210].map((x) => (
            <line key={`v${x}`} x1={x} y1="-20" x2={x + 10} y2="420" />
          ))}
        </g>
        <g stroke="rgba(255,255,255,0.10)" strokeWidth="2.6" fill="none" strokeLinecap="round">
          <path d="M-20 300 C 60 286, 120 250, 240 226" />
          <path d="M92 -20 C 104 90, 148 190, 132 420" />
        </g>
        <path d="M-20 120 C 26 112, 52 92, 96 86 C 130 82, 150 66, 162 -20 L -20 -20 Z" fill="rgba(46,86,120,0.16)" />

        {/* The road ahead, then the part already driven. */}
        <path d={ROUTE_D} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="3.4" strokeLinecap="round" />
        <path
          d={ROUTE_D}
          fill="none"
          stroke="#FFB020"
          strokeWidth="3.4"
          strokeLinecap="round"
          pathLength={1}
          style={{
            strokeDasharray: 1,
            strokeDashoffset: 1 - drive,
            filter: "drop-shadow(0 0 5px rgba(255,176,32,0.6))",
          }}
        />

        {/* Where the drive starts, and where it is going. */}
        <circle cx={START_PT.x} cy={START_PT.y} r="3" fill="rgba(255,255,255,0.55)" />
        <g>
          <circle cx={END_PT.x} cy={END_PT.y} r="5.5" fill="none" stroke="#FFB020" strokeWidth="1.6" />
          <circle cx={END_PT.x} cy={END_PT.y} r="2" fill="#FFB020" />
        </g>

        {/* You. */}
        {started && (
          <g>
            <circle cx={pt.x} cy={pt.y} r="9" fill="rgba(255,176,32,0.16)" />
            <circle cx={pt.x} cy={pt.y} r="4" fill="#FFC65C" stroke="#08080A" strokeWidth="1.4" />
          </g>
        )}
      </svg>

      {/* Readability wash behind the top and bottom furniture. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(8,8,10,0.86) 0%, rgba(8,8,10,0.1) 26%, rgba(8,8,10,0.15) 52%, rgba(8,8,10,0.92) 88%)",
        }}
      />

      {/* --- Status bar --------------------------------------------------- */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-[7%] pt-[3.5%] text-[3.1cqw] text-white/70">
        <span className="stat-num">9:41</span>
        <span className="flex items-center gap-[0.4em]">
          <Wifi size={9} />
          <span className="block h-[0.75em] w-[1.5em] rounded-[2px] border border-white/50">
            <span className="block h-full w-3/4 bg-white/70" />
          </span>
        </span>
      </div>

      {/* --- Recording header --------------------------------------------- */}
      <div className="absolute inset-x-0 top-[8%] px-[7%]">
        <div className="flex items-center justify-between">
          <span className="text-[2.9cqw] font-semibold uppercase tracking-[0.18em] text-white/50">
            {finished ? "Drive complete" : started ? "Recording" : "Ready"}
          </span>
          <span className="stat-num text-[3.1cqw] text-white/60">{fmtClock(elapsed)}</span>
        </div>
        <div className="mt-[2%] flex items-center gap-[0.5em]">
          {started && !finished && (
            <span className="block h-[0.5em] w-[0.5em] rounded-full bg-amber shadow-amber-glow" />
          )}
          <span className="truncate text-[4.2cqw] font-medium text-white">
            {ORIGIN} <span className="text-white/40">to</span> {DESTINATION}
          </span>
        </div>
      </div>

      {/* --- Speed, the biggest thing on the screen ------------------------ */}
      <div className="absolute inset-x-0 bottom-[19%] px-[7%]">
        <div className="flex items-end gap-[0.4em]">
          <span className="stat-num text-[17cqw] font-medium leading-[0.85] text-white">{speed}</span>
          <span className="mb-[1.6em] text-[3.2cqw] uppercase tracking-[0.16em] text-white/45">km/h</span>
        </div>
        <div className="mt-[1%] flex items-center gap-[1.1em] text-[3.1cqw] text-white/55">
          <span className="stat-num">{distanceKm} km</span>
          <span className="stat-num">
            {finished ? "arrived" : `${remainingKm} km to go`}
          </span>
          <span className="stat-num text-amber">
            {started ? `${Math.round(62 + drive * 31)}` : "—"}
          </span>
        </div>
      </div>

      {/* --- The primary control ------------------------------------------ */}
      <div className="absolute inset-x-0 bottom-[7%] px-[7%]">
        <div
          className={`flex items-center justify-center gap-[0.5em] rounded-pill py-[3.6%] text-[3.2cqw] font-semibold uppercase tracking-[0.16em] transition-colors ${
            started ? "border border-white/25 text-white/85" : "bg-amber text-amber-ink"
          }`}
        >
          {started ? <Square size={9} /> : <Navigation size={9} />}
          {started ? "End drive" : "Start drive"}
        </div>
      </div>

      {/* --- The score, once the drive is over ---------------------------- */}
      <motion.div
        className="absolute inset-x-0 bottom-0 rounded-t-[6%] border-t border-hairline-strong bg-ink/95 px-[7%] pb-[6%] pt-[5%] backdrop-blur-md"
        initial={false}
        animate={{ y: finished ? "0%" : "108%" }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="flex items-baseline justify-between">
          <span className="text-[2.9cqw] font-semibold uppercase tracking-[0.18em] text-white/45">
            Drive score
          </span>
          <span className="stat-num text-[7cqw] font-medium leading-none text-amber">93</span>
        </div>
        <div className="mt-[4%] space-y-[3%]">
          {[
            ["Safety", 96],
            ["Eco", 88],
            ["Comfort", 94],
          ].map(([label, value]) => (
            <div key={label as string}>
              <div className="flex justify-between text-[2.8cqw] text-white/55">
                <span>{label}</span>
                <span className="stat-num">{value}</span>
              </div>
              <div className="mt-[1.5%] h-[0.5em] overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className="h-full rounded-full bg-amber"
                  initial={false}
                  animate={{ width: finished ? `${value}%` : "0%" }}
                  transition={{ duration: 0.9, delay: finished ? 0.2 : 0, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}

/** The device. Pure CSS — a picture of a phone would not let the screen move. */
function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative aspect-[9/19.5] w-full max-w-[280px] rounded-[13%] border border-white/12 bg-[#0b0b0d] p-[2.4%] shadow-float"
      style={{ containerType: "size" }}
    >
      {/* Rim light, so the device reads as an object rather than a rectangle. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[13%]"
        style={{
          background:
            "linear-gradient(150deg, rgba(255,255,255,0.16), transparent 34%, transparent 68%, rgba(255,176,32,0.14))",
          WebkitMaskImage: "linear-gradient(#000,#000)",
        }}
      />
      <div className="relative h-full w-full overflow-hidden rounded-[11%]">
        {children}
        {/* Notch */}
        <div className="absolute left-1/2 top-0 h-[1.7%] w-[32%] -translate-x-1/2 rounded-b-full bg-black" />
      </div>
    </div>
  )
}

const STAGES = [
  { from: 0, label: "Mount it", copy: "Put the phone in the cradle and open Stratum. Nothing to pair, nothing to install in the car." },
  { from: START_AT, label: "Tap start", copy: "One tap and it is recording — position, speed, heading and g-force, several times a second." },
  { from: 0.44, label: "Drive", copy: "Hitec City to Charminar — 15.6 km across Hyderabad. Your line draws itself behind you, and recording survives the screen going off, so the phone can go back in your pocket." },
  { from: END_AT, label: "Arrive, and read it back", copy: "The drive is scored the moment it ends: safety, eco, comfort and performance, measured against the speed limits of the roads you actually took." },
]

export function PhoneScene({ progress }: { progress: MotionValue<number> }) {
  const still = useReducedMotion()
  // Quantised: scroll fires continuously, and re-rendering the phone for a
  // change of 0.0001 is invisible work. 300 steps across the section is finer
  // than the eye can follow and caps the render rate.
  const [p, setP] = useState(0)
  useEffect(
    () =>
      progress.on("change", (v) => {
        const q = Math.round(v * 300) / 300
        setP((prev) => (prev === q ? prev : q))
      }),
    [progress]
  )

  // Rises into frame and settles, then eases away as the section ends.
  const y = useTransform(progress, [0, 0.16, 0.9, 1], ["18%", "0%", "0%", "-6%"])
  const scale = useTransform(progress, [0, 0.16], [0.92, 1])
  const tilt = useTransform(progress, [0, 0.16, 0.9], [8, 0, 0])

  const stage = useMemo(() => {
    let current = STAGES[0]
    for (const s of STAGES) if (p >= s.from) current = s
    return current
  }, [p])

  return (
    <div className="sticky top-0 flex h-[100dvh] items-center overflow-hidden">
      {/* pt on narrow screens so the device clears the fixed header, which
          sits over the top of a phone-width layout. */}
      <div className="mx-auto grid w-full max-w-6xl items-center gap-8 px-5 pt-14 md:grid-cols-12 md:gap-10 md:px-10 md:pt-0">
        {/* Copy tracks the stage, so the words describe what the screen is
            doing at that exact moment rather than the section as a whole. */}
        <div className="order-2 md:order-1 md:col-span-6">
          <SectionHead label="On the phone" index="—" />
          <div className="mt-8 min-h-[9.5rem] md:min-h-[11rem]">
            <motion.div key={stage.label} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
              <h3 className="display text-[clamp(1.5rem,3.4vw,2.6rem)] leading-[1.14]">{stage.label}</h3>
              <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/55">{stage.copy}</p>
            </motion.div>
          </div>

          {/* Where you are in the demo. */}
          <div className="mt-8 flex gap-2" aria-hidden>
            {STAGES.map((s) => (
              <span
                key={s.label}
                className="h-px flex-1 overflow-hidden bg-white/12"
              >
                <span
                  className="block h-full bg-amber transition-transform duration-300"
                  style={{ transform: `scaleX(${p >= s.from ? 1 : 0})`, transformOrigin: "left" }}
                />
              </span>
            ))}
          </div>
        </div>

        <div className="order-1 flex justify-center md:order-2 md:col-span-6">
          <motion.div
            style={still ? undefined : { y, scale, rotate: tilt }}
            className="w-[50vw] max-w-[280px] sm:w-[40vw]"
          >
            <PhoneFrame>
              <TrackingScreen p={p} />
            </PhoneFrame>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
