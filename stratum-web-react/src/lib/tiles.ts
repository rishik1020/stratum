/**
 * Basemap choices.
 *
 * Satellite is the default: the app is about where you actually drove, and
 * photographic imagery shows the road, the terrain and the buildings you passed
 * in a way a vector basemap can't. Both providers are free to use with
 * attribution, which Leaflet renders in the corner — don't remove it.
 */
export type Basemap = "satellite" | "dark"

export const BASEMAPS: Record<Basemap, { url: string; attribution: string; maxZoom: number }> = {
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
    maxZoom: 19,
  },
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: "&copy; OpenStreetMap &copy; CARTO",
    maxZoom: 19,
  },
}

/**
 * How far to dim the basemap.
 *
 * Satellite imagery is bright and busy — daylight terrain under a dark UI. A
 * dim layer keeps amber trails and white pins legible on top, which is the
 * whole point of the map here. The dark vector basemap needs none.
 */
export const BASEMAP_DIM: Record<Basemap, number> = {
  satellite: 0.42,
  dark: 0,
}
