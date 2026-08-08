import { useCallback, useEffect, useRef, useState } from "react"
import { sessionSocketUrl } from "../api"
import { useAppStore } from "../store"

export interface SessionEvent {
  event: string
  payload: any
}

/**
 * The session's live WebSocket.
 *
 * One connection per session, shared by the lobby and the live screen. The
 * server pushes roster changes and start/end, so neither screen needs to poll
 * an endpoint on a timer over a socket that was already open.
 *
 * `onEvent` is held in a ref, so passing a fresh closure each render doesn't
 * tear down and re-open the connection.
 */
export function useSessionSocket(
  sessionId: number | null | undefined,
  onEvent: (event: SessionEvent) => void
) {
  const token = useAppStore((s) => s.token)
  const [connected, setConnected] = useState(false)
  const socketRef = useRef<WebSocket | null>(null)
  const handlerRef = useRef(onEvent)

  useEffect(() => {
    handlerRef.current = onEvent
  }, [onEvent])

  useEffect(() => {
    if (!sessionId || !token) return

    const socket = new WebSocket(sessionSocketUrl(sessionId, token))
    socketRef.current = socket

    socket.onopen = () => setConnected(true)
    socket.onclose = () => setConnected(false)
    socket.onerror = () => setConnected(false)
    socket.onmessage = (evt) => {
      try {
        handlerRef.current(JSON.parse(evt.data))
      } catch {
        /* ignore malformed frames */
      }
    }

    return () => {
      socket.close()
      socketRef.current = null
      setConnected(false)
    }
  }, [sessionId, token])

  const send = useCallback((message: SessionEvent) => {
    const socket = socketRef.current
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
  }, [])

  return { connected, send }
}
