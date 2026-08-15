import { useEffect, useRef } from "react"

const AMBER = "255,176,32"

/**
 * A slowly-rotating particle globe with glowing route arcs.
 *
 * Hollow rather than solid: the far-side dots are drawn too, just dimmer, so
 * the sphere reads as a cloud of points you can see through. Self-contained
 * canvas (own rAF), dpr-aware, reduced-motion safe.
 */
export function GlobeCanvas({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext("2d")
    if (!ctx) return

    let w = 1
    let h = 1
    let dpr = Math.min(window.devicePixelRatio || 1, 2)
    let raf = 0
    let t = 0
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    const resize = () => {
      const r = cv.getBoundingClientRect()
      w = Math.max(1, r.width)
      h = Math.max(1, r.height)
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      cv.width = Math.round(w * dpr)
      cv.height = Math.round(h * dpr)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(cv)

    // Even-ish point distribution: sample longitude density by latitude so the
    // poles don't bunch up into a bright cap.
    const pts: { lat: number; lng: number }[] = []
    for (let la = -80; la <= 80; la += 8) {
      const latRad = (la * Math.PI) / 180
      const ring = Math.max(6, Math.round(44 * Math.cos(latRad)))
      for (let i = 0; i < ring; i++) {
        pts.push({ lat: latRad, lng: (i / ring) * Math.PI * 2 })
      }
    }

    // Route arcs as start/end lat-lng pairs.
    const arcs = [
      [40, -3, 35, 139],
      [-23, -46, 1, 103],
      [51, 0, -33, 151],
      [34, -118, 48, 2],
      [25, 55, -1, 36],
    ].map(([a, b, c, d]) => ({
      s: { lat: (a * Math.PI) / 180, lng: (b * Math.PI) / 180 },
      e: { lat: (c * Math.PI) / 180, lng: (d * Math.PI) / 180 },
    }))

    const project = (lat: number, lng: number, rot: number, R: number, cx: number, cy: number) => {
      const x = Math.cos(lat) * Math.sin(lng + rot)
      const y = Math.sin(lat)
      const z = Math.cos(lat) * Math.cos(lng + rot)
      return { sx: cx + x * R, sy: cy - y * R, z }
    }

    const render = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const cx = w / 2
      const cy = h / 2
      const R = (Math.min(w, h) / 2) * 0.76
      const rot = t * 0.18

      // Ambient glow behind the sphere.
      const glow = ctx.createRadialGradient(cx, cy, R * 0.3, cx, cy, R * 1.6)
      glow.addColorStop(0, `rgba(${AMBER},0.16)`)
      glow.addColorStop(0.5, `rgba(${AMBER},0.05)`)
      glow.addColorStop(1, "transparent")
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(cx, cy, R * 1.6, 0, Math.PI * 2)
      ctx.fill()

      // Particle shell. Far-side points are drawn first and faintly, so the
      // globe reads as see-through instead of as a filled ball.
      for (const p of pts) {
        const { sx, sy, z } = project(p.lat, p.lng, rot, R, cx, cy)
        const front = z >= 0
        const depth = (z + 1) / 2
        const alpha = front ? 0.25 + depth * 0.65 : 0.08 + depth * 0.12
        const size = front ? 0.5 + depth * 1.1 : 0.5
        ctx.fillStyle = `rgba(${AMBER},${alpha})`
        ctx.beginPath()
        ctx.arc(sx, sy, size, 0, Math.PI * 2)
        ctx.fill()
      }

      // Horizon ring — a thin bright edge that sells the sphere's silhouette.
      ctx.strokeStyle = `rgba(${AMBER},0.30)`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.stroke()

      // Route arcs with a travelling pulse.
      for (let i = 0; i < arcs.length; i++) {
        const a = arcs[i]
        const s = project(a.s.lat, a.s.lng, rot, R, cx, cy)
        const e = project(a.e.lat, a.e.lng, rot, R, cx, cy)
        if (s.z < -0.2 && e.z < -0.2) continue
        const mx = (s.sx + e.sx) / 2
        const my = (s.sy + e.sy) / 2
        const dx = e.sx - s.sx
        const dy = e.sy - s.sy
        const len = Math.hypot(dx, dy)
        const bulge = len * 0.3
        const nx = -dy / (len || 1)
        const ny = dx / (len || 1)
        const ax = mx + nx * bulge - (mx - cx) * 0.15
        const ay = my + ny * bulge - (my - cy) * 0.15
        const vis = Math.max(0.1, (Math.max(s.z, e.z) + 1) / 2)

        ctx.strokeStyle = `rgba(${AMBER},${vis * 0.55})`
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.moveTo(s.sx, s.sy)
        ctx.quadraticCurveTo(ax, ay, e.sx, e.sy)
        ctx.stroke()

        const u = (t * 0.28 + i * 0.27) % 1
        const px = (1 - u) * (1 - u) * s.sx + 2 * (1 - u) * u * ax + u * u * e.sx
        const py = (1 - u) * (1 - u) * s.sy + 2 * (1 - u) * u * ay + u * u * e.sy
        ctx.fillStyle = `rgba(255,214,140,${vis})`
        ctx.shadowBlur = 10
        ctx.shadowColor = `rgba(${AMBER},0.9)`
        ctx.beginPath()
        ctx.arc(px, py, 2.2, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
      }

      if (!reduce) t += 0.016
    }

    const loop = () => {
      render()
      raf = requestAnimationFrame(loop)
    }

    // Paint one frame synchronously before handing over to rAF. Browsers pause
    // rAF entirely while a tab is hidden, so without this the globe can sit
    // blank until the tab is focused — including on first paint if the first
    // callback is delayed.
    render()
    raf = requestAnimationFrame(loop)

    // Redraw immediately on resize too, rather than waiting for the next frame.
    const onResize = () => {
      resize()
      render()
    }
    window.addEventListener("resize", onResize)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener("resize", onResize)
    }
  }, [])

  return <canvas ref={ref} className={className} />
}
