import { useEffect } from "react"
import Lenis from "lenis"

/**
 * Momentum scrolling for the landing page.
 *
 * Most of what reads as "smooth" on a site like this isn't the animations — it
 * is that the scroll itself has weight and eases to a stop instead of snapping
 * to the wheel's discrete steps. Every scroll-driven transform inherits that
 * for free.
 *
 * Scoped to the landing page only. It is deliberately *not* applied app-wide:
 * hijacking scroll on the dashboard would fight the pull-to-refresh gesture and
 * make long lists feel laggy on a phone.
 *
 * Disabled for anyone who asked for reduced motion, and on touch, where the OS
 * already provides momentum and overriding it feels worse than leaving it be.
 */
export function useSmoothScroll(enabled = true) {
  useEffect(() => {
    if (!enabled) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    if (window.matchMedia("(pointer: coarse)").matches) return

    const lenis = new Lenis({
      duration: 1.1,
      // Long, flat tail — the ease matters more than the duration for how
      // "expensive" the motion reads.
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      wheelMultiplier: 0.9,
      touchMultiplier: 1.6,
    })

    let raf = 0
    const loop = (time: number) => {
      lenis.raf(time)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      lenis.destroy()
    }
  }, [enabled])
}
