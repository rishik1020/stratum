/** Shared Recharts styling, so every chart in the app reads as one system. */

/** The brand accent. Use for the single most important series in a chart. */
export const ACCENT = "#FFB020"

/**
 * Per-racer line colours for multi-racer traces, cycled.
 *
 * Amber leads so the current user's trace gets the brand colour; the rest are
 * deliberately spread across the wheel and kept clear of amber so no two lines
 * are confusable on a dark background.
 */
export const RACER_PALETTE = [
  "#FFB020", // amber — you
  "#4DA6FF", // blue
  "#3DD68C", // green
  "#FF5A52", // red
  "#C084FC", // purple
  "#22D3EE", // cyan
  "#F472B6", // pink
]

/**
 * The five Driving Score dimensions, in the order they're always drawn.
 * Overall is amber (it's the headline number); the four sub-scores are
 * neutral hues so they read as supporting detail rather than competing.
 */
export const SCORE_LINES = [
  { key: "overall", color: "#FFB020" },
  { key: "safety", color: "#4DA6FF" },
  { key: "eco", color: "#3DD68C" },
  { key: "comfort", color: "#C084FC" },
  { key: "performance", color: "#22D3EE" },
]

export const tooltipStyle = {
  background: "#15151A",
  border: "1px solid rgba(255,255,255,0.13)",
  borderRadius: 12,
  color: "#fff",
  fontSize: 12,
}

export const axisProps = {
  stroke: "rgba(255,255,255,0.35)",
  tick: { fontSize: 12 },
}

export const gridProps = {
  strokeDasharray: "3 3",
  stroke: "rgba(255,255,255,0.06)",
}
