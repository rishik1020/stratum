import type { Variants } from "framer-motion"

/** The app's standard ease — a soft, confident settle. */
export const EASE = [0.16, 1, 0.3, 1] as const

/** Wrap a group in `staggerParent` and its items in `staggerChild` to cascade them in. */
export const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
}

export const staggerChild: Variants = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
}
