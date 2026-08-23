import { useEffect, useRef } from "react"
import { useLocation, useNavigate } from "react-router-dom"

import { HUB_ROUTES } from "../routes"

/**
 * Swipe left/right to move between the four hub tabs.
 *
 * On a phone the pill nav is the only way between Dashboard, Garage, Analytics
 * and Settings, which means aiming at a 48px circle every time. A horizontal
 * swipe is how every native app does this, and it costs nothing on desktop
 * because it only binds when the device actually has a coarse pointer.
 *
 * Deliberately conservative about what counts as a swipe:
 *
 * - **Single touch only.** A two-finger gesture is a pinch or a browser
 *   gesture, not a tab change.
 * - **Mostly horizontal, and far enough.** Requires ~64px of travel and twice
 *   as much X as Y, so scrolling a long page never trips it. The direction is
 *   locked in on the first significant movement, so a diagonal flick that
 *   starts as a scroll stays a scroll.
 * - **Never over a map.** Leaflet, the replay scrubber and the charts all want
 *   horizontal drags of their own; anything inside `[data-no-swipe]` is left
 *   alone.
 */

const MIN_DISTANCE_PX = 64
const DIRECTION_RATIO = 2

export function useSwipeNav(enabled = true) {
  const navigate = useNavigate()
  const location = useLocation()
  const pathRef = useRef(location.pathname)

  useEffect(() => {
    pathRef.current = location.pathname
  }, [location.pathname])

  useEffect(() => {
    if (!enabled) return
    if (!window.matchMedia("(pointer: coarse)").matches) return

    let startX = 0
    let startY = 0
    let tracking = false
    let axis: "none" | "x" | "y" = "none"

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        tracking = false
        return
      }
      const target = e.target as HTMLElement | null
      if (target?.closest("[data-no-swipe]")) {
        tracking = false
        return
      }
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      tracking = true
      axis = "none"
    }

    const onMove = (e: TouchEvent) => {
      if (!tracking || e.touches.length !== 1) return
      const dx = e.touches[0].clientX - startX
      const dy = e.touches[0].clientY - startY
      if (axis === "none" && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
        // Whichever axis moved first wins for the rest of the gesture.
        axis = Math.abs(dx) > Math.abs(dy) * DIRECTION_RATIO ? "x" : "y"
      }
    }

    const onEnd = (e: TouchEvent) => {
      if (!tracking) return
      tracking = false
      if (axis !== "x") return
      const touch = e.changedTouches[0]
      if (!touch) return
      const dx = touch.clientX - startX
      const dy = touch.clientY - startY
      if (Math.abs(dx) < MIN_DISTANCE_PX) return
      if (Math.abs(dx) < Math.abs(dy) * DIRECTION_RATIO) return

      const index = HUB_ROUTES.indexOf(pathRef.current)
      if (index < 0) return
      // Swiping left moves forward, matching the direction the content travels.
      const next = index + (dx < 0 ? 1 : -1)
      if (next < 0 || next >= HUB_ROUTES.length) return
      navigate(HUB_ROUTES[next])
    }

    document.addEventListener("touchstart", onStart, { passive: true })
    document.addEventListener("touchmove", onMove, { passive: true })
    document.addEventListener("touchend", onEnd, { passive: true })
    document.addEventListener("touchcancel", onEnd, { passive: true })
    return () => {
      document.removeEventListener("touchstart", onStart)
      document.removeEventListener("touchmove", onMove)
      document.removeEventListener("touchend", onEnd)
      document.removeEventListener("touchcancel", onEnd)
    }
  }, [enabled, navigate])
}
