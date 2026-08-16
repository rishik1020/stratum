import { Suspense, lazy, useEffect, useRef, useState } from "react"
import { motion, MotionConfig, useScroll, useTransform } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { Smartphone, Radio, Gauge, ArrowDown, Menu, X } from "lucide-react"

import { routes } from "../routes"

// three.js is heavy even inside the already-lazy landing chunk, so the canvas
// is split again and only fetched once this page actually mounts.
const CarStage = lazy(() => import("./CarStage").then((m) => ({ default: m.CarStage })))

/** Scroll height given to the car sequence, in viewports. */
const STAGE_VH = 4

const TRACK_MODES = [
  { icon: Smartphone, title: "Your phone", body: "Mount it and go. GPS and motion sensors do the rest." },
  { icon: Radio, title: "Android Auto", body: "Cast the live map and gap tower to the head unit." },
  { icon: Gauge, title: "CarPlay", body: "Speed, score and position, on the dash where you're already looking." },
]

const STEPS = [
  { n: "01", title: "Add your car", body: "Pick it from the catalogue — specs autofill, and stay editable if yours is modified." },
  { n: "02", title: "Drive or race", body: "Start a solo drive, or open a sprint and share the room code with your crew." },
  { n: "03", title: "Read the data", body: "Score, coach notes and a scrubbable replay of the whole drive, waiting when you stop." },
]

/** One beat of copy pinned over the car while the camera moves. */
function Beat({
  progress,
  from,
  to,
  children,
}: {
  progress: ReturnType<typeof useScroll>["scrollYProgress"]
  from: number
  to: number
  children: React.ReactNode
}) {
  const span = to - from
  const opacity = useTransform(
    progress,
    [from, from + span * 0.22, to - span * 0.22, to],
    [0, 1, 1, 0]
  )
  const y = useTransform(progress, [from, to], [24, -24])
  return (
    <motion.div
      style={{ opacity, y }}
      className="pointer-events-none absolute inset-x-0 top-1/2 z-20 -translate-y-1/2 px-6"
    >
      <div className="pointer-events-auto mx-auto max-w-3xl text-center">{children}</div>
    </motion.div>
  )
}

export function LandingPage() {
  const navigate = useNavigate()
  const enter = () => navigate(routes.signin)
  const [menuOpen, setMenuOpen] = useState(false)

  const stageRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: stageRef, offset: ["start start", "end end"] })

  // The canvas reads scroll from a ref rather than React state — it repaints
  // every frame anyway, and re-rendering the tree on each scroll event would
  // fight the render loop.
  const progressRef = useRef(0)
  useEffect(() => scrollYProgress.on("change", (v) => (progressRef.current = v)), [scrollYProgress])

  // Fade the canvas out once the car sequence is done and the written sections
  // take over.
  const stageOpacity = useTransform(scrollYProgress, [0, 0.88, 1], [1, 1, 0])

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative bg-ink text-white">
        {/* --- Top bar (fixed over everything) --------------------------- */}
        <header className="fixed inset-x-0 top-0 z-50 flex items-center justify-between px-6 pt-safe md:px-10">
          <span className="display py-5 text-sm tracking-tight text-white/90">STRATUM</span>
          <div className="flex items-center gap-2">
            <button
              onClick={enter}
              className="hidden rounded-pill border border-white/20 px-5 py-2 text-[11px] font-medium uppercase tracking-[0.2em] text-white/80 transition-colors hover:border-amber hover:text-amber sm:block"
            >
              Sign in
            </button>
            <button
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
              className="-mr-2 p-2 text-white/70 transition-colors hover:text-white sm:hidden"
            >
              <Menu size={20} />
            </button>
          </div>
        </header>

        {/* --- The car sequence -------------------------------------------
            A tall scroll track with a sticky viewport inside it: the canvas
            stays put while the page scrolls, which is what turns scroll
            distance into camera movement. */}
        <div ref={stageRef} style={{ height: `${STAGE_VH * 100}vh` }} className="relative">
          <div className="sticky top-0 h-[100dvh] overflow-hidden">
            <motion.div style={{ opacity: stageOpacity }} className="absolute inset-0">
              <Suspense fallback={null}>
                <CarStage progress={progressRef} />
              </Suspense>
            </motion.div>

            {/* Vignette, so type always has something to sit on. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-10"
              style={{
                background:
                  "radial-gradient(80% 60% at 50% 45%, transparent 30%, rgba(8,8,10,0.72) 100%)",
              }}
            />

            {/* Beat 1 — exterior */}
            <Beat progress={scrollYProgress} from={0} to={0.3}>
              <p className="text-[10px] font-medium uppercase tracking-[0.4em] text-white/45">
                Strava for cars
              </p>
              <h1 className="display mt-5 text-[11vw] leading-[0.92] text-white sm:text-6xl md:text-7xl">
                RACE ANYONE.
                <br />
                SCORE EVERY DRIVE.
              </h1>
              <button
                onClick={enter}
                className="mt-8 rounded-pill border border-white/25 px-8 py-3 text-[11px] font-medium uppercase tracking-[0.25em] text-white/85 transition-colors hover:border-amber hover:text-amber"
              >
                Get started
              </button>
            </Beat>

            {/* Beat 2 — the car you already own */}
            <Beat progress={scrollYProgress} from={0.32} to={0.62}>
              <p className="text-[10px] font-medium uppercase tracking-[0.4em] text-amber">No hardware</p>
              <h2 className="display mt-4 text-4xl leading-tight md:text-5xl">
                Nothing to fit.
                <br />
                Nothing to wire.
              </h2>
              <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-white/55">
                No box under the dash, no OBD dongle. The car you already own, and the phone already in your pocket.
              </p>
            </Beat>

            {/* Beat 3 — inside, tracking modes */}
            <Beat progress={scrollYProgress} from={0.64} to={1}>
              <p className="text-[10px] font-medium uppercase tracking-[0.4em] text-amber">In the car</p>
              <h2 className="display mt-4 text-4xl leading-tight md:text-5xl">Track it your way.</h2>
              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {TRACK_MODES.map((m) => (
                  <div
                    key={m.title}
                    className="rounded-card border border-hairline bg-ink-1/85 p-5 text-left backdrop-blur-sm"
                  >
                    <m.icon size={20} className="text-amber" />
                    <h3 className="display mt-3 text-base">{m.title}</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-white/50">{m.body}</p>
                  </div>
                ))}
              </div>
            </Beat>

            {/* Scroll hint, first screen only */}
            <motion.div
              style={{ opacity: useTransform(scrollYProgress, [0, 0.06], [1, 0]) }}
              className="pointer-events-none absolute bottom-8 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-1 text-white/35"
            >
              <span className="text-[10px] uppercase tracking-[0.2em]">Scroll</span>
              <ArrowDown size={16} />
            </motion.div>

            {/* Corner meta */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-center justify-between px-6 pb-5 text-[10px] uppercase tracking-[0.25em] text-white/25 md:px-10">
              <span>Telemetry</span>
              <span>{new Date().getFullYear()}</span>
            </div>
          </div>
        </div>

        {/* --- How it works ------------------------------------------------ */}
        <section className="relative z-10 mx-auto max-w-6xl px-6 py-24 md:px-10 md:py-32">
          <div className="mb-14 max-w-2xl">
            <span className="eyebrow text-amber">How it works</span>
            <h2 className="display mt-3 text-4xl md:text-5xl">Three steps from parked to scored.</h2>
          </div>
          <div className="grid gap-px overflow-hidden rounded-card border border-hairline bg-hairline md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="bg-ink-1 p-7 md:p-8">
                <div className="stat-num text-4xl font-medium text-amber">{s.n}</div>
                <h3 className="display mt-5 text-xl">{s.title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-white/55">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* --- Close ------------------------------------------------------- */}
        <section className="relative z-10 mx-auto max-w-6xl px-6 pb-28 md:px-10">
          <div className="relative overflow-hidden rounded-card border border-hairline bg-ink-1 px-8 py-20 text-center">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{ background: "radial-gradient(60% 80% at 50% 0%, rgba(255,176,32,0.10), transparent 70%)" }}
            />
            <div className="relative">
              <h2 className="display text-4xl md:text-5xl">
                Put your driving <span className="text-amber">on the clock.</span>
              </h2>
              <p className="mx-auto mt-4 max-w-md text-white/55">
                Free to start. No car mods needed — just your phone.
              </p>
              <button onClick={enter} className="btn-primary mt-8 !px-8 !py-3.5">
                Get started
              </button>
            </div>
          </div>
        </section>

        <footer className="border-t border-hairline">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-8 text-[10px] uppercase tracking-[0.25em] text-white/30 md:px-10">
            <span>Stratum</span>
            <span>© {new Date().getFullYear()}</span>
          </div>
        </footer>

        {/* --- Mobile menu -------------------------------------------------- */}
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-8 bg-ink/95 backdrop-blur-xl"
          >
            <button
              onClick={() => setMenuOpen(false)}
              aria-label="Close menu"
              className="absolute right-6 top-6 p-2 text-white/60 transition-colors hover:text-white"
            >
              <X size={22} />
            </button>
            <button onClick={enter} className="display text-4xl text-white/85 transition-colors hover:text-amber">
              Sign in
            </button>
            <button onClick={enter} className="display text-4xl text-white/85 transition-colors hover:text-amber">
              Create account
            </button>
          </motion.div>
        )}
      </div>
    </MotionConfig>
  )
}
