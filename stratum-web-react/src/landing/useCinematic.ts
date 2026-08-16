import { useCallback, useEffect, useRef, useState } from "react"

/**
 * The film's beat sheet, in seconds — the single source of truth for timing.
 *
 * The camera (CarStage), the in-car UI (InCarUI) and the page copy
 * (LandingPage) all read from here. When these lived in three files they
 * drifted: the head unit was reading 115 km/h while the car was still parked,
 * because the speed readout was keyed to the button press instead of the
 * launch.
 */
export const BEATS = {
  /** Hero copy over the opening side profile. */
  heroIn: 0.5,
  heroOut: 6.0,
  /** The in-car UI takes over as the camera reaches the glass. */
  uiIn: 6.2,
  // Clears just after the launch starts, so you feel it from inside (the road
  // streaks whip past) and then cut outside to watch the car actually go.
  uiOut: 13.0,
  /** "Start" is pressed — recording begins, but the car hasn't moved yet. */
  start: 9.4,
  /** The camera is back outside and the car launches. */
  launch: 11.9,
  launchFor: 3.5,
  /** Closing card. */
  outroIn: 13.6,
  outroFull: 15.0,
  runtime: 15.4,
} as const

/**
 * The landing film's clock.
 *
 * The page plays itself — no scrolling required — so everything on screen is
 * driven by elapsed seconds rather than scroll offset. Time advances on rAF
 * (not setInterval) so the 3D camera and the DOM overlays are stepped from the
 * same frame and can't drift apart.
 *
 * Returns `t` as state for the overlays that need to re-render, and `tRef` for
 * the canvas, which reads it every frame and must not force React renders.
 */
/**
 * Read a start time out of the URL: `#/?t=9.4` opens the film paused on that
 * second. Tuning a 15-second sequence otherwise means re-watching it from the
 * top after every keyframe tweak.
 */
function seekFromUrl(duration: number): number | null {
  const hash = window.location.hash
  const q = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : window.location.search.slice(1)
  const raw = new URLSearchParams(q).get("t")
  if (raw == null) return null
  const n = Number(raw)
  return Number.isFinite(n) ? Math.min(duration, Math.max(0, n)) : null
}

export function useCinematic(duration: number, { autoplay = true } = {}) {
  const seek = seekFromUrl(duration)
  const [t, setT] = useState(seek ?? 0)
  const [playing, setPlaying] = useState(seek == null && autoplay)
  const [done, setDone] = useState(false)
  const tRef = useRef(seek ?? 0)
  const rafRef = useRef(0)

  const skip = useCallback(() => {
    tRef.current = duration
    setT(duration)
    setPlaying(false)
    setDone(true)
  }, [duration])

  const replay = useCallback(() => {
    tRef.current = 0
    setT(0)
    setDone(false)
    setPlaying(true)
  }, [])

  useEffect(() => {
    // Anyone who asked for less motion gets the end state immediately rather
    // than a 15-second camera move they didn't want. A ?t= seek wins, since
    // that's someone deliberately inspecting a frame.
    if (seek == null && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      skip()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip])

  useEffect(() => {
    if (!playing) return
    let last: number | null = null

    const step = (ts: number) => {
      if (last != null) {
        // Clamp the delta so a backgrounded tab doesn't resume mid-film with a
        // multi-second jump.
        const dt = Math.min(0.05, (ts - last) / 1000)
        const next = tRef.current + dt
        if (next >= duration) {
          tRef.current = duration
          setT(duration)
          setPlaying(false)
          setDone(true)
          return
        }
        tRef.current = next
        setT(next)
      }
      last = ts
      rafRef.current = requestAnimationFrame(step)
    }

    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing, duration])

  return { t, tRef, playing, done, skip, replay, progress: Math.min(1, t / duration) }
}

/** 0 → 1 ramp across [from, to], clamped outside it. */
export const ramp = (t: number, from: number, to: number) =>
  Math.min(1, Math.max(0, (t - from) / Math.max(0.0001, to - from)))

/** Fades in over `fade`, holds, fades out before `to`. */
export const window_ = (t: number, from: number, to: number, fade = 0.6) => {
  if (t < from || t > to) return 0
  return Math.min(ramp(t, from, from + fade), 1 - ramp(t, to - fade, to))
}

export const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2)
export const easeOut = (x: number) => 1 - Math.pow(1 - x, 3)
