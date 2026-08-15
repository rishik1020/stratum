/** Replay playback maths, shared by the post-drive screen. */

export interface SeriesPoint {
  username: string
  elapsed_s: number
  speed_kmh: number
  cumulative_distance_m?: number | null
  latitude?: number | null
  longitude?: number | null
  altitude_m?: number | null
  heading_deg?: number | null
  g_force?: number | null
}

const lerp = (a: number, b: number, f: number) => a + (b - a) * f

/** Shortest-path angular interpolation, result in [0,360). */
const lerpAngle = (a: number, b: number, f: number) => {
  const d = ((b - a + 540) % 360) - 180
  return (a + d * f + 360) % 360
}

/**
 * Sample a racer's stream at time `t` (seconds), interpolating between the two
 * bracketing fixes so playback is smooth despite the ~1 Hz capture cadence.
 */
export function sampleAt(points: SeriesPoint[], t: number): SeriesPoint | null {
  if (!points.length) return null
  if (t <= points[0].elapsed_s) return points[0]
  const last = points[points.length - 1]
  if (t >= last.elapsed_s) return last
  let i = 0
  while (i < points.length - 1 && points[i + 1].elapsed_s < t) i++
  const a = points[i]
  const b = points[i + 1]
  const span = b.elapsed_s - a.elapsed_s
  const f = span > 0 ? (t - a.elapsed_s) / span : 0
  const lerpN = (x?: number | null, y?: number | null) =>
    x != null && y != null ? lerp(x, y, f) : x ?? y ?? null
  return {
    username: a.username,
    elapsed_s: t,
    speed_kmh: lerp(a.speed_kmh, b.speed_kmh, f),
    cumulative_distance_m: lerpN(a.cumulative_distance_m, b.cumulative_distance_m),
    latitude: lerpN(a.latitude, b.latitude),
    longitude: lerpN(a.longitude, b.longitude),
    altitude_m: lerpN(a.altitude_m, b.altitude_m),
    heading_deg:
      a.heading_deg != null && b.heading_deg != null
        ? lerpAngle(a.heading_deg, b.heading_deg, f)
        : b.heading_deg ?? a.heading_deg ?? null,
    g_force: lerpN(a.g_force, b.g_force),
  }
}

/** Group a flat telemetry series into one time-ordered stream per racer. */
export function groupByRacer(points: SeriesPoint[]): Record<string, SeriesPoint[]> {
  const grouped: Record<string, SeriesPoint[]> = {}
  for (const p of points) (grouped[p.username] ??= []).push(p)
  for (const k in grouped) grouped[k].sort((a, b) => a.elapsed_s - b.elapsed_s)
  return grouped
}

/**
 * The portion of each racer's route driven up to `playhead`.
 *
 * This is what makes the route draw itself: as the playhead advances the
 * polyline grows behind each car, so "watch the replay" and "watch the route
 * appear" are the same gesture rather than two separate animations.
 */
export function trailsUpTo(
  byRacer: Record<string, SeriesPoint[]>,
  playhead: number
): Record<string, { lat: number; lng: number }[]> {
  const out: Record<string, { lat: number; lng: number }[]> = {}
  for (const [name, pts] of Object.entries(byRacer)) {
    const path: { lat: number; lng: number }[] = []
    for (const p of pts) {
      if (p.elapsed_s > playhead) break
      if (p.latitude != null && p.longitude != null) path.push({ lat: p.latitude, lng: p.longitude })
    }
    // Pin the head of the line to the interpolated position, so the trail ends
    // exactly at the car rather than at the last whole-second fix behind it.
    const head = sampleAt(pts, playhead)
    if (head?.latitude != null && head?.longitude != null) {
      path.push({ lat: head.latitude, lng: head.longitude })
    }
    if (path.length) out[name] = path
  }
  return out
}

/** Standings at a given playhead, ranked by distance covered. */
export function standingsAt(byRacer: Record<string, SeriesPoint[]>, playhead: number) {
  const rows = Object.keys(byRacer).map((name) => {
    const s = sampleAt(byRacer[name], playhead)
    return {
      user: name,
      speed: Math.round(s?.speed_kmh ?? 0),
      distance: Math.round(s?.cumulative_distance_m ?? 0),
    }
  })
  rows.sort((a, b) => b.distance - a.distance)
  const leader = rows[0]?.distance ?? 0
  return rows.map((r, i) => ({
    ...r,
    position: i + 1,
    gapToLeaderM: Math.max(0, Math.round(leader - r.distance)),
    intervalM: i === 0 ? 0 : Math.max(0, Math.round(rows[i - 1].distance - r.distance)),
  }))
}
