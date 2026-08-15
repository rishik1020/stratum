import { motion, MotionConfig, useScroll, useTransform } from "framer-motion"
import { Radio, Trophy, Gauge, Play, Activity, Car, ArrowRight, ArrowDown } from "lucide-react"
import { useNavigate } from "react-router-dom"

import { GlobeCanvas } from "./GlobeCanvas"
import { RingButton } from "./RingButton"
import { useLenis } from "./useLenis"
import { Logo, Reveal, Counter, GlowButton } from "./ui"
import { routes } from "../routes"
import { staggerParent, staggerChild } from "../lib/motion"

const FEATURES = [
  { icon: Radio, title: "Live multiplayer racing", desc: "Race friends in real time — sub-second positions stream from every phone." },
  { icon: Trophy, title: "F1 gap leaderboard", desc: "Gap to the leader and interval to the car ahead, updating live." },
  { icon: Gauge, title: "Driving Score + coach", desc: "Safety, eco, comfort, performance — scored, with plain-English tips." },
  { icon: Play, title: "Full drive replay", desc: "Scrub any finished drive back with the complete telemetry stream." },
  { icon: Activity, title: "Telemetry HUD", desc: "Speed, altitude, heading and real G-force, interpolated buttery smooth." },
  { icon: Car, title: "Your garage", desc: "Add your cars and track per-vehicle distance, top speeds and bests." },
]

const HERO_CHIPS = [
  { label: "Live racing", detail: "Sub-second" },
  { label: "Drive score", detail: "0–100" },
  { label: "Full replay", detail: "Every metre" },
]

const STEPS = [
  { n: "01", title: "Add your car", body: "Pick it from the catalogue — specs autofill, and stay editable if yours is modified." },
  { n: "02", title: "Drive or race", body: "Start a solo drive, or open a sprint and share the room code with your crew." },
  { n: "03", title: "Read the data", body: "Score, coach notes and a scrubbable replay of the whole drive, waiting when you stop." },
]

function Nav({ onEnter }: { onEnter: () => void }) {
  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 pt-safe pb-4">
        <Logo />
        <nav className="hidden items-center gap-8 text-sm text-white/55 md:flex">
          <a href="#how" className="transition-colors hover:text-white">How it works</a>
          <a href="#features" className="transition-colors hover:text-white">Features</a>
        </nav>
        <div className="flex items-center gap-2.5">
          <button onClick={onEnter} className="hidden text-sm text-white/70 transition-colors hover:text-white sm:block">
            Sign in
          </button>
          <GlowButton onClick={onEnter}>Get started</GlowButton>
        </div>
      </div>
    </header>
  )
}

function HeroScene({ onEnter }: { onEnter: () => void }) {
  const { scrollY } = useScroll()
  const wordY = useTransform(scrollY, [0, 700], [0, -160])
  const wordOpacity = useTransform(scrollY, [0, 450], [1, 0])
  const globeScale = useTransform(scrollY, [0, 700], [1, 0.72])
  const globeOpacity = useTransform(scrollY, [0, 600], [1, 0])

  return (
    <section className="relative flex h-[100dvh] items-center justify-center overflow-hidden">
      <div className="mesh-dots pointer-events-none absolute inset-0 opacity-40" />

      {/* Giant background word, kept very low contrast so it's texture rather
          than a competing headline. */}
      <motion.h1
        style={{ y: wordY, opacity: wordOpacity }}
        className="display pointer-events-none absolute select-none whitespace-nowrap text-[19vw] leading-none text-white/[0.05]"
      >
        STRATUM
      </motion.h1>

      {/* Globe + the ring it's arranged around. The globe is decoration and
          must never eat the press, so it's pointer-events-none underneath. */}
      <motion.div
        style={{ scale: globeScale, opacity: globeOpacity }}
        className="relative z-10 flex aspect-square w-[86vmin] max-w-[540px] items-center justify-center"
      >
        <GlobeCanvas className="pointer-events-none absolute inset-0 block h-full w-full" />

        <div className="relative z-20 flex flex-col items-center">
          <span className="mb-5 text-[10px] font-medium uppercase tracking-[0.25em] text-white/45">
            Real-time telemetry
          </span>
          <RingButton label="Start" sublabel="Get going" onClick={onEnter} />
        </div>
      </motion.div>

      {/* Chips under the ring, mirroring the reference's shortcut row — here
          they state what you get rather than pretending to be actions a
          signed-out visitor could take. */}
      <motion.div
        style={{ opacity: globeOpacity }}
        className="absolute bottom-24 left-1/2 z-20 flex -translate-x-1/2 gap-2 px-4"
      >
        {HERO_CHIPS.map((c) => (
          <div key={c.label} className="rounded-2xl border border-hairline bg-ink-1/80 px-4 py-2.5 text-center">
            <div className="text-[10px] uppercase tracking-[0.15em] text-white/35">{c.detail}</div>
            <div className="mt-0.5 text-xs font-medium text-white/85">{c.label}</div>
          </div>
        ))}
      </motion.div>

      <motion.div
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        className="absolute bottom-8 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-1 text-white/35"
      >
        <span className="text-[10px] uppercase tracking-[0.2em]">Scroll</span>
        <ArrowDown size={16} />
      </motion.div>
    </section>
  )
}

/** The pitch, carried by one oversized number per step rather than artwork. */
function HowItWorks() {
  return (
    <section id="how" className="relative z-10 mx-auto max-w-6xl px-5 py-24 md:py-32">
      <Reveal className="mb-14 max-w-2xl">
        <span className="eyebrow text-amber">How it works</span>
        <h2 className="display mt-3 text-4xl md:text-5xl">Three steps from parked to scored.</h2>
      </Reveal>

      <motion.div
        variants={staggerParent}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-60px" }}
        className="grid gap-px overflow-hidden rounded-card border border-hairline bg-hairline md:grid-cols-3"
      >
        {STEPS.map((s) => (
          <motion.div key={s.n} variants={staggerChild} className="bg-ink-1 p-7 md:p-8">
            <div className="stat-num text-4xl font-medium text-amber">{s.n}</div>
            <h3 className="display mt-5 text-xl">{s.title}</h3>
            <p className="mt-2.5 text-sm leading-relaxed text-white/55">{s.body}</p>
          </motion.div>
        ))}
      </motion.div>
    </section>
  )
}

function StatBand() {
  const stats = [
    { v: 60, s: " FPS", l: "Smooth telemetry" },
    { v: 4, s: "", l: "Score dimensions" },
    { v: 100, s: "%", l: "Your own data" },
    { v: 1, s: "s", l: "Live update rate" },
  ]
  return (
    <section className="relative z-10 mx-auto max-w-6xl px-5">
      <Reveal>
        <div className="grid grid-cols-2 gap-6 rounded-card border border-hairline bg-ink-1 px-6 py-8 md:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.l} className="text-center">
              <Counter to={stat.v} suffix={stat.s} className="stat-num text-4xl font-medium text-white" />
              <div className="mt-1.5 text-xs text-white/45">{stat.l}</div>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  )
}

function Features() {
  return (
    <section id="features" className="relative z-10 mx-auto max-w-6xl px-5 py-24">
      <Reveal className="mb-12 max-w-2xl">
        <span className="eyebrow text-amber">Features</span>
        <h2 className="display mt-3 text-4xl md:text-5xl">Built like a race engineer's screen</h2>
        <p className="mt-4 text-white/55">
          Everything to turn an ordinary drive into data — and a sprint into a race.
        </p>
      </Reveal>

      <motion.div
        variants={staggerParent}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-60px" }}
        className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
      >
        {FEATURES.map((f) => (
          <motion.div
            key={f.title}
            variants={staggerChild}
            whileHover={{ y: -4 }}
            className="rounded-card border border-hairline bg-ink-1 p-6 transition-colors hover:border-hairline-strong"
          >
            {/* One accent, not six. The old grid gave every card its own hue,
                which turned the section into a swatch board. */}
            <div className="mb-4 inline-flex rounded-xl border border-amber-20 bg-amber-10 p-2.5">
              <f.icon size={20} className="text-amber" />
            </div>
            <h3 className="display text-lg">{f.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-white/55">{f.desc}</p>
          </motion.div>
        ))}
      </motion.div>
    </section>
  )
}

function Cta({ onEnter }: { onEnter: () => void }) {
  return (
    <section id="start" className="relative z-10 mx-auto max-w-6xl px-5 pb-24">
      <Reveal>
        <div className="relative overflow-hidden rounded-card border border-hairline bg-ink-1 px-8 py-16 text-center">
          <div
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
            <div className="mt-8 flex justify-center">
              <GlowButton onClick={onEnter} className="!px-7 !py-3.5 !text-base">
                Get started <ArrowRight size={18} />
              </GlowButton>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  )
}

export function LandingPage() {
  const navigate = useNavigate()
  const onEnter = () => navigate(routes.signin)
  useLenis()

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-[100dvh] overflow-x-hidden bg-ink text-white">
        <Nav onEnter={onEnter} />
        <div className="relative z-10">
          <HeroScene onEnter={onEnter} />
          <HowItWorks />
          <StatBand />
          <Features />
          <Cta onEnter={onEnter} />
          <footer className="border-t border-hairline">
            <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 sm:flex-row">
              <Logo size={24} />
              <p className="text-xs text-white/40">© {new Date().getFullYear()} Stratum · Strava for cars.</p>
            </div>
          </footer>
        </div>
      </div>
    </MotionConfig>
  )
}
