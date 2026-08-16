import { Suspense, lazy, useState } from "react"
import { motion, MotionConfig } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { ArrowDown, Menu, RotateCcw, X } from "lucide-react"

import { InCarUI } from "./InCarUI"
import { BEATS, useCinematic, window_, ramp } from "./useCinematic"
import { routes } from "../routes"

// three.js is heavy even inside the already-lazy landing chunk, so the canvas
// is split again and only fetched once this page actually mounts.
const CarStage = lazy(() => import("./CarStage").then((m) => ({ default: m.CarStage })))

/** Total run time of the opening film, in seconds. */
const RUNTIME = BEATS.runtime

const STEPS = [
  { n: "01", title: "Add your car", body: "Pick it from the catalogue — specs autofill, and stay editable if yours is modified." },
  { n: "02", title: "Drive or race", body: "Start a solo drive, or open a sprint and share the room code with your crew." },
  { n: "03", title: "Read the data", body: "Score, coach notes and a scrubbable replay of the whole drive, waiting when you stop." },
]

/**
 * The landing page plays a film.
 *
 * It opens on the 911 in flat side profile, drifts forward, pushes in toward
 * the driver's glass while the in-car UI takes over and a drive is started,
 * then pulls out to a rear three-quarter as the car launches away. No scroll
 * required — the whole pitch lands before the visitor does anything.
 *
 * Everything on screen is keyed off one clock (useCinematic), so the 3D camera
 * and the DOM overlays are stepped from the same frame and can't drift apart.
 */
export function LandingPage() {
  const navigate = useNavigate()
  const enter = () => navigate(routes.signin)
  const [menuOpen, setMenuOpen] = useState(false)

  const { t, tRef, done, skip, replay, progress } = useCinematic(RUNTIME)

  // Act 1 copy rides the opening side profile, then clears for the cabin beat.
  const heroOpacity = window_(t, BEATS.heroIn, BEATS.heroOut, 0.9)
  // Closing card arrives with the car pulling away.
  const outroOpacity = ramp(t, BEATS.outroIn, BEATS.outroFull)

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative bg-ink text-white">
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

        {/* --- The film ---------------------------------------------------- */}
        <section className="relative h-[100dvh] overflow-hidden">
          <div className="absolute inset-0">
            <Suspense fallback={null}>
              <CarStage time={tRef} />
            </Suspense>
          </div>

          {/* Vignette so type always has something to sit on. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-10"
            style={{
              background: "radial-gradient(85% 65% at 50% 45%, transparent 25%, rgba(8,8,10,0.78) 100%)",
            }}
          />

          {/* Act 1 — side profile */}
          <div
            style={{ opacity: heroOpacity }}
            className="pointer-events-none absolute inset-x-0 top-[16vh] z-20 px-6 text-center"
          >
            <p className="text-[10px] font-medium uppercase tracking-[0.4em] text-white/45">
              Strava for cars
            </p>
            <h1 className="display mt-5 text-[11vw] leading-[0.92] text-white sm:text-6xl md:text-7xl">
              RACE ANYONE.
              <br />
              SCORE EVERY DRIVE.
            </h1>
          </div>

          {/* Act 2 — in the car */}
          <InCarUI t={t} />

          {/* Act 3 — it's gone */}
          <div
            style={{ opacity: outroOpacity }}
            className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center px-6 text-center"
          >
            <h2 className="display text-4xl leading-tight md:text-6xl">Then you just drive.</h2>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-white/55">
              Score, coach notes and a full replay are waiting when you stop.
            </p>
            <button
              onClick={enter}
              className="pointer-events-auto mt-8 rounded-pill bg-amber px-8 py-3.5 text-[11px] font-semibold uppercase tracking-[0.25em] text-amber-ink transition-colors hover:bg-amber-soft"
            >
              Get started
            </button>
          </div>

          {/* Transport: skip while it plays, replay once it's over. */}
          <div className="absolute inset-x-0 bottom-0 z-40 flex items-end justify-between px-6 pb-6 md:px-10">
            <span className="text-[10px] uppercase tracking-[0.25em] text-white/25">Telemetry</span>

            {!done ? (
              <button
                onClick={skip}
                className="flex items-center gap-3 text-[10px] uppercase tracking-[0.25em] text-white/40 transition-colors hover:text-white"
              >
                Skip
                <span className="relative h-px w-16 bg-white/15">
                  <span
                    className="absolute inset-y-0 left-0 bg-amber"
                    style={{ width: `${progress * 100}%` }}
                  />
                </span>
              </button>
            ) : (
              <button
                onClick={replay}
                className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-white/40 transition-colors hover:text-white"
              >
                <RotateCcw size={12} />
                Replay
              </button>
            )}
          </div>

          {/* Only invite scrolling once the film has said its piece. */}
          {done && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, y: [0, 8, 0] }}
              transition={{
                opacity: { duration: 0.6 },
                y: { duration: 1.8, repeat: Infinity, ease: "easeInOut" },
              }}
              className="pointer-events-none absolute bottom-16 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-1 text-white/35"
            >
              <span className="text-[10px] uppercase tracking-[0.2em]">How it works</span>
              <ArrowDown size={16} />
            </motion.div>
          )}
        </section>

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
