import { ReactNode, useEffect, useRef, useState } from "react"
import { motion, useInView, animate } from "framer-motion"
import { EASE } from "../lib/motion"

// Futuristic Stratum logo — geometric speed mark + Space Grotesk wordmark.
export function Logo({ size = 28, withText = true, className = "" }: { size?: number; withText?: boolean; className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="32" y2="32">
            <stop stopColor="#FFC65C" />
            <stop offset="0.55" stopColor="#FFB020" />
            <stop offset="1" stopColor="#C77F00" />
          </linearGradient>
        </defs>
        <rect x="1.2" y="1.2" width="29.6" height="29.6" rx="8.5" stroke="url(#lg)" strokeWidth="1.6" />
        <path d="M9 21.5 L16 10 L23 21.5" stroke="url(#lg)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 21.5 L16 15 L20 21.5" stroke="#fff" strokeOpacity="0.85" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {withText && <span className="font-display text-lg font-bold tracking-tight text-white">STRATUM</span>}
    </div>
  )
}

// Scroll-reveal wrapper.
export function Reveal({ children, delay = 0, y = 24, className = "" }: { children: ReactNode; delay?: number; y?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-70px" }}
      transition={{ duration: 0.6, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}

// Count-up number when scrolled into view.
export function Counter({ to, decimals = 0, suffix = "", prefix = "", className = "" }: { to: number; decimals?: number; suffix?: string; prefix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: "-40px" })
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!inView) return
    const controls = animate(0, to, { duration: 1.6, ease: EASE, onUpdate: (v) => setVal(v) })
    return () => controls.stop()
  }, [inView, to])
  return (
    <span ref={ref} className={className}>
      {prefix}
      {val.toFixed(decimals)}
      {suffix}
    </span>
  )
}

// The landing page's amber CTA.
export function GlowButton({ children, onClick, variant = "primary", className = "" }: { children: ReactNode; onClick?: () => void; variant?: "primary" | "ghost"; className?: string }) {
  if (variant === "ghost") {
    return (
      <motion.button
        onClick={onClick}
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.97 }}
        className={`rounded-pill border border-hairline bg-ink-2 px-5 py-2.5 text-sm font-medium text-white/90 transition-colors hover:bg-ink-3 ${className}`}
      >
        {children}
      </motion.button>
    )
  }
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -2, boxShadow: "0 12px 44px rgba(255,176,32,0.45)" }}
      whileTap={{ scale: 0.97 }}
      className={`inline-flex items-center gap-2 rounded-pill bg-amber px-5 py-2.5 text-sm font-semibold text-amber-ink shadow-[0_8px_30px_rgba(255,176,32,0.3)] ${className}`}
    >
      {children}
    </motion.button>
  )
}
