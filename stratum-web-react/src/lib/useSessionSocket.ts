import { useCallback, useEffect, useRef, useState } from "react"
import { sessionSocketUrl } from "../api"
import { useAppStore } from "../store"

export interface SessionEvent {
  event: string
  payload: any
}

/** Frames worth keeping when the socket is down. Everything else is a
 *  now-or-never signal — a "ready" or a chat line delivered ten minutes late is
 *  noise, but a lost GPS fix is a hole in someone's drive.
 *
 *  This is not only about lost connectivity. Android throttles network started
 *  from a WebView after ~5 minutes in the background, so on a long drive with
 *  the screen off the socket stalls even on perfect signal, while the native
 *  location service keeps producing fixes. They queue here and go up on return
 *  to the foreground. */
const DURABLE_EVENTS = new Set(["telemetry.update"])

/** ~50 minutes of 1 Hz fixes. Past this the oldest are dropped, because an
 *  unbounded buffer on a phone is how you get killed by the OS. */
const MAX_QUEUE = 3000

const RECONNECT_MIN_MS = 1000
const RECONNECT_MAX_MS = 15000

/**
 * The session's live WebSocket, with reconnection and a replay buffer.
 *
 * One connection per session, shared by the lobby and the live screen. The
 * server pushes roster changes and start/end, so neither screen needs to poll.
 *
 * Mobile sockets die constantly — screen off, cell handover, tunnel, backgrounded
 * app. The previous version had no reconnect at all and `send` silently dropped
 * anything that arrived while closed, so a drive that lost its socket stopped
 * recording permanently and never said so. Now:
 *
 *   - closes are retried with exponential backoff, and immediately on regaining
 *     network or returning to the foreground;
 *   - telemetry sent while down is queued and replayed in order on reconnect;
 *   - each fix carries its own `recorded_at`, so replayed points land at the
 *     time they happened rather than the time they arrived.
 *
 * `onEvent` is held in a ref, so passing a fresh closure each render doesn't
 * tear down the connection.
 */
export function useSessionSocket(
  sessionId: number | null | undefined,
  onEvent: (event: SessionEvent) => void
) {
  const token = useAppStore((s) => s.token)
  const [connected, setConnected] = useState(false)
  const [queuedCount, setQueuedCount] = useState(0)

  const socketRef = useRef<WebSocket | null>(null)
  const handlerRef = useRef(onEvent)
  const queueRef = useRef<SessionEvent[]>([])
  const attemptRef = useRef(0)
  const retryTimerRef = useRef<number | null>(null)
  // Set during teardown so a deliberate close doesn't trigger a reconnect.
  const closedRef = useRef(false)
  const droppedRef = useRef(0)

  useEffect(() => {
    handlerRef.current = onEvent
  }, [onEvent])

  const flush = useCallback((socket: WebSocket) => {
    const queue = queueRef.current
    if (!queue.length) return
    // Replayed in the order recorded. A partial failure mid-flush leaves the
    // rest queued rather than dropping it.
    while (queue.length) {
      if (socket.readyState !== WebSocket.OPEN) break
      socket.send(JSON.stringify(queue[0]))
      queue.shift()
    }
    setQueuedCount(queue.length)
  }, [])

  useEffect(() => {
    if (!sessionId || !token) return
    closedRef.current = false

    const clearRetry = () => {
      if (retryTimerRef.current != null) {
        window.clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }
    }

    const connect = () => {
      if (closedRef.current) return
      const socket = new WebSocket(sessionSocketUrl(sessionId, token))
      socketRef.current = socket

      socket.onopen = () => {
        attemptRef.current = 0
        setConnected(true)
        flush(socket)
      }
      socket.onmessage = (evt) => {
        try {
          handlerRef.current(JSON.parse(evt.data))
        } catch {
          /* ignore malformed frames */
        }
      }
      socket.onerror = () => setConnected(false)
      socket.onclose = () => {
        setConnected(false)
        if (closedRef.current) return
        // Full jitter, so a backend restart doesn't bring every racer back in
        // the same millisecond.
        const base = Math.min(RECONNECT_MAX_MS, RECONNECT_MIN_MS * 2 ** attemptRef.current)
        attemptRef.current += 1
        clearRetry()
        retryTimerRef.current = window.setTimeout(connect, base * (0.5 + Math.random() * 0.5))
      }
    }

    const reconnectNow = () => {
      if (closedRef.current) return
      if (socketRef.current?.readyState === WebSocket.OPEN) return
      attemptRef.current = 0
      clearRetry()
      connect()
    }

    // Coming back online or returning to the foreground are the two moments a
    // reconnect is most likely to succeed — don't sit out the backoff for them.
    const onVisible = () => {
      if (document.visibilityState === "visible") reconnectNow()
    }
    window.addEventListener("online", reconnectNow)
    document.addEventListener("visibilitychange", onVisible)

    connect()

    return () => {
      closedRef.current = true
      clearRetry()
      window.removeEventListener("online", reconnectNow)
      document.removeEventListener("visibilitychange", onVisible)
      socketRef.current?.close()
      socketRef.current = null
      setConnected(false)
    }
  }, [sessionId, token, flush])

  const send = useCallback((message: SessionEvent) => {
    const socket = socketRef.current
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message))
      return
    }
    if (!DURABLE_EVENTS.has(message.event)) return
    const queue = queueRef.current
    queue.push(message)
    if (queue.length > MAX_QUEUE) {
      droppedRef.current += queue.length - MAX_QUEUE
      queue.splice(0, queue.length - MAX_QUEUE)
    }
    setQueuedCount(queue.length)
  }, [])

  return {
    connected,
    send,
    /** Fixes recorded but not yet delivered — the UI shows this so a driver
     *  isn't told "no signal" while their drive is in fact still being kept. */
    queuedCount,
    droppedCount: droppedRef.current,
  }
}
