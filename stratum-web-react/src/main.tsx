import React from "react"
import ReactDOM from "react-dom/client"
import { useEffect, useRef, useState } from "react"
import { useAppStore } from "./store"
import { user as userApi, vehicles as vehiclesApi } from "./api"
import { Layout } from "./components/Layout"
import { AuthScreen } from "./screens/AuthScreen"
import { HomeScreen } from "./screens/HomeScreen"
import { GarageScreen } from "./screens/GarageScreen"
import { AnalyticsScreen } from "./screens/AnalyticsScreen"
import { SettingsScreen } from "./screens/SettingsScreen"
import { CreateSessionScreen } from "./screens/CreateSessionScreen"
import { JoinSessionScreen } from "./screens/JoinSessionScreen"
import { LobbyScreen } from "./screens/LobbyScreen"
import { LiveScreen } from "./screens/LiveScreen"
import { ResultsScreen } from "./screens/ResultsScreen"
import { ReplayScreen } from "./screens/ReplayScreen"
import { LandingPage } from "./landing/LandingPage"
import { initNative, registerBackButton } from "./native"
import "./index.css"

// Configure native status bar / splash / keyboard on the APK (no-op on web).
initNative()

// Hub screens get the persistent sidebar; the session flow runs full-screen.
const HUB_SCREENS = new Set(["home", "garage", "analytics", "settings"])

function App() {
  const token = useAppStore((s) => s.token)
  const setUser = useAppStore((s) => s.setUser)
  const [currentScreen, setCurrentScreen] = useState<string>(token ? "home" : "auth")
  const [showAuth, setShowAuth] = useState(false)

  const navigateTo = (screen: string) => setCurrentScreen(screen)

  // Bootstrap profile + vehicles once when authenticated, so the sidebar and
  // every hub screen have user/vehicle data available immediately.
  useEffect(() => {
    if (!token) return
    userApi.getProfile().then((res) => setUser(res.data)).catch(() => {})
    vehiclesApi.list().then((res) => useAppStore.getState().setVehicles(res.data)).catch(() => {})
  }, [token, setUser])

  // Android hardware back button → in-app navigation (registered once; reads the
  // latest state via refs). Returning false lets the app exit on a root screen.
  const screenRef = useRef(currentScreen)
  const showAuthRef = useRef(showAuth)
  useEffect(() => {
    screenRef.current = currentScreen
    showAuthRef.current = showAuth
  }, [currentScreen, showAuth])
  useEffect(() => {
    registerBackButton(() => {
      if (!useAppStore.getState().token) {
        if (showAuthRef.current) {
          setShowAuth(false) // Auth → back to landing
          return true
        }
        return false // Landing is the root → exit
      }
      if (screenRef.current === "home") return false // Dashboard is the root → exit
      setCurrentScreen("home") // any other screen → back to Dashboard
      return true
    })
  }, [])

  if (!token) {
    return showAuth ? (
      <AuthScreen onSuccess={() => navigateTo("home")} />
    ) : (
      <LandingPage onEnter={() => setShowAuth(true)} />
    )
  }

  const screen = (() => {
    switch (currentScreen) {
      case "home":
        return <HomeScreen onNavigate={navigateTo} />
      case "garage":
        return <GarageScreen />
      case "analytics":
        return <AnalyticsScreen onNavigate={navigateTo} />
      case "settings":
        return <SettingsScreen />
      case "createSession":
        return <CreateSessionScreen onNavigate={navigateTo} />
      case "joinSession":
        return <JoinSessionScreen onNavigate={navigateTo} />
      case "lobby":
        return <LobbyScreen onNavigate={navigateTo} />
      case "live":
        return <LiveScreen onNavigate={navigateTo} />
      case "results":
        return <ResultsScreen onNavigate={navigateTo} />
      case "replay":
        return <ReplayScreen onNavigate={navigateTo} />
      default:
        return <HomeScreen onNavigate={navigateTo} />
    }
  })()

  if (HUB_SCREENS.has(currentScreen)) {
    return (
      <Layout current={currentScreen} onNavigate={navigateTo}>
        <div key={currentScreen} className="fade-in">
          {screen}
        </div>
      </Layout>
    )
  }

  return (
    <div key={currentScreen} className="fade-in">
      {screen}
    </div>
  )
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
