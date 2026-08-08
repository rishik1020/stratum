import { useEffect, useRef } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

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

const initials = (name: string) =>
  (name || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string))

// Only allow safe image sources (our base64 data URLs or http(s)); blocks
// javascript:/attribute-breakout in the injected divIcon HTML.
const safeImageUrl = (u?: string | null) =>
  u && /^(data:image\/(png|jpe?g|webp);base64,|https?:\/\/)/i.test(u) ? u : ""

const pinIcon = (name: string, info: AvatarInfo | undefined, isMe: boolean) => {
  const label = info?.label || name
  const url = safeImageUrl(info?.url)
  const inner = url
    ? `<img src="${escapeHtml(url)}" alt="" />`
    : `<span>${escapeHtml(initials(label))}</span>`
  return L.divIcon({
    className: "",
    html: `<div class="stratum-pin ${isMe ? "me" : ""}">${inner}</div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  })
}

/**
 * Live participant map. Each racer is a circular avatar pin (their photo, or
 * initials) with a coloured ring — gold for the current user, steel for others —
 * on a dark CARTO basemap.
 *
 * Pins glide between updates (eased every frame) so they don't snap on each
 * ~1 Hz GPS fix, and the map aggressively recomputes its size so it renders on
 * mobile/WebView instead of showing a grey box.
 */
export const LiveMap = ({
  positions,
  meName,
  avatars,
  showControls = true,
}: {
  positions: Record<string, MapPosition>
  meName?: string
  avatars?: Record<string, AvatarInfo>
  showControls?: boolean
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<L.Map | null>(null)
  const tracksRef = useRef<Record<string, Tracked>>({})
  const rafRef = useRef<number>(0)

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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sync pin targets + icons to the latest positions/avatars.
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
      const tracked = tracksRef.current[name]
      if (!tracked) {
        const marker = L.marker([p.lat, p.lng], { icon: pinIcon(name, info, isMe) }).addTo(map)
        marker.bindTooltip(info?.label || name, {
          permanent: true,
          direction: "top",
          offset: [0, -22],
          className: "stratum-map-label",
        })
        tracksRef.current[name] = { marker, cur: { ...p }, target: { ...p } }
      } else {
        tracked.target = { lat: p.lat, lng: p.lng }
        tracked.marker.setIcon(pinIcon(name, info, isMe))
      }
    }

    if (!entries.length) return
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
  }, [positions, meName, avatars])

  return <div ref={containerRef} className="w-full h-full rounded-2xl overflow-hidden" />
}
