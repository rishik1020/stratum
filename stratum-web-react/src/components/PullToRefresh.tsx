import { ReactNode, useCallback, useEffect, useRef, useState } from "react"
import { RefreshCw } from "lucide-react"

/**
 * Pull down at the top of a screen to reload it.
 *
 * On a phone there is no visible refresh control anywhere in the app, so the
 * only way to pick up a drive you just finished on another device is to reload
 * the browser. Pulling is the gesture people already try.
 *
 * Only binds on coarse pointers, and only engages when the page is already
 * scrolled to the top — otherwise it would fight normal scrolling. The browser's
 * own overscroll refresh is left alone: this sits inside the page, and
 * `overscroll-behavior-y: contain` on the wrapper stops the two firing together.
 */

const TRIGGER_PX = 72
const MAX_PULL_PX = 110

export function PullToRefresh({
  onRefresh,
  children,
}: {
  onRefresh: () => Promise<unknown> | void
  children: ReactNode
}) {
  const [pull, setPull] = useState(0)
  const [busy, setBusy] = useState(false)
  const startY = useRef<number | null>(null)
  const armed = useRef(false)

  const run = useCallback(async () => {
    setBusy(true)
    try {
      await onRefresh()
    } finally {
      // Held briefly so the spinner is legible rather than a flicker.
      setTimeout(() => {
        setBusy(false)
        setPull(0)
      }, 350)
    }
  }, [onRefresh])

  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) return

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || busy) return
      // Only from a genuine top-of-page, so this never hijacks a scroll.
      armed.current = window.scrollY <= 0
      startY.current = armed.current ? e.touches[0].clientY : null
    }
    const onMove = (e: TouchEvent) => {
      if (!armed.current || startY.current == null || busy) return
      const dy = e.touches[0].clientY - startY.current
      if (dy <= 0) {
        setPull(0)
        return
      }
      // Resistance, so it feels attached rather than free-running.
      setPull(Math.min(MAX_PULL_PX, dy * 0.5))
    }
    const onEnd = () => {
      if (!armed.current) return
      armed.current = false
      startY.current = null
      setPull((p) => {
        if (p >= TRIGGER_PX) {
          void run()
          return TRIGGER_PX
        }
        return 0
      })
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
  }, [busy, run])

  const active = pull > 0 || busy
  const progress = Math.min(1, pull / TRIGGER_PX)

  return (
    <div style={{ overscrollBehaviorY: "contain" }}>
      <div
        aria-hidden={!active}
        className="pointer-events-none flex items-center justify-center overflow-hidden"
        style={{
          height: active ? pull : 0,
          opacity: active ? 1 : 0,
          transition: armed.current ? "none" : "height 220ms ease, opacity 220ms ease",
        }}
      >
        <RefreshCw
          size={18}
          className={busy ? "animate-spin text-amber" : "text-white/45"}
          style={{ transform: busy ? undefined : `rotate(${progress * 270}deg)` }}
        />
      </div>
      <div
        style={{
          transform: active ? `translateY(${Math.min(pull, MAX_PULL_PX) * 0.15}px)` : undefined,
          transition: armed.current ? "none" : "transform 220ms ease",
        }}
      >
        {children}
      </div>
    </div>
  )
}
