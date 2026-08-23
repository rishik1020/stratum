import { Capacitor, registerPlugin } from "@capacitor/core"
import type { BackgroundGeolocationPlugin } from "@capacitor-community/background-geolocation"

// The package ships type definitions only — there is no JS entry point, so it's
// wired up through registerPlugin rather than imported. Safe to call on the web:
// the proxy only throws if you actually invoke a method, and we never do.
const BackgroundGeolocation =
  registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation")

/**
 * Location tracking that survives the screen going off.
 *
 * The problem this solves: `navigator.geolocation.watchPosition` runs in the
 * WebView, and both Android and iOS suspend the WebView when the screen locks
 * or the app is backgrounded. Fixes stop arriving, so a drive recorded with the
 * phone in a pocket — which is most drives — came out as a fraction of itself.
 *
 * Two implementations behind one interface:
 *
 *   - **Native (Capacitor):** `@capacitor-community/background-geolocation`
 *     runs an Android foreground service with a persistent notification. The OS
 *     keeps delivering fixes because the notification is the user's visible,
 *     dismissible consent that this is happening.
 *   - **Web:** plain `watchPosition`, plus a Screen Wake Lock so the display
 *     doesn't sleep mid-drive. A browser tab genuinely cannot track in the
 *     background — see `webBackgroundLimitation` and say so in the UI rather
 *     than letting people find out from a ruined drive.
 */

export interface Fix {
  latitude: number
  longitude: number
  /** km/h. Null when the platform can't derive it (usually stationary). */
  speedKmh: number | null
  headingDeg: number | null
  altitudeM: number | null
  accuracyM: number | null
  /** When the device took the fix. Carried through so buffered points replay
   *  at the time they happened, not the time the socket came back. */
  recordedAt: Date
}

export type TrackingMode = "background" | "foreground-only"

/** Great-circle distance between two fixes, in metres. */
export function haversineM(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.latitude - a.latitude)
  const dLng = toRad(b.longitude - a.longitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export interface Tracker {
  stop: () => Promise<void>
  mode: TrackingMode
}

interface StartOptions {
  onFix: (fix: Fix) => void
  onError: (message: string) => void
  /** Shown in the Android notification while recording. */
  notificationText?: string
}

/** True when a browser tab is doing the tracking, so it stops if you leave. */
export const webBackgroundLimitation = !Capacitor.isNativePlatform()

export function isNative(): boolean {
  return Capacitor.isNativePlatform()
}

async function startNative({ onFix, onError, notificationText }: StartOptions): Promise<Tracker> {
  const id = await BackgroundGeolocation.addWatcher(
    {
      // The notification is not decoration — on Android it is what buys the
      // foreground service, and without it the OS suspends us like any other
      // backgrounded app.
      backgroundMessage: notificationText || "Recording your drive",
      backgroundTitle: "Stratum",
      requestPermissions: true,
      // Every fix, not a filtered subset: the score is derived from the shape
      // of the speed trace, so dropped samples change the answer.
      distanceFilter: 0,
    },
    (location, error) => {
      if (error) {
        // The user declined, or turned location off in Settings. Anything else
        // is transient and the watcher keeps running.
        if (error.code === "NOT_AUTHORIZED") {
          onError("Stratum needs location access to record a drive — enable it in Settings.")
        } else {
          onError(error.message || "Location unavailable")
        }
        return
      }
      if (!location) return
      onFix({
        latitude: location.latitude,
        longitude: location.longitude,
        speedKmh: location.speed != null ? Math.max(0, location.speed * 3.6) : null,
        headingDeg:
          location.bearing != null && !Number.isNaN(location.bearing) ? location.bearing : null,
        altitudeM: location.altitude ?? null,
        accuracyM: location.accuracy ?? null,
        recordedAt: location.time != null ? new Date(location.time) : new Date(),
      })
    }
  )

  return {
    mode: "background",
    stop: async () => {
      await BackgroundGeolocation.removeWatcher({ id })
    },
  }
}

function startWeb({ onFix, onError }: StartOptions): Tracker {
  if (!("geolocation" in navigator)) {
    onError("Geolocation not supported by this browser")
    return { mode: "foreground-only", stop: async () => {} }
  }

  // Browsers only expose location on a secure origin. Opening the dev server
  // from a phone over http://<lan-ip> trips this, and the browser's own message
  // ("Only secure origins are allowed", plus a goo.gl link) tells you nothing
  // about what to do — so say it plainly instead of forwarding it.
  if (!window.isSecureContext) {
    onError(
      "Location needs a secure connection (https). Open Stratum over https, or on this device directly."
    )
    return { mode: "foreground-only", stop: async () => {} }
  }

  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const c = pos.coords
      onFix({
        latitude: c.latitude,
        longitude: c.longitude,
        speedKmh: c.speed != null ? Math.max(0, c.speed * 3.6) : null,
        headingDeg: c.heading != null && !Number.isNaN(c.heading) ? c.heading : null,
        altitudeM: c.altitude,
        accuracyM: c.accuracy,
        // pos.timestamp is epoch ms from the device.
        recordedAt: new Date(pos.timestamp || Date.now()),
      })
    },
    (err) => onError(err.message || "Location unavailable"),
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
  )

  return {
    mode: "foreground-only",
    stop: async () => navigator.geolocation.clearWatch(watchId),
  }
}

export async function startTracking(options: StartOptions): Promise<Tracker> {
  if (Capacitor.isNativePlatform()) {
    try {
      return await startNative(options)
    } catch (e) {
      // A missing/failed native plugin must not cost us the drive entirely —
      // foreground tracking is much better than none.
      options.onError(
        "Background tracking unavailable — recording will pause if you leave the app."
      )
      return startWeb(options)
    }
  }
  return startWeb(options)
}

// --- Screen Wake Lock --------------------------------------------------------

interface WakeLockLike {
  release: () => Promise<void>
  addEventListener: (type: string, fn: () => void) => void
}

/**
 * Keep the screen awake for the duration of a drive.
 *
 * On the web this is the only thing standing between a drive and the display
 * sleeping. It is not background tracking and shouldn't be described as such —
 * switching tabs or apps still stops the watch.
 *
 * The lock is dropped by the browser whenever the page is hidden, so it has to
 * be re-acquired on the way back rather than taken once.
 */
export function createWakeLock() {
  let lock: WakeLockLike | null = null
  let released = false

  const nav = navigator as Navigator & {
    wakeLock?: { request: (type: "screen") => Promise<WakeLockLike> }
  }

  const acquire = async () => {
    if (released || lock || !nav.wakeLock) return
    try {
      lock = await nav.wakeLock.request("screen")
      lock.addEventListener("release", () => {
        lock = null
      })
    } catch {
      // Denied, unsupported, or the tab isn't visible. Not worth surfacing —
      // the drive still records, the screen just may sleep.
    }
  }

  const onVisibility = () => {
    if (document.visibilityState === "visible") void acquire()
  }
  document.addEventListener("visibilitychange", onVisibility)
  void acquire()

  return {
    supported: !!nav.wakeLock,
    release: async () => {
      released = true
      document.removeEventListener("visibilitychange", onVisibility)
      try {
        await lock?.release()
      } catch {
        /* already gone */
      }
      lock = null
    },
  }
}
