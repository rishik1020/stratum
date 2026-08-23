/**
 * Camera paths for the car scene.
 *
 * Split out from CarStage so the component file exports only components —
 * mixing the two breaks Fast Refresh, and these are data anyone tuning the
 * landing will want to edit without opening the renderer.
 *
 * Positions assume a car ~4.5 m long facing +Z on y=0; <FitToModel> normalises
 * any model to that first.
 */

export interface Shot {
  /** Position on the driving parameter — film seconds, or scroll progress. */
  at: number
  pos: number[]
  look: number[]
  fov: number
}

export const FILM_SHOTS: Shot[] = [
  { at: 0.0, pos: [-9.4, 1.05, 0.2], look: [0, 0.68, 0], fov: 34 }, // flat side profile
  { at: 3.2, pos: [-8.2, 1.0, 1.9], look: [0, 0.68, 0.1], fov: 34 }, // drift forward
  { at: 6.4, pos: [-3.1, 1.25, 0.9], look: [-0.6, 0.95, 0.3], fov: 40 }, // toward the glass
  { at: 9.6, pos: [-2.2, 1.2, 0.6], look: [-0.5, 0.95, 0.35], fov: 42 }, // held while start is pressed
  { at: 11.8, pos: [-6.2, 1.5, -5.6], look: [0, 0.7, 0], fov: 38 }, // back outside, rear 3/4
  { at: 15.4, pos: [-5.4, 1.35, -7.4], look: [0, 0.7, 2.2], fov: 46 }, // watch it go
]

/**
 * The scroll orbit — a walk around the car rather than a narrative.
 *
 * Driven by scroll progress 0→1 instead of seconds. It opens on the same flat
 * side profile the film used, comes round the nose to a front three-quarter,
 * drops to a low hero angle, then pulls back and around to the tail. No cut is
 * longer than a quarter of the section, so the car is always moving under the
 * reader's thumb without ever spinning.
 */
export const ORBIT_SHOTS: Shot[] = [
  // Distances are ~6.5m rather than ~9m. At fov 34 and 9m the car filled less
  // than half the frame with dead black around it; the reference fills the
  // frame with its subject, and an orbit only reads as an orbit if the shape
  // is big enough to see turning.
  { at: 0.0, pos: [-7.0, 1.15, 0.2], look: [0, 0.74, 0], fov: 30 }, // side profile
  { at: 0.25, pos: [-4.2, 1.38, 5.3], look: [0, 0.74, 0], fov: 34 }, // round to the nose
  { at: 0.5, pos: [-1.0, 0.62, 6.3], look: [0, 0.66, 0], fov: 36 }, // low front hero
  { at: 0.75, pos: [4.6, 1.6, 4.6], look: [0, 0.74, 0], fov: 34 }, // over the far shoulder
  { at: 1.0, pos: [3.2, 2.1, -5.9], look: [0, 0.7, 0], fov: 32 }, // rear three-quarter
]

