import { lazy, Suspense, useEffect } from "react"
import {
  HashRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom"

import { user as userApi, vehicles as vehiclesApi } from "./api"
import { Layout } from "./components/Layout"
import { registerBackButton } from "./native"
import { routes } from "./routes"
import { useAppStore } from "./store"

import { AuthScreen } from "./screens/AuthScreen"
import { HomeScreen } from "./screens/HomeScreen"

// Split the heavy leaves out of the initial bundle. The landing page alone
// pulls in framer-motion, lenis and the globe canvas, and the analytics screens
// pull in Recharts — none of which a driver opening the live map needs. This
// matters on the target device: a phone on mobile data.
const LandingPage = lazy(() => import("./landing/LandingPage").then((m) => ({ default: m.LandingPage })))
const GarageScreen = lazy(() => import("./screens/GarageScreen").then((m) => ({ default: m.GarageScreen })))
const AnalyticsScreen = lazy(() => import("./screens/AnalyticsScreen").then((m) => ({ default: m.AnalyticsScreen })))
const SettingsScreen = lazy(() => import("./screens/SettingsScreen").then((m) => ({ default: m.SettingsScreen })))
const CreateSessionScreen = lazy(() => import("./screens/CreateSessionScreen").then((m) => ({ default: m.CreateSessionScreen })))
const JoinSessionScreen = lazy(() => import("./screens/JoinSessionScreen").then((m) => ({ default: m.JoinSessionScreen })))
const LobbyScreen = lazy(() => import("./screens/LobbyScreen").then((m) => ({ default: m.LobbyScreen })))
const LiveScreen = lazy(() => import("./screens/LiveScreen").then((m) => ({ default: m.LiveScreen })))
const PostDriveScreen = lazy(() => import("./screens/PostDriveScreen").then((m) => ({ default: m.PostDriveScreen })))

const Loading = () => (
  <div className="flex items-center justify-center h-[100dvh] text-white/50">Loading…</div>
)

/** Sends signed-out visitors to the landing page, preserving where they wanted to go. */
function RequireAuth() {
  const token = useAppStore((s) => s.token)
  const location = useLocation()
  if (!token) return <Navigate to={routes.landing} replace state={{ from: location }} />
  return <Outlet />
}

/** The four hub screens share the sidebar / bottom tab bar; session screens don't. */
function HubLayout() {
  return (
    <Layout>
      <div className="fade-in">
        <Outlet />
      </div>
    </Layout>
  )
}

/** Routes only a signed-out visitor should see — signing in bounces to the app. */
function RequireAnon() {
  const token = useAppStore((s) => s.token)
  if (token) return <Navigate to={routes.dashboard} replace />
  return <Outlet />
}

function AppRoutes() {
  const token = useAppStore((s) => s.token)
  const setUser = useAppStore((s) => s.setUser)
  const setVehicles = useAppStore((s) => s.setVehicles)
  const navigate = useNavigate()

  // Bootstrap profile + vehicles once when authenticated, so the sidebar and
  // every hub screen have user/vehicle data available immediately.
  useEffect(() => {
    if (!token) return
    userApi.getProfile().then((res) => setUser(res.data)).catch(() => {})
    vehiclesApi.list().then((res) => setVehicles(res.data)).catch(() => {})
  }, [token, setUser, setVehicles])

  // Android hardware back button → router history. Returning false lets the app
  // exit, which is the expected behaviour on a root screen.
  useEffect(() => {
    registerBackButton(() => {
      const path = window.location.hash.replace(/^#/, "") || "/"
      const isRoot = path === routes.landing || path === routes.dashboard
      if (isRoot) return false
      navigate(-1)
      return true
    })
  }, [navigate])

  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route element={<RequireAnon />}>
          <Route path={routes.landing} element={<LandingPage />} />
          <Route path={routes.signin} element={<AuthScreen />} />
        </Route>

        <Route element={<RequireAuth />}>
          <Route element={<HubLayout />}>
            <Route path={routes.dashboard} element={<HomeScreen />} />
            <Route path={routes.garage} element={<GarageScreen />} />
            <Route path={routes.analytics} element={<AnalyticsScreen />} />
            <Route path={routes.settings} element={<SettingsScreen />} />
          </Route>

          <Route path={routes.createSession} element={<CreateSessionScreen />} />
          <Route path={routes.joinSession} element={<JoinSessionScreen />} />
          <Route path="/sessions/:sessionId/lobby" element={<LobbyScreen />} />
          <Route path="/sessions/:sessionId/live" element={<LiveScreen />} />
          {/* Results and replay are one screen — the drive ended, here's what
              happened. /replay is kept so older shared links still resolve. */}
          <Route path="/sessions/:sessionId/results" element={<PostDriveScreen />} />
          <Route path="/sessions/:sessionId/replay" element={<PostDriveScreen />} />
        </Route>

        <Route path="*" element={<Navigate to={routes.landing} replace />} />
      </Routes>
    </Suspense>
  )
}

export default function App() {
  // HashRouter, not BrowserRouter: the same build is served by the Vite dev
  // server, a static host, and the Capacitor WebView inside the APK. Hash routes
  // need no server-side rewrite in any of them, so a refresh or a cold app start
  // on a deep link can't 404.
  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  )
}
