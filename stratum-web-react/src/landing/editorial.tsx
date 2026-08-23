import { ReactNode, useRef } from "react"
import { motion, useInView, useReducedMotion } from "framer-motion"

/**
 * The editorial kit the landing page is built from.
 *
 * One vocabulary, used consistently: a hairline rule, a small uppercase label
 * on the left, a large statement on the right, and generous empty space. The
 * restraint is the point — when almost nothing moves, the few things that do
 * carry weight.
 *
 * Everything reveals on scroll rather than on a timer, so the page is paced by
 * the reader instead of racing ahead of them.
 */

/** Slow, long-tailed ease. Nothing here should look springy. */
export const EASE = [0.16, 1, 0.3, 1] as const

/** Reveals once, when it comes into view. */
export function Reveal({
  children,
  delay = 0,
  y = 26,
  className = "",
}: {
  children: ReactNode
  delay?: number
  y?: number
  className?: string
}) {
  const still = useReducedMotion()

  // whileInView rather than a useInView + animate pair. The hook reported the
  // element as intersecting (an IntersectionObserver on the same node agreed,
  // ratio 1.0) while the animation never applied, so anything already on screen
  // at load — the hero subtitle — stayed invisible forever.
  //
  // `once` matters: re-animating on the way back up makes a long page twitchy
  // rather than composed. `amount: "some"` fires as soon as any part is in the
  // band, so content near the fold is never left stranded.
  return (
    <motion.div
      className={className}
      initial={still ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: 1.0, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  )
}

/**
 * A line of type that wipes up from behind a mask.
 *
 * The mask is what separates this from a plain fade: the words arrive from
 * somewhere rather than materialising in place.
 */
export function MaskLine({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode
  delay?: number
  className?: string
}) {
  const still = useReducedMotion()
  // The observer watches the *mask*, not the line inside it.
  //
  // The inner line starts a full line-height below the mask, and an
  // IntersectionObserver clips an element's intersection rect to its
  // `overflow: hidden` ancestors — so observing the line directly would mean
  // waiting for something the mask is actively hiding. The mask itself is never
  // transformed, so it is the honest thing to watch.
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.1 })

  return (
    <span ref={ref} className={`block overflow-hidden ${className}`}>
      <motion.span
        className="block"
        initial={still ? false : { y: "110%" }}
        animate={inView || still ? { y: "0%" } : { y: "110%" }}
        transition={{ duration: 1.05, delay, ease: EASE }}
      >
        {children}
      </motion.span>
    </span>
  )
}

/** Section rule + tiny label + index, as on the reference's numbered sections. */
export function SectionHead({ label, index }: { label: string; index: string }) {
  return (
    <Reveal>
      <div className="border-t border-hairline pt-5">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/55">
            {label}
          </span>
          <span className="stat-num text-[11px] text-white/30">{index}</span>
        </div>
      </div>
    </Reveal>
  )
}

/**
 * Label on the left, statement on the right.
 *
 * The asymmetry is doing the work: a small fixed-width label against a wide
 * measure of large text reads as considered in a way a centred block doesn't.
 */
export function Statement({
  label,
  children,
  action,
}: {
  label: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="grid gap-8 py-16 md:grid-cols-12 md:gap-6 md:py-28">
      <Reveal className="md:col-span-4">
        <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
          {label}
        </span>
      </Reveal>
      <div className="md:col-span-8">
        <h2 className="display text-[clamp(1.65rem,4.2vw,3.1rem)] leading-[1.12] text-white">
          {children}
        </h2>
        {action && <Reveal delay={0.15}>{action}</Reveal>}
      </div>
    </div>
  )
}

/** Outline pill, as on the reference. */
export function PillLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="pressable mt-8 inline-flex items-center gap-2 rounded-pill border border-hairline-strong px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80 transition-colors hover:border-amber hover:text-amber"
    >
      {children}
    </button>
  )
}

/**
 * The looping word band.
 *
 * Two copies translated as one track, so the seam never shows. CSS animation
 * rather than rAF: it must not stutter while the scroll-driven work runs, and
 * the compositor can own it entirely.
 */
export function Marquee({ text, className = "" }: { text: string; className?: string }) {
  const still = useReducedMotion()
  const run = Array.from({ length: 4 }, (_, i) => (
    <span key={i} className="whitespace-nowrap">
      {text}&nbsp;&nbsp;&mdash;&nbsp;&nbsp;
    </span>
  ))
  return (
    <div
      className={`flex overflow-hidden border-y border-hairline py-6 select-none ${className}`}
      aria-hidden
    >
      <div className={`flex ${still ? "" : "animate-marquee"}`}>
        <div className="flex">{run}</div>
        <div className="flex">{run}</div>
      </div>
    </div>
  )
}
