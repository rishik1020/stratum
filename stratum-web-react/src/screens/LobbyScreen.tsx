import { useState, useEffect } from "react"
import { useAppStore } from "../store"
import { sessions } from "../api"
import { Users, Copy, Play, RotateCcw } from "lucide-react"

interface Participant {
  id: number
  user_id: number
  vehicle_id: number
  ready: boolean
  joined_at: string
  username?: string
  display_name?: string
  vehicle_label?: string
}

export const LobbyScreen = ({ onNavigate }: { onNavigate: (screen: string) => void }) => {
  const currentSession = useAppStore((s) => s.currentSession)
  const user = useAppStore((s) => s.user)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!currentSession) return
    const loadParticipants = async () => {
      try {
        const res = await sessions.participants(currentSession.id)
        setParticipants(res.data)
        // If the host has already started, follow everyone into the live screen.
        const detail = await sessions.getById(currentSession.id)
        if (detail.data.status === "live") {
          onNavigate("live")
        }
      } catch (err) {
        setError("Failed to load participants")
      } finally {
        setLoading(false)
      }
    }
    loadParticipants()
    const interval = setInterval(loadParticipants, 2000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSession])

  const handleReady = async () => {
    if (!currentSession) return
    try {
      await sessions.ready(currentSession.id)
      // Re-fetch instead of reloading the page (a reload would wipe in-memory state).
      const res = await sessions.participants(currentSession.id)
      setParticipants(res.data)
    } catch (err) {
      setError("Failed to mark ready")
    }
  }

  const handleStart = async () => {
    if (!currentSession) return
    try {
      await sessions.start(currentSession.id)
      onNavigate("live")
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to start session")
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(currentSession?.room_code || "")
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>
  if (!currentSession) return <div>No session</div>

  return (
    <div className="min-h-screen bg-gradient-stratum bg-stratum-darker">
      <nav className="safe-top border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <h1 className="font-medium text-xl">Lobby</h1>
            <button
              onClick={() => onNavigate("home")}
              className="btn-secondary"
            >
              Leave
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto p-6">
        <div className="mb-8">
          <div className="flex justify-between items-start mb-4">
            <div>
              <span className="eyebrow">Ready to launch</span>
              <h2 className="display text-5xl mt-2">{currentSession.name}</h2>
            </div>
            <div className="text-right">
              <span className="stat-num inline-block bg-white/[0.06] border border-white/10 text-white/80 px-3 py-1 rounded-full text-sm font-medium">
                {participants.length} / {currentSession.max_players}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="card">
              <div className="panel-header">
                <div className="flex items-center gap-2">
                  <Users size={20} />
                  Participants
                </div>
              </div>
              <ul className="space-y-2">
                {participants.length === 0 ? (
                  <li className="text-white/60 text-sm">Waiting for participants...</li>
                ) : (
                  participants.map((p) => (
                    <li key={p.id} className="flex items-center justify-between bg-white/[0.03] border border-white/8 rounded-lg px-4 py-3">
                      <div>
                        <span className="font-medium block">
                          {p.display_name || p.username || `Player ${p.user_id}`}
                          {p.user_id === currentSession.host_user_id && (
                            <span className="ml-2 text-[10px] uppercase tracking-[0.15em] text-stratum-violet">Host</span>
                          )}
                        </span>
                        {p.vehicle_label && <span className="text-xs text-white/50">{p.vehicle_label}</span>}
                      </div>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${p.ready ? "bg-emerald-500/15 text-emerald-300/90" : "bg-white/8 text-white/50"}`}>
                        {p.ready ? "Ready" : "Waiting"}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>

          <div className="space-y-4">
            <div className="card">
              <span className="eyebrow block mb-2">Room Code</span>
              <div className="text-center mb-4">
                <h3 className="stat-num text-3xl font-medium tracking-[0.15em]">{currentSession.room_code}</h3>
              </div>
              <button
                onClick={handleCopy}
                className="btn-secondary w-full text-sm flex items-center justify-center gap-2"
              >
                <Copy size={16} />
                {copied ? "Copied!" : "Copy code"}
              </button>
            </div>

            <div className="card grid grid-cols-2 gap-4">
              <div>
                <span className="eyebrow block">Max</span>
                <strong className="stat-num text-2xl font-medium">{currentSession.max_players}</strong>
              </div>
              <div>
                <span className="eyebrow block">Session</span>
                <strong className="text-lg font-medium capitalize">{currentSession.visibility}</strong>
              </div>
            </div>

            <button
              onClick={handleReady}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              <RotateCcw size={18} />
              I'm Ready
            </button>

            {user?.id === currentSession.host_user_id && (
              <button
                onClick={handleStart}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                <Play size={18} />
                Start Session
              </button>
            )}
          </div>
        </div>

        {error && <p className="text-red-400 mt-4">{error}</p>}
      </div>
    </div>
  )
}
