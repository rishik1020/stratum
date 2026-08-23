import { useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion"

import { routes } from "../routes"
import { Logo } from "../components/Logo"
import { CarStage } from "./CarStage"
import { ORBIT_SHOTS } from "./shots"
import { PhoneScene } from "./PhoneScene"
import { useSmoothScroll } from "./useSmoothScroll"
import { Marquee, MaskLine, PillLink, Reveal, SectionHead, Statement } from "./editorial"

/**
 * The landing page.
 *
 * Scroll-driven rather than timed. The previous version played a fixed
 * 15-second film that started the moment you arrived and could not be paused,
 * slowed or re-read — it told you about the product at its own pace and there
 * was nothing to do but wait it out. Here the reader sets the pace, and the one
 * thing worth looking at, the car, is theirs to turn.
 *
 * The page is one scroll timeline:
 *
 *   0–100vh    hero, the wordmark over the car
 *   100–300vh  the orbit — scroll walks the camera around the car
 *   below      editorial sections, each revealing as it arrives
 *
 * The canvas is sticky for the whole orbit, so it holds still on screen while
 * the page moves past it. That is what makes the camera feel driven rather than
 * the page merely scrolling over a picture.
 */

const FEATURES = [
  {
    index: "01",
    label: "Telemetry",
    title: "Every metre, on the record",
    body: "Speed, route, altitude and g-force, straight off the phone in your mount. Recording survives the screen going off, so the drive keeps writing while the phone sits in your pocket.",
  },
  {
    index: "02",
    label: "Driving score",
    title: "Judged against the actual road",
    body: "Safety, Eco, Comfort and Performance, scored from what you actually did — braking, cornering, throttle, and speed measured against real map limits rather than a flat number nobody ever reaches.",
  },
  {
    index: "03",
    label: "Sprints",
    title: "Same road, four cars",
    body: "Share a room code and every line draws itself on one map, live. Afterwards the whole thing replays, scrubbable, with the gaps that decided it.",
  },
]

export function ScrollLanding() {
  const navigate = useNavigate()
  const still = useReducedMotion()
  useSmoothScroll(!still)

  // The orbit's own scroll range, measured against this section rather than the
  // document — so adding copy further down never re-times the camera.
  const orbitRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: orbitRef,
    offset: ["start start", "end end"],
  })

  // CarStage reads this every frame. Writing a ref keeps the 3D camera off
  // React's render path entirely.
  const orbit = useRef(0)
  useEffect(() => scrollYProgress.on("change", (v) => (orbit.current = v)), [scrollYProgress])

  // The phone beat gets its own range, measured the same way.
  const phoneRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress: phoneProgress } = useScroll({
    target: phoneRef,
    offset: ["start start", "end end"],
  })

  // The wordmark holds through the opening, then clears so the car is alone.
  const titleOpacity = useTransform(scrollYProgress, [0, 0.14, 0.26], [1, 1, 0])
  const titleY = useTransform(scrollYProgress, [0, 0.26], [0, -70])
  // A gentle dim at the very end, handing off to the page below. It used to
  // start at 0.86 and drop to 0.12, which blacked out the rear three-quarter —
  // the best shot in the orbit — at exactly the moment the camera reached it.
  // The sticky release already carries the canvas off screen; this only takes
  // the edge off so it does not butt brightly against the copy underneath.
  const stageFade = useTransform(scrollYProgress, [0.95, 1], [1, 0.55])

  const signIn = () => navigate(routes.signin)

  return (
    <div className="relative bg-ink text-white">
      {/* --- Fixed chrome -------------------------------------------------
          The bar itself has no fill — a solid strip would sit like a lid on a
          full-bleed page. A short gradient behind it keeps the logo and the
          sign-in legible as copy scrolls underneath, without drawing an edge. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-40 h-28"
        style={{ background: "linear-gradient(to bottom, rgba(8,8,10,0.85), transparent)" }}
      />
      <header className="fixed inset-x-0 top-0 z-50 flex items-center justify-between px-5 py-5 md:px-10">
        <Logo size={26} />
        <span className="hidden text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45 md:block">
          Drive analytics
        </span>
        <button
          onClick={signIn}
          className="pressable rounded-pill border border-hairline-strong px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/85 transition-colors hover:border-amber hover:text-amber"
        >
          Sign in
        </button>
      </header>

      {/* --- Hero + orbit --------------------------------------------------
          Three viewports tall: one to read the wordmark, two to turn the car.
          The canvas inside is sticky, so it holds while this scrolls past. */}
      <section ref={orbitRef} className="relative h-[300vh]">
        <div className="sticky top-0 h-[100dvh] overflow-hidden">
          <motion.div style={still ? undefined : { opacity: stageFade }} className="absolute inset-0">
            <CarStage time={orbit} shots={ORBIT_SHOTS} />
          </motion.div>

          {/* Vignette — grounds the car and keeps the copy legible over it. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(120% 80% at 50% 42%, transparent 38%, rgba(8,8,10,0.5) 76%, rgba(8,8,10,0.94) 100%)",
            }}
          />

          <motion.div
            style={still ? undefined : { opacity: titleOpacity, y: titleY }}
            className="pointer-events-none absolute inset-x-0 top-[14%] px-6 text-center"
          >
            <MaskLine className="display text-[clamp(3rem,13vw,10.5rem)] font-medium leading-[0.88] tracking-[-0.02em]">
              STRATUM
            </MaskLine>
            <Reveal delay={0.5} y={16}>
              <p className="mx-auto mt-6 max-w-sm text-[11px] font-semibold uppercase tracking-[0.28em] text-white/45">
                Know how you drive
              </p>
            </Reveal>
          </motion.div>

          {/* The page does nothing until you scroll, so it has to say so. */}
          <motion.div
            style={still ? undefined : { opacity: titleOpacity }}
            className="pointer-events-none absolute inset-x-0 bottom-8 flex flex-col items-center gap-3"
          >
            <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/35">
              Scroll
            </span>
            <span className="relative block h-10 w-px overflow-hidden bg-white/12">
              <motion.span
                className="absolute inset-x-0 top-0 block h-4 bg-amber"
                animate={still ? undefined : { y: [-16, 40] }}
                transition={{ duration: 1.9, repeat: Infinity, ease: "easeInOut" }}
              />
            </span>
          </motion.div>
        </div>
      </section>

      {/* --- Statement ----------------------------------------------------- */}
      <div className="mx-auto w-full max-w-6xl px-5 md:px-10">
        <Statement label="What it is" action={<PillLink onClick={signIn}>Start driving</PillLink>}>
          <MaskLine>Stratum turns a drive into</MaskLine>
          <MaskLine delay={0.06}>
            something you can <span className="text-amber">read</span>.
          </MaskLine>
          <MaskLine delay={0.12}>
            <span className="text-white/45">Not a leaderboard. A record.</span>
          </MaskLine>
        </Statement>
      </div>

      <Marquee
        text="TRACK · SCORE · RACE"
        className="display text-[clamp(2rem,7vw,5rem)] text-white/[0.07]"
      />

      {/* --- The phone -----------------------------------------------------
          Four viewports: the device rises in, a drive runs on it, and the score
          lands. The car sells the idea; this is the thing you actually use. */}
      <section ref={phoneRef} className="relative h-[400vh]">
        <PhoneScene progress={phoneProgress} />
      </section>

      {/* --- Features ------------------------------------------------------ */}
      <div className="mx-auto w-full max-w-6xl px-5 md:px-10">
        {FEATURES.map((f, i) => (
          <section key={f.index} className="py-14 md:py-24">
            <SectionHead label={f.label} index={f.index} />
            <div className="mt-10 grid gap-6 md:grid-cols-12 md:gap-10">
              <div className="md:col-span-7">
                <h3 className="display text-[clamp(1.5rem,3.4vw,2.6rem)] leading-[1.14]">
                  <MaskLine>{f.title}</MaskLine>
                </h3>
              </div>
              <Reveal delay={0.1} className="md:col-span-5">
                <p className="text-[15px] leading-relaxed text-white/55">{f.body}</p>
              </Reveal>
            </div>
            {i === FEATURES.length - 1 && (
              <Reveal delay={0.15}>
                <div className="mt-12 border-t border-hairline pt-10 text-center">
                  <p className="display text-[clamp(1.4rem,3vw,2.2rem)] leading-tight">
                    Your car already knows.
                  </p>
                  <PillLink onClick={signIn}>Create an account</PillLink>
                </div>
              </Reveal>
            )}
          </section>
        ))}
      </div>

      <footer className="border-t border-hairline px-5 py-10 md:px-10">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 text-[11px] uppercase tracking-[0.2em] text-white/30 md:flex-row">
          <span>Stratum</span>
          <span>Drive analytics</span>
        </div>
      </footer>
    </div>
  )
}
