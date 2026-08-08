import { useState } from "react"
import { useAppStore } from "../store"
import { sessions } from "../api"
import { ArrowLeft } from "lucide-react"

export const CreateSessionScreen = ({ onNavigate }: { onNavigate: (screen: string) => void }) => {
  const [name, setName] = useState("Urban Launch")
  const [maxPlayers, setMaxPlayers] = useState(6)
  const [visibility, setVisibility] = useState("private")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const setCurrentSession = useAppStore((s) => s.setCurrentSession)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")

    try {
      const res = await sessions.create({
        name,
        max_players: maxPlayers,
        visibility,
      })
      setCurrentSession(res.data)
      onNavigate("lobby")
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to create session")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-stratum bg-stratum-darker">
      <nav className="safe-top border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <button
            onClick={() => onNavigate("home")}
            className="flex items-center gap-2 text-white/50 hover:text-white text-sm"
          >
            <ArrowLeft size={18} />
            Back
          </button>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto p-6">
        <div className="mb-8">
          <span className="eyebrow">Create Session</span>
          <h2 className="display text-5xl mt-2">Launch a sprint</h2>
        </div>

        <form onSubmit={handleCreate} className="card space-y-6">
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1.5">Session Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Urban Launch"
              className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-white outline-none focus:border-white/25 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-white/50 mb-1.5">Max Players</label>
            <select
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
              className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-white outline-none focus:border-white/25 transition-colors"
            >
              {[2, 3, 4, 5, 6, 8, 10].map((n) => (
                <option key={n} value={n} className="bg-stratum-darker">
                  {n} players
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-white/50 mb-1.5">Visibility</label>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value)}
              className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-white outline-none focus:border-white/25 transition-colors"
            >
              <option value="private" className="bg-stratum-darker">Private</option>
              <option value="invite" className="bg-stratum-darker">Invite only</option>
            </select>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Sprint Session"}
          </button>
        </form>
      </div>
    </div>
  )
}
