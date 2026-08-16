# Cabin photos

The landing film's "inside the car" beat composites the Stratum UI onto a real
interior photograph, because the 911 model in `public/car.glb` is a body shell
with no cabin.

## Save the images here

| File | Which photo |
|---|---|
| `driver.jpg` | **Required.** The driver's-POV shot — steering wheel, gauges, and the infotainment screen visible in the centre of the dash. |
| `seats.jpg` | Optional. The front-seats view. Not used yet. |
| `side.jpg` | Optional. The cabin side view. Not used yet. |

JPEG or WebP, ideally ~1920px wide. WebP is roughly half the size for the same
quality:

```bash
npx @squoosh/cli --webp auto driver.jpg
```

If `driver.jpg` is missing the beat still plays — it falls back to the app on a
plain dark panel — so nothing breaks while these are outstanding.

## Lining the UI up with the screen

`SCREEN` at the top of `src/landing/CabinScene.tsx` positions the overlay over
the real display, as percentages of the image:

```ts
const SCREEN = {
  left: 52.6, top: 38.5, width: 12.6, height: 8.3,
  rotateY: -13, rotateX: 2,
}
```

Those are estimates from the reference photo and will need nudging. Open the
film paused on the cabin beat:

```
http://localhost:3000/#/?t=10.5
```

and adjust until the overlay sits inside the bezel. `left`/`top` move it,
`width`/`height` size it, and the two rotations match the angle the dash turns
the display toward the driver.
