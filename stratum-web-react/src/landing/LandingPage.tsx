import { ReactNode, useState } from "react"
import {
  motion,
  MotionConfig,
  useScroll,
  useTransform,
  useMotionValue,
  useAnimationFrame,
  useVelocity,
  useSpring,
  useMotionTemplate,
  useReducedMotion,
} from "framer-motion"
import { Radio, Trophy, Gauge, Play, Activity, Car, ArrowRight, ArrowDown } from "lucide-react"
import { AuroraBackground } from "./AuroraBackground"
import { GlobeCanvas } from "./GlobeCanvas"
import { useLenis } from "./useLenis"
import { useNavigate } from "react-router-dom"
import { routes } from "../routes"
import { Logo, Reveal, Counter, GlowButton } from "./ui"
import { staggerParent, staggerChild } from "../lib/motion"

const EASE = [0.16, 1, 0.3, 1] as const

const FEATURES = [
  { icon: Radio, title: "Live multiplayer racing", desc: "Race friends in real time — sub-second positions stream from every phone.", color: "#8b5cf6" },
  { icon: Trophy, title: "F1 gap leaderboard", desc: "Gap to the leader and interval to the car ahead, updating live.", color: "#a3e635" },
  { icon: Gauge, title: "Driving Score + AI coach", desc: "Safety, eco, comfort, performance — scored, with plain-English tips.", color: "#d946ef" },
  { icon: Play, title: "Full drive replay", desc: "Scrub any finished drive back with the complete telemetry stream.", color: "#c084fc" },
  { icon: Activity, title: "Telemetry HUD", desc: "Speed, altitude, heading and real G-force, interpolated buttery smooth.", color: "#bef264" },
  { icon: Car, title: "Your garage", desc: "Add your cars and track per-vehicle distance, top speeds and bests.", color: "#a78bfa" },
]

// Floating channel-style tiles scattered around the globe (some blurred = depth).
const TILES = [
  { label: "LIVE", style: "left-[16%] top-[30%]", blur: false, big: false },
  { label: "SCORE", style: "right-[20%] top-[20%]", blur: false, big: true },
  { label: "REPLAY", style: "right-[12%] top-[42%]", blur: true, big: false },
  { label: "GAP", style: "left-[24%] top-[52%]", blur: false, big: false },
  { label: "SPRINT", style: "left-[18%] top-[68%]", blur: true, big: false },
  { label: "HUD", style: "left-[42%] top-[70%]", blur: false, big: true },
  { label: "TELEMETRY", style: "right-[24%] top-[62%]", blur: false, big: false },
]

function FloatingTile({ label, style, blur, big, i }: { label: string; style: string; blur: boolean; big: boolean; i: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: blur ? 0.55 : 1, scale: 1 }}
      transition={{ duration: 0.7, delay: 0.5 + i * 0.08, ease: EASE }}
      className={`absolute z-20 ${style}`}
    >
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 4 + i * 0.4, repeat: Infinity, ease: "easeInOut" }}
        className={`glass flex items-center justify-center rounded-2xl font-display font-semibold tracking-wide text-white/90 ${big ? "h-20 w-24 text-base" : "h-14 w-20 text-sm"} ${blur ? "blur-[2px]" : ""}`}
      >
        {label}
      </motion.div>
    </motion.div>
  )
}

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

// Spinning alloy wheel centerpiece. Drop your image at /public/wheel.png (or
// .jpg/.jpeg/.webp) and it swaps in automatically; until then it shows the
// animated race globe. The photo is masked to a circle so only the round
// wheel+tyre shows while it spins.
const WHEEL_SRCS = ["/wheel.png", "/wheel.jpg", "/wheel.jpeg", "/wheel.webp"]

function HeroWheel() {
  const [idx, setIdx] = useState(0)
  const [ok, setOk] = useState(false)
  const exhausted = idx >= WHEEL_SRCS.length
  const reduce = useReducedMotion()

  // Continuous frame-driven spin (no loop seam) that speeds up with scroll.
  const rot = useMotionValue(0)
  const { scrollY } = useScroll()
  const scrollVel = useVelocity(scrollY)
  const smoothVel = useSpring(scrollVel, { stiffness: 220, damping: 45 })
  useAnimationFrame((_, delta) => {
    if (reduce) return
    const base = 26 // deg/sec idle spin
    const boost = smoothVel.get() * 0.025 // extra spin from scroll velocity
    rot.set(rot.get() + (base + boost) * (delta / 1000))
  })
  // Motion blur that grows with spin speed (subtle).
  const blurPx = useTransform(smoothVel, (v) => Math.min(3.5, Math.abs(v) * 0.0016))
  const wheelFilter = useMotionTemplate`blur(${blurPx}px)`
  // Counter-rotating specular sheen so the alloy catches light as it turns.
  const sheen = useTransform(rot, (r) => -r * 0.6)
  const sheenT = useMotionTemplate`rotate(${sheen}deg)`

  return (
    <motion.div
      className="relative h-full w-full"
      animate={reduce ? undefined : { y: [0, -10, 0] }}
      transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
    >
      {/* violet glow halo */}
      <div className="pointer-events-none absolute inset-[-18%] rounded-full blur-3xl" style={{ background: "radial-gradient(circle, rgba(139,92,246,0.32), transparent 62%)" }} />

      {!exhausted && (
        <div className={`absolute inset-0 z-10 overflow-hidden rounded-full ${ok ? "" : "hidden"}`} style={{ boxShadow: "0 22px 60px rgba(0,0,0,0.65)" }}>
          <motion.img
            src={WHEEL_SRCS[idx]}
            alt="Stratum alloy wheel"
            onLoad={() => setOk(true)}
            onError={() => { setOk(false); setIdx((i) => i + 1) }}
            className="h-full w-full object-cover"
            style={{ rotate: rot, filter: wheelFilter, objectPosition: "50% 72%", transformOrigin: "49% 50%", willChange: "transform" }}
          />
          {/* rotating specular sheen */}
          <motion.div
            className="pointer-events-none absolute inset-0 mix-blend-overlay"
            style={{
              transform: sheenT,
              background: "conic-gradient(from 0deg, transparent 0deg, rgba(255,255,255,0.22) 30deg, transparent 90deg, transparent 210deg, rgba(255,255,255,0.12) 250deg, transparent 320deg)",
            }}
          />
          {/* inner vignette for depth */}
          <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(circle, transparent 55%, rgba(0,0,0,0.45) 100%)" }} />
        </div>
      )}
      {/* lime rim ring on top of the wheel */}
      {ok && <div className="pointer-events-none absolute inset-0 z-20 rounded-full ring-1 ring-[#a3e635]/45 shadow-[0_0_60px_rgba(163,230,53,0.22)]" />}

      {!ok && <GlobeCanvas className="relative z-10 block h-full w-full" />}
    </motion.div>
  )
}

function HeroScene() {
  const { scrollY } = useScroll()
  const wordY = useTransform(scrollY, [0, 700], [0, -160])
  const wordOpacity = useTransform(scrollY, [0, 450], [1, 0])
  const globeScale = useTransform(scrollY, [0, 700], [1, 0.72])
  const globeOpacity = useTransform(scrollY, [0, 600], [1, 0])

  return (
    <section className="relative flex h-[100dvh] items-center justify-center overflow-hidden">
      <div className="mesh-dots pointer-events-none absolute inset-0 opacity-50" />

      {/* Giant background word */}
      <motion.h1
        style={{ y: wordY, opacity: wordOpacity }}
        className="font-anton pointer-events-none absolute select-none whitespace-nowrap text-[19vw] leading-none text-white/85"
      >
        STRATUM
      </motion.h1>

      {/* Spinning alloy wheel (falls back to animated globe until image is added) */}
      <motion.div style={{ scale: globeScale, opacity: globeOpacity }} className="relative z-10 aspect-square w-[46vmin]">
        <HeroWheel />
      </motion.div>

      {/* Centered marker */}
      <div className="absolute left-1/2 top-[46%] z-20 -translate-x-1/2 flex items-center gap-3 text-[10px] font-medium uppercase tracking-[0.25em] text-white/55">
        <span>Real-time</span>
        <span className="h-px w-16 bg-gradient-to-r from-[#8b5cf6] to-[#a3e635]" />
        <span>Telemetry</span>
      </div>

      {/* Floating tiles */}
      {TILES.map((tl, i) => (
        <FloatingTile key={tl.label} {...tl} i={i} />
      ))}

      {/* Scroll hint */}
      <motion.div
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        className="absolute bottom-8 left-1/2 z-20 -translate-x-1/2 flex flex-col items-center gap-1 text-white/40"
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
            "radial-gradient(80% 60% at 20% 30%, rgba(139,92,246,0.18), transparent 60%), repeating-linear-gradient(100deg, transparent 0 9px, rgba(255,255,255,0.018) 9px 10px)",
        }}
      />
      <div className="relative mx-auto grid max-w-6xl items-stretch gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* Left: headline */}
        <div>
          <Reveal>
            <div className="mb-5 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.25em] text-white/50">
              <span className="h-1.5 w-1.5 rounded-full bg-[#a3e635]" /> Stratum Racing
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
              <span className="font-anton text-3xl leading-none text-[#a3e635]">“</span>
              <h3 className="font-display text-2xl font-bold uppercase tracking-tight text-[#c6f24e] md:text-3xl">Own your driving</h3>
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
          <div className="flex h-full flex-col justify-between rounded-3xl bg-[#c6f24e] p-7 text-[#0a0a12]">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#0a0a12]/70">
              <span className="h-1.5 w-1.5 rounded-full bg-[#0a0a12]" /> Stratum Sport
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
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#a3e635]">Features</span>
        <h2 className="font-display mt-3 text-4xl font-bold tracking-tight md:text-5xl">Built like a race engineer's screen</h2>
        <p className="mx-auto mt-4 max-w-xl text-white/55">Everything to turn an ordinary drive into data — and a sprint into a race.</p>
      </Reveal>
      <motion.div variants={staggerParent} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-60px" }} className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => (
          <motion.div key={f.title} variants={staggerChild} whileHover={{ y: -6 }} className="glass group relative overflow-hidden rounded-2xl p-6 transition-colors hover:bg-white/[0.06]">
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
      <div className="relative min-h-[100dvh] overflow-x-hidden bg-[#0a0a12] text-white">
        <AuroraBackground />
        <Nav onEnter={onEnter} />
        <Section>
          <HeroScene />
          <SportScene onEnter={onEnter} />
          <StatBand />
          <Features />
          <Cta onEnter={onEnter} />
          <footer className="border-t border-white/[0.06]">
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
