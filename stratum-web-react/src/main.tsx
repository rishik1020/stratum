import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import { initNative } from "./native"
import "./index.css"

// Configure native status bar / splash / keyboard on the APK (no-op on web).
initNative()

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
