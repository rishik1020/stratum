import { useState } from "react"
import { motion, MotionConfig } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { Menu, X } from "lucide-react"

import { HeroObject } from "./HeroObject"
import { routes } from "../routes"

const EASE = [0.16, 1, 0.3, 1] as const

/**
 * One scene, one action.
 *
 * The reference is a single full-viewport frame — wordmark, a centred type
 * stack, a rotating object on a dark road, and two lines of meta pinned to the
 * corners. Nothing scrolls, so everything on screen has to earn its place;
 * the feature grid, stat band and step list that used to live below the fold
 * are gone rather than pushed down.
 */
export function LandingPage() {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const enter = () => navigate(routes.signin)

  return (
    <MotionConfig reducedMotion="user">
      <div className="relative h-[100dvh] overflow-hidden bg-ink text-white">
        {/* Road surface: a dark plane with perspective lane markings, so the
            object reads as sitting on something rather than floating. */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(70% 50% at 50% 42%, rgba(255,255,255,0.045), transparent 70%)",
            }}
          />
          <div
            className="absolute inset-x-0 bottom-0 h-[42%]"
            style={{
              background: "linear-gradient(to bottom, transparent, rgba(255,255,255,0.028))",
              maskImage: "linear-gradient(to bottom, transparent, black 40%)",
              WebkitMaskImage: "linear-gradient(to bottom, transparent, black 40%)",
            }}
          />
          <div
            className="absolute inset-x-0 bottom-0 h-[38%] opacity-[0.5]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, transparent 0 88px, rgba(255,255,255,0.12) 88px 132px)",
              transform: "perspective(320px) rotateX(72deg)",
              transformOrigin: "bottom",
              maskImage: "linear-gradient(to top, black, transparent 85%)",
              WebkitMaskImage: "linear-gradient(to top, black, transparent 85%)",
            }}
          />
        </div>

        {/* --- Top bar ---------------------------------------------------- */}
        <header className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-6 pt-safe md:px-10">
          <span className="display py-5 text-sm tracking-tight text-white/90">STRATUM</span>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            className="-mr-2 p-2 text-white/70 transition-colors hover:text-white"
          >
            <Menu size={20} />
          </button>
        </header>

        {/* --- Centre stack ----------------------------------------------- */}
        <div className="relative z-20 flex h-full flex-col items-center justify-start pt-[18vh] text-center">
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE }}
            className="text-[10px] font-medium uppercase tracking-[0.4em] text-white/40"
          >
            Strava for cars
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.08, ease: EASE }}
            className="display mt-5 text-[10vw] leading-[0.92] text-white/85 sm:text-6xl md:text-7xl"
          >
            RACE ANYONE.
            <br />
            SCORE EVERY DRIVE.
          </motion.h1>

          <motion.button
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.2, ease: EASE }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={enter}
            className="mt-8 rounded-pill border border-white/25 px-8 py-3 text-[11px] font-medium uppercase tracking-[0.25em] text-white/85 transition-colors hover:border-amber hover:text-amber"
          >
            Get started
          </motion.button>
        </div>

        {/* --- The object -------------------------------------------------- */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.1, delay: 0.15, ease: EASE }}
          className="pointer-events-none absolute bottom-[6vh] left-1/2 z-10 w-[74vmin] max-w-[520px] -translate-x-1/2"
        >
          <HeroObject />
        </motion.div>

        {/* --- Corner meta ------------------------------------------------- */}
        <footer className="absolute inset-x-0 bottom-0 z-30 flex items-center justify-between px-6 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] text-[10px] uppercase tracking-[0.25em] text-white/30 md:px-10">
          <span>Telemetry</span>
          <span>{new Date().getFullYear()}</span>
        </footer>

        {/* --- Menu -------------------------------------------------------- */}
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-8 bg-ink/95 backdrop-blur-xl"
          >
            <button
              onClick={() => setMenuOpen(false)}
              aria-label="Close menu"
              className="absolute right-6 top-6 p-2 text-white/60 transition-colors hover:text-white md:right-10"
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
