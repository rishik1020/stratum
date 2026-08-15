import { ReactNode } from "react"
import { motion, MotionConfig, useScroll, useTransform } from "framer-motion"
import { Radio, Trophy, Gauge, Play, Activity, Car, ArrowRight, ArrowDown } from "lucide-react"
import { AuroraBackground } from "./AuroraBackground"
import { GlobeCanvas } from "./GlobeCanvas"
import { RingButton } from "./RingButton"
import { useLenis } from "./useLenis"
import { useNavigate } from "react-router-dom"
import { routes } from "../routes"
import { Logo, Reveal, Counter, GlowButton } from "./ui"
import { staggerParent, staggerChild } from "../lib/motion"

const FEATURES = [
  { icon: Radio, title: "Live multiplayer racing", desc: "Race friends in real time — sub-second positions stream from every phone.", color: "#FFB020" },
  { icon: Trophy, title: "F1 gap leaderboard", desc: "Gap to the leader and interval to the car ahead, updating live.", color: "#FFB020" },
  { icon: Gauge, title: "Driving Score + AI coach", desc: "Safety, eco, comfort, performance — scored, with plain-English tips.", color: "#4DA6FF" },
  { icon: Play, title: "Full drive replay", desc: "Scrub any finished drive back with the complete telemetry stream.", color: "#C084FC" },
  { icon: Activity, title: "Telemetry HUD", desc: "Speed, altitude, heading and real G-force, interpolated buttery smooth.", color: "#3DD68C" },
  { icon: Car, title: "Your garage", desc: "Add your cars and track per-vehicle distance, top speeds and bests.", color: "#a78bfa" },
]

function Nav({ onEnter }: { onEnter: () => void }) {
  return (
    <header className="fixed top-0 inset-x-0 z-50">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 pt-safe pb-4">
        <Logo />
        <nav className="hidden items-center gap-8 text-sm text-white/60 md:flex">
          <a href="#features" className="transition-colors hover:text-white">Features</a>
          <a href="#start" className="transition-colors hover:text-white">Get started</a>
        </nav>
        <div className="flex items-center gap-2.5">
          <button onClick={onEnter} className="hidden text-sm text-white/70 transition-colors hover:text-white sm:block">Sign in</button>
          <GlowButton onClick={onEnter}>Get started</GlowButton>
        </div>
      </div>
    </header>
  )
}

const HERO_CHIPS = [
  { label: "Live racing", detail: "Sub-second" },
  { label: "Drive score", detail: "0–100" },
  { label: "Full replay", detail: "Every metre" },
]

function HeroScene({ onEnter }: { onEnter: () => void }) {
  const { scrollY } = useScroll()
  const wordY = useTransform(scrollY, [0, 700], [0, -160])
  const wordOpacity = useTransform(scrollY, [0, 450], [1, 0])
  const globeScale = useTransform(scrollY, [0, 700], [1, 0.72])
  const globeOpacity = useTransform(scrollY, [0, 600], [1, 0])

  return (
    <section className="relative flex h-[100dvh] items-center justify-center overflow-hidden">
      <div className="mesh-dots pointer-events-none absolute inset-0 opacity-40" />

      {/* Giant background word */}
      <motion.h1
        style={{ y: wordY, opacity: wordOpacity }}
        className="font-anton pointer-events-none absolute select-none whitespace-nowrap text-[19vw] leading-none text-white/[0.07]"
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

      {/* Quick-glance chips under the ring, mirroring the reference's row of
          shortcuts — here they state what you get rather than pretending to be
          actions a signed-out visitor could take. */}
      <motion.div
        style={{ opacity: globeOpacity }}
        className="absolute bottom-24 left-1/2 z-20 flex -translate-x-1/2 gap-2 px-4"
      >
        {HERO_CHIPS.map((c) => (
          <div
            key={c.label}
            className="rounded-2xl border border-hairline bg-ink-1/80 px-4 py-2.5 text-center backdrop-blur-sm"
          >
            <div className="text-[10px] uppercase tracking-[0.15em] text-white/35">{c.detail}</div>
            <div className="mt-0.5 text-xs font-medium text-white/85">{c.label}</div>
          </div>
        ))}
      </motion.div>

      {/* Scroll hint */}
      <motion.div
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        className="absolute bottom-8 left-1/2 z-20 -translate-x-1/2 flex flex-col items-center gap-1 text-white/35"
      >
        <span className="text-[10px] uppercase tracking-[0.2em]">Scroll</span>
        <ArrowDown size={16} />
      </motion.div>
    </section>
  )
}

function SportScene({ onEnter }: { onEnter: () => void }) {
  return (
    <section className="relative overflow-hidden px-5 py-24 md:py-32">
      {/* Cinematic speed-streak backdrop */}
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(80% 60% at 20% 30%, rgba(255,176,32,0.18), transparent 60%), repeating-linear-gradient(100deg, transparent 0 9px, rgba(255,255,255,0.018) 9px 10px)",
        }}
      />
      <div className="relative mx-auto grid max-w-6xl items-stretch gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* Left: headline */}
        <div>
          <Reveal>
            <div className="mb-5 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.25em] text-white/50">
              <span className="h-1.5 w-1.5 rounded-full bg-[#FFB020]" /> Stratum Racing
            </div>
          </Reveal>
          <Reveal delay={0.05}>
            <h2 className="font-anton text-[16vw] leading-[0.86] text-white sm:text-7xl md:text-8xl">
              BEYOND
              <br />
              THE LIMIT
            </h2>
          </Reveal>
          <Reveal delay={0.12}>
            <div className="mt-6 flex items-start gap-2">
              <span className="font-anton text-3xl leading-none text-[#FFB020]">“</span>
              <h3 className="font-display text-2xl font-bold uppercase tracking-tight text-[#FFC65C] md:text-3xl">Own your driving</h3>
            </div>
          </Reveal>
          <Reveal delay={0.18}>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-white/55">
              Score every drive, race friends live, and replay it all — real-time racing telemetry from just your phone.
            </p>
          </Reveal>
          <Reveal delay={0.24}>
            <div className="mt-7">
              <GlowButton onClick={onEnter} className="!px-6 !py-3 !text-base">Get started</GlowButton>
            </div>
          </Reveal>
        </div>

        {/* Right: lime statement panel */}
        <Reveal delay={0.1}>
          <div className="flex h-full flex-col justify-between rounded-3xl bg-[#FFC65C] p-7 text-[#08080A]">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#08080A]/70">
              <span className="h-1.5 w-1.5 rounded-full bg-[#08080A]" /> Stratum Sport
            </div>
            <h3 className="font-display text-2xl font-bold leading-tight md:text-3xl">
              Stop just driving. Start racing the clock.
            </h3>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

function Features() {
  return (
    <section id="features" className="relative z-10 mx-auto max-w-6xl px-5 py-24">
      <Reveal className="mb-12 text-center">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#FFB020]">Features</span>
        <h2 className="font-display mt-3 text-4xl font-bold tracking-tight md:text-5xl">Built like a race engineer's screen</h2>
        <p className="mx-auto mt-4 max-w-xl text-white/55">Everything to turn an ordinary drive into data — and a sprint into a race.</p>
      </Reveal>
      <motion.div variants={staggerParent} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <motion.div key={f.title} variants={staggerChild} whileHover={{ y: -6 }} className="glass group relative overflow-hidden rounded-2xl p-6 transition-colors hover:bg-ink-3">
            <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100" style={{ background: f.color }} />
            <div className="relative">
              <div className="mb-4 inline-flex rounded-xl p-2.5" style={{ background: `${f.color}22`, border: `1px solid ${f.color}40` }}>
                <f.icon size={22} style={{ color: f.color }} />
              </div>
              <h3 className="font-display text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/55">{f.desc}</p>
            </div>
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
        <div className="glass grid grid-cols-2 gap-6 rounded-2xl px-6 py-8 md:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.l} className="text-center">
              <Counter to={stat.v} suffix={stat.s} className="font-display text-4xl font-bold text-gradient" />
              <div className="mt-1.5 text-xs text-white/50">{stat.l}</div>
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  )
}

function Cta({ onEnter }: { onEnter: () => void }) {
  return (
    <section id="start" className="relative z-10 mx-auto max-w-6xl px-5 py-24">
      <Reveal>
        <div className="glass-strong relative overflow-hidden rounded-3xl px-8 py-16 text-center">
          <div className="bg-gradient-lv pointer-events-none absolute inset-0 opacity-[0.1]" />
          <div className="relative">
            <h2 className="font-display text-4xl font-bold tracking-tight md:text-5xl">
              Put your driving <span className="text-gradient">on the clock.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-md text-white/60">Free to start. No car mods needed — just your phone.</p>
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

function Section({ children }: { children: ReactNode }) {
  return <div className="relative z-10">{children}</div>
}

export function LandingPage() {
  const navigate = useNavigate()
  const onEnter = () => navigate(routes.signin)
  useLenis()
  return (
    <MotionConfig reducedMotion="user">
      <div className="relative min-h-[100dvh] overflow-x-hidden bg-[#08080A] text-white">
        <AuroraBackground />
        <Nav onEnter={onEnter} />
        <Section>
          <HeroScene onEnter={onEnter} />
          <SportScene onEnter={onEnter} />
          <StatBand />
          <Features />
          <Cta onEnter={onEnter} />
          <footer className="border-t border-hairline">
            <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-5 py-8 sm:flex-row">
              <Logo size={24} />
              <p className="text-xs text-white/40">© {new Date().getFullYear()} Stratum · Strava for cars.</p>
            </div>
          </footer>
        </Section>
      </div>
    </MotionConfig>
  )
}
