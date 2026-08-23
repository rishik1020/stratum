/**
 * Easing helpers for the landing page.
 *
 * What survives of `useCinematic`, which owned the old 15-second film's clock.
 * The film is gone — the page is scroll-driven now — but these are still how the
 * camera interpolates between shots.
 */

/** 0 → 1 across [from, to], clamped outside it. */
export const ramp = (t: number, from: number, to: number) =>
  Math.min(1, Math.max(0, (t - from) / Math.max(0.0001, to - from)))

export const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2)
