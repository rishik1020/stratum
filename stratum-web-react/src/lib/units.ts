import { useAppStore } from "../store"

const MI_PER_KM = 0.621371

/**
 * Speed/distance conversion bound to the user's unit preference.
 *
 * Every screen that shows a number needs the same four helpers; this keeps the
 * conversion factor in one place instead of scattering 0.621371 across the app.
 */
export function useUnits() {
  const units = useAppStore((s) => s.units)
  const mph = units === "mph"

  return {
    mph,
    speedUnit: mph ? "mph" : "km/h",
    distUnit: mph ? "mi" : "km",
    /** km/h → the display unit, rounded. */
    toSpeed: (kmh: number) => Math.round(mph ? kmh * MI_PER_KM : kmh),
    /** metres → km or miles, to `decimals` places. */
    toDist: (m: number, decimals = 2) =>
      +((m / 1000) * (mph ? MI_PER_KM : 1)).toFixed(decimals),
  }
}
