import { useEffect } from "react"

/**
 * A one-line refresh bus.
 *
 * Pull-to-refresh lives in the layout shell, but the data belongs to whichever
 * screen is mounted. Rather than thread a reload callback down through the
 * router, the shell announces "refresh" and interested screens re-run their own
 * loaders. Screens that don't subscribe simply ignore it.
 */
const EVENT = "stratum:refresh"

export function requestRefresh(): void {
  window.dispatchEvent(new Event(EVENT))
}

export function useRefreshSignal(handler: () => void): void {
  useEffect(() => {
    const fn = () => handler()
    window.addEventListener(EVENT, fn)
    return () => window.removeEventListener(EVENT, fn)
  }, [handler])
}
