import { useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { sessions } from "../api"
import { useAppStore } from "../store"

/**
 * The session named by the `:sessionId` in the URL.
 *
 * The URL is the identity — the store is just a cache. That's what makes a deep
 * link work: landing on /sessions/12/results cold (a refresh, a shared link, or
 * the APK cold-starting) fetches session 12 instead of showing whatever session
 * happened to be left in localStorage.
 */
export function useRouteSession() {
  const { sessionId } = useParams()
  const id = Number(sessionId)
  const current = useAppStore((s) => s.currentSession)
  const setCurrentSession = useAppStore((s) => s.setCurrentSession)
  const [error, setError] = useState("")

  const session = current && current.id === id ? current : null

  useEffect(() => {
    if (!Number.isFinite(id) || id <= 0) {
      setError("That session link doesn't look right.")
      return
    }
    if (session) return
    let cancelled = false
    sessions
      .getById(id)
      .then((res) => !cancelled && setCurrentSession(res.data))
      .catch(() => !cancelled && setError("Couldn't load that session."))
    return () => {
      cancelled = true
    }
  }, [id, session, setCurrentSession])

  return { id, session, error, loading: !session && !error }
}
