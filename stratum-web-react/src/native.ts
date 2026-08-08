// Native-shell integration. Everything here is a no-op in a plain browser, so
// the web build behaves exactly as before. On the Capacitor APK it wires up the
// status bar, splash screen, keyboard, and Android hardware back button.
import { Capacitor } from "@capacitor/core"
import { StatusBar, Style } from "@capacitor/status-bar"
import { SplashScreen } from "@capacitor/splash-screen"
import { Keyboard, KeyboardResize } from "@capacitor/keyboard"
import { App } from "@capacitor/app"

export const isNative = Capacitor.isNativePlatform()

/** Configure native chrome once at startup. Safe to call on web (does nothing). */
export async function initNative(): Promise<void> {
  if (!isNative) return
  try {
    // Draw our (dark) UI edge-to-edge behind a transparent status bar; we pad for
    // it with env(safe-area-inset-top) in CSS. Style.Dark = light icons.
    await StatusBar.setOverlaysWebView({ overlay: true })
    await StatusBar.setStyle({ style: Style.Dark })
  } catch {
    /* status bar not available (e.g. some tablets) — ignore */
  }
  try {
    // Resize the whole webview when the keyboard opens so inputs stay visible.
    await Keyboard.setResizeMode({ mode: KeyboardResize.Native })
  } catch {
    /* keyboard plugin unavailable — ignore */
  }
  try {
    await SplashScreen.hide()
  } catch {
    /* no splash — ignore */
  }
}

/**
 * Route the Android hardware back button through the app's own navigation.
 * `onBack` returns true if it handled the press; if it returns false we exit the
 * app (expected Android behaviour on a root screen).
 */
export function registerBackButton(onBack: () => boolean): void {
  if (!isNative) return
  App.addListener("backButton", () => {
    const handled = onBack()
    if (!handled) App.exitApp()
  })
}
