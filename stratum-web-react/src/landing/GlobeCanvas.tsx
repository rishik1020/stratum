import { useEffect, useRef } from "react"

// A slowly-rotating dotted globe with glowing race arcs. Self-contained canvas
// (own rAF), dpr-aware, reduced-motion safe.
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

    const pts: { lat: number; lng: number }[] = []
    for (let la = -78; la <= 78; la += 12) for (let lo = 0; lo < 360; lo += 12) pts.push({ lat: (la * Math.PI) / 180, lng: (lo * Math.PI) / 180 })

    // Race arcs as start/end lat-lng pairs.
    const arcs = [
      [40, -3, 35, 139],
      [-23, -46, 1, 103],
      [51, 0, -33, 151],
      [34, -118, 48, 2],
      [25, 55, -1, 36],
    ].map(([a, b, c, d]) => ({ s: { lat: (a * Math.PI) / 180, lng: (b * Math.PI) / 180 }, e: { lat: (c * Math.PI) / 180, lng: (d * Math.PI) / 180 } }))

    const project = (lat: number, lng: number, rot: number, R: number, cx: number, cy: number) => {
      const x = Math.cos(lat) * Math.sin(lng + rot)
      const y = Math.sin(lat)
      const z = Math.cos(lat) * Math.cos(lng + rot)
      return { sx: cx + x * R, sy: cy - y * R, z }
    }

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const cx = w / 2
      const cy = h / 2
      const R = (Math.min(w, h) / 2) * 0.8
      const rot = t * 0.22

      // Outer glow
      const glow = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.5)
      glow.addColorStop(0, "rgba(139,92,246,0.28)")
      glow.addColorStop(0.55, "rgba(139,92,246,0.07)")
      glow.addColorStop(1, "transparent")
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(cx, cy, R * 1.5, 0, Math.PI * 2)
      ctx.fill()

      // Sphere body
      const body = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.35, R * 0.1, cx, cy, R)
      body.addColorStop(0, "#1b1436")
      body.addColorStop(1, "#0b0915")
      ctx.fillStyle = body
      ctx.beginPath()
      ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = "rgba(163,230,53,0.35)"
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(cx, cy, R, 0, Math.PI * 2)
      ctx.stroke()

      // Surface dots
      for (const p of pts) {
        const { sx, sy, z } = project(p.lat, p.lng, rot, R, cx, cy)
        if (z < -0.1) continue
        const a = (z + 1) / 2
        ctx.fillStyle = `rgba(196,181,253,${a * 0.5})`
        ctx.beginPath()
        ctx.arc(sx, sy, a * 1.3 + 0.3, 0, Math.PI * 2)
        ctx.fill()
      }

      // Race arcs
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
        const dir = my < cy ? 1 : 1
        const ax = mx + nx * bulge * dir - (mx - cx) * 0.15
        const ay = my + ny * bulge * dir - (my - cy) * 0.15
        const vis = Math.max(0.12, (Math.max(s.z, e.z) + 1) / 2)
        ctx.strokeStyle = `rgba(163,230,53,${vis * 0.7})`
        ctx.lineWidth = 1.4
        ctx.shadowBlur = 8
        ctx.shadowColor = "rgba(163,230,53,0.6)"
        ctx.beginPath()
        ctx.moveTo(s.sx, s.sy)
        ctx.quadraticCurveTo(ax, ay, e.sx, e.sy)
        ctx.stroke()
        ctx.shadowBlur = 0
        // moving pulse
        const prog = (t * 0.3 + i * 0.27) % 1
        const u = prog
        const px = (1 - u) * (1 - u) * s.sx + 2 * (1 - u) * u * ax + u * u * e.sx
        const py = (1 - u) * (1 - u) * s.sy + 2 * (1 - u) * u * ay + u * u * e.sy
        ctx.fillStyle = "#c6f24e"
        ctx.shadowBlur = 10
        ctx.shadowColor = "#c6f24e"
        ctx.beginPath()
        ctx.arc(px, py, 2.4, 0, Math.PI * 2)
        ctx.fill()
        ctx.shadowBlur = 0
      }

      if (!reduce) t += 0.016
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return <canvas ref={ref} className={className} />
}
