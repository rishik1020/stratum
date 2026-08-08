/** Shared Recharts styling, so every chart in the app reads as one system. */

export const VIOLET = "#8b5cf6"
export const LIME = "#a3e635"

/** Per-racer line colours for multi-racer traces, cycled. */
export const RACER_PALETTE = [
  "#8b5cf6",
  "#a3e635",
  "#d946ef",
  "#c084fc",
  "#bef264",
  "#a78bfa",
  "#84cc16",
]

/** The five Driving Score dimensions, in the order they're always drawn. */
export const SCORE_LINES = [
  { key: "overall", color: "#8b5cf6" },
  { key: "safety", color: "#a3e635" },
  { key: "eco", color: "#34d399" },
  { key: "comfort", color: "#c084fc" },
  { key: "performance", color: "#d946ef" },
]

export const tooltipStyle = {
  background: "#14121f",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 12,
  color: "#fff",
  fontSize: 12,
}

export const axisProps = {
  stroke: "rgba(255,255,255,0.4)",
  tick: { fontSize: 12 },
}

export const gridProps = {
  strokeDasharray: "3 3",
  stroke: "rgba(255,255,255,0.08)",
}
