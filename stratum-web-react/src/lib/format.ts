/** "Rishik Reddy" → "RR". Falls back to "?" for empty names. */
export const initials = (name?: string) =>
  (name || "?")
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()

/** Seconds → "4m 12s", for durations shown as prose. */
export const fmtDuration = (s: number) => {
  const m = Math.floor(s / 60)
  const sec = Math.round(s % 60)
  return `${m}m ${sec}s`
}

/** Seconds → "04:12", for the HUD's running clock. */
export const fmtClock = (s: number) => {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
}

/** Seconds → "1h 20m" / "45m", for totals on the stats dashboard. */
export const fmtHours = (s: number) => {
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}
