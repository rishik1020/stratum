import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAppStore } from "../store"
import { routes } from "../routes"
import { setAuthToken, auth, errorMessage } from "../api"
import { Mail, Lock, User } from "lucide-react"
import { Logo } from "../landing/ui"
import { AuroraBackground } from "../landing/AuroraBackground"

export const AuthScreen = () => {
  const navigate = useNavigate()
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [username, setUsername] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const setToken = useAppStore((s) => s.setToken)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      if (isLogin) {
        const res = await auth.login(email, password)
        setAuthToken(res.data.access_token)
        setToken(res.data.access_token)
      } else {
        const res = await auth.signup(email, username, displayName, password)
        setAuthToken(res.data.access_token)
        setToken(res.data.access_token)
      }
      navigate(routes.dashboard, { replace: true })
    } catch (err: any) {
      setError(errorMessage(err, "Authentication failed"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative min-h-[100dvh] bg-ink flex items-center justify-center px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)]">
      <AuroraBackground />
      <div className="card relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mb-4 flex justify-center">
            <Logo size={34} />
          </div>
          <p className="text-white/45 text-sm">Real-time sprint driving</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <>
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">Username</label>
                <div className="field">
                  <User size={18} className="text-white/50" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="johndoe"
                    className="bg-transparent flex-1 outline-none text-white placeholder:text-white/40"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">Display Name</label>
                <div className="field">
                  <User size={18} className="text-white/50" />
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="John Doe"
                    className="bg-transparent flex-1 outline-none text-white placeholder:text-white/40"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-medium text-white/50 mb-1.5">Email</label>
            <div className="flex items-center gap-2 bg-ink-2 border border-hairline rounded-xl px-3 py-2">
              <Mail size={18} className="text-white/50" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="bg-transparent flex-1 outline-none text-white placeholder:text-white/40"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-white/50 mb-1.5">Password</label>
            <div className="flex items-center gap-2 bg-ink-2 border border-hairline rounded-xl px-3 py-2">
              <Lock size={18} className="text-white/50" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="bg-transparent flex-1 outline-none text-white placeholder:text-white/40"
              />
            </div>
          </div>

          {error && <p className="text-negative text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full disabled:opacity-50"
          >
            {loading ? "Loading..." : isLogin ? "Sign in" : "Sign up"}
          </button>
        </form>

        <p className="text-center text-white/60 mt-6">
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button
            onClick={() => setIsLogin(!isLogin)}
            className="btn-link"
          >
            {isLogin ? "Sign up" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  )
}
