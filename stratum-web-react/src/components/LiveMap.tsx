import { useEffect, useRef } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { initials } from "../lib/format"

export interface MapPosition {
  lat: number
  lng: number
}

export interface AvatarInfo {
  url?: string | null
  label: string
}

interface Tracked {
  marker: L.Marker
  cur: MapPosition
  target: MapPosition
}

const AMBER = "#FFB020"
const TRAIL_DIM = "rgba(255,255,255,0.22)"

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string))

// Only allow safe image sources (our base64 data URLs or http(s)); blocks
// javascript:/attribute-breakout in the injected divIcon HTML.
const safeImageUrl = (u?: string | null) =>
  u && /^(data:image\/(png|jpe?g|webp);base64,|https?:\/\/)/i.test(u) ? u : ""

/** Circular avatar pin, optionally with a small stat badge hanging below it. */
const pinIcon = (
  name: string,
  info: AvatarInfo | undefined,
  isMe: boolean,
  isSelected: boolean,
  badge?: string
) => {
  const label = info?.label || name
  const url = safeImageUrl(info?.url)
  const inner = url
    ? `<img src="${escapeHtml(url)}" alt="" />`
    : `<span>${escapeHtml(initials(label))}</span>`
  const badgeHtml = badge
    ? `<div class="stratum-pin-badge">${escapeHtml(badge)}</div>`
    : ""
  return L.divIcon({
    className: "",
    html: `<div class="stratum-pin-wrap">
             <div class="stratum-pin ${isMe ? "me" : ""} ${isSelected ? "selected" : ""}">${inner}</div>
             ${badgeHtml}
           </div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  })
}

/**
 * Live participant map. Each racer is a circular avatar pin — amber ring for
 * you, neutral for everyone else — on a dark CARTO basemap, with an optional
 * badge under the pin (speed while racing).
 *
 * Pins glide between updates (eased every frame) so they don't snap on each
 * ~1 Hz GPS fix, and the map aggressively recomputes its size so it renders on
 * mobile/WebView instead of showing a grey box.
 *
 * Pass `trails` to draw each racer's breadcrumb. The selected racer's trail is
 * drawn in amber and animates on as it's picked; everyone else's stays dim so
 * one line reads clearly against the rest.
 */
export const LiveMap = ({
  positions,
  meName,
  avatars,
  trails,
  badges,
  selected,
  onSelect,
  showControls = true,
  followSelected = false,
}: {
  positions: Record<string, MapPosition>
  meName?: string
  avatars?: Record<string, AvatarInfo>
  trails?: Record<string, MapPosition[]>
  badges?: Record<string, string>
  selected?: string
  onSelect?: (name: string) => void
  showControls?: boolean
  followSelected?: boolean
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const tracksRef = useRef<Record<string, Tracked>>({})
  const linesRef = useRef<Record<string, L.Polyline>>({})
  const rafRef = useRef<number>(0)
  const onSelectRef = useRef(onSelect)
  // Which racer we last ran the draw-on animation for, so a live trail update
  // doesn't restart the animation on every incoming GPS fix.
  const animatedForRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  // Initialise the map once.
  useEffect(() => {
    const el = containerRef.current
    if (!el || mapRef.current) return
    const map = L.map(el, {
      zoomControl: showControls,
      attributionControl: true,
      center: [20, 0],
      zoom: 2,
    })
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; OpenStreetMap &copy; CARTO",
      maxZoom: 19,
    }).addTo(map)
    mapRef.current = map

    // Mobile/WebView lay the container out after init → recompute size now, on a
    // couple of delays, on resize/orientation, and whenever the box resizes.
    const fixSize = () => map.invalidateSize()
    fixSize()
    const t1 = window.setTimeout(fixSize, 200)
    const t2 = window.setTimeout(fixSize, 600)
    const ro = new ResizeObserver(fixSize)
    ro.observe(el)
    window.addEventListener("orientationchange", fixSize)
    window.addEventListener("resize", fixSize)

    // Per-frame easing of each pin toward its latest target position.
    const animate = () => {
      for (const t of Object.values(tracksRef.current)) {
        const dLat = t.target.lat - t.cur.lat
        const dLng = t.target.lng - t.cur.lng
        if (Math.abs(dLat) > 1e-7 || Math.abs(dLng) > 1e-7) {
          t.cur = { lat: t.cur.lat + dLat * 0.18, lng: t.cur.lng + dLng * 0.18 }
          t.marker.setLatLng([t.cur.lat, t.cur.lng])
        }
      }
      rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)

    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      ro.disconnect()
      window.removeEventListener("orientationchange", fixSize)
      window.removeEventListener("resize", fixSize)
      cancelAnimationFrame(rafRef.current)
      map.remove()
      mapRef.current = null
      tracksRef.current = {}
      linesRef.current = {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- Trails -----------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    for (const name of Object.keys(linesRef.current)) {
      if (!trails?.[name]) {
        linesRef.current[name].remove()
        delete linesRef.current[name]
      }
    }
    if (!trails) return

    for (const [name, path] of Object.entries(trails)) {
      const latlngs = path
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
        .map((p) => [p.lat, p.lng] as [number, number])
      if (latlngs.length < 2) continue

      const isSel = name === selected
      const style: L.PathOptions = {
        color: isSel ? AMBER : TRAIL_DIM,
        weight: isSel ? 4 : 2,
        opacity: isSel ? 1 : 0.5,
        lineCap: "round",
        lineJoin: "round",
      }

      let line = linesRef.current[name]
      if (!line) {
        line = L.polyline(latlngs, style).addTo(map)
        linesRef.current[name] = line
      } else {
        line.setLatLngs(latlngs)
        line.setStyle(style)
      }
      // Selected trail sits above the rest.
      if (isSel) line.bringToFront()
    }
  }, [trails, selected])

  // Draw-on animation, run only when the selection actually changes — not on
  // every telemetry tick, which would restart it a few times a second.
  useEffect(() => {
    if (animatedForRef.current === selected) return
    animatedForRef.current = selected
    if (!selected) return
    const line = linesRef.current[selected]
    const path = line?.getElement() as SVGPathElement | null
    if (!path || typeof path.getTotalLength !== "function") return

    const len = path.getTotalLength()
    if (!len) return
    path.style.transition = "none"
    path.style.strokeDasharray = `${len}`
    path.style.strokeDashoffset = `${len}`
    // Force a reflow so the browser doesn't collapse the two style writes.
    void path.getBoundingClientRect()
    path.style.transition = "stroke-dashoffset 900ms cubic-bezier(0.16,1,0.3,1)"
    path.style.strokeDashoffset = "0"
  }, [selected, trails])

  // --- Pins -------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const entries = Object.entries(positions).filter(
      ([, p]) => Number.isFinite(p.lat) && Number.isFinite(p.lng)
    )

    for (const name of Object.keys(tracksRef.current)) {
      if (!positions[name]) {
        tracksRef.current[name].marker.remove()
        delete tracksRef.current[name]
      }
    }

    for (const [name, p] of entries) {
      const isMe = name === meName
      const info = avatars?.[name]
      const icon = pinIcon(name, info, isMe, name === selected, badges?.[name])
      const tracked = tracksRef.current[name]
      if (!tracked) {
        const marker = L.marker([p.lat, p.lng], { icon }).addTo(map)
        marker.on("click", () => onSelectRef.current?.(name))
        tracksRef.current[name] = { marker, cur: { ...p }, target: { ...p } }
      } else {
        tracked.target = { lat: p.lat, lng: p.lng }
        tracked.marker.setIcon(icon)
      }
    }

    if (!entries.length) return

    // Following a selected racer keeps them centred; otherwise fit everyone.
    if (followSelected && selected && positions[selected]) {
      const p = positions[selected]
      map.setView([p.lat, p.lng], Math.max(map.getZoom(), 15), { animate: true })
      return
    }

    const bounds = L.latLngBounds(entries.map(([, p]) => [p.lat, p.lng] as [number, number]))
    if (map.getZoom() < 4) {
      if (entries.length === 1) {
        map.setView(bounds.getCenter(), 16)
      } else {
        map.fitBounds(bounds, { padding: [50, 50] })
      }
    } else if (!map.getBounds().contains(bounds)) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 })
    }
  }, [positions, meName, avatars, badges, selected, followSelected])

  return <div ref={containerRef} className="w-full h-full" />
}
