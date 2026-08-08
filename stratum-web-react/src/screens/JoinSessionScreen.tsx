import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAppStore } from "../store"
import { routes } from "../routes"
import { sessions } from "../api"
import { ArrowLeft } from "lucide-react"

export const JoinSessionScreen = () => {
  const navigate = useNavigate()
  const [roomCode, setRoomCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const setCurrentSession = useAppStore((s) => s.setCurrentSession)

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!roomCode.trim()) {
      setError("Enter a room code")
      return
    }

    setLoading(true)
    setError("")

    try {
      await sessions.join(roomCode)
      const sessionRes = await sessions.getByRoom(roomCode)
      setCurrentSession(sessionRes.data)
      navigate(routes.lobby(sessionRes.data.id))
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to join session")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-stratum bg-stratum-darker">
      <nav className="safe-top border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <button
            onClick={() => navigate(routes.dashboard)}
            className="flex items-center gap-2 text-white/50 hover:text-white text-sm"
          >
            <ArrowLeft size={18} />
            Back
          </button>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto p-6">
        <div className="mb-8">
          <span className="eyebrow">Join Session</span>
          <h2 className="display text-5xl mt-2">Enter room code</h2>
        </div>

        <form onSubmit={handleJoin} className="card space-y-6">
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1.5">Room Code</label>
            <input
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="STRAT-7824"
              maxLength={10}
              className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-white/25 transition-colors text-center text-2xl font-mono tracking-[0.2em] placeholder:text-white/25"
            />
          </div>

          <p className="text-white/50 text-sm">
            Ask your crew for the room code, or use an invite link they sent.
          </p>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full disabled:opacity-50"
          >
            {loading ? "Joining..." : "Join Session"}
          </button>
        </form>
      </div>
    </div>
  )
}
