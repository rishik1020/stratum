# The landing-page car model

The landing page is a scroll-driven scene: the camera orbits a car, moves to
the driver's door, then settles inside the cabin. That needs a 3D model, and
one isn't in the repo — it's the single thing blocking the page from looking
finished.

## Drop it here

```
stratum-web-react/public/car.glb
```

That's it. The page checks for the file at runtime: if it's there the car
loads, if it isn't you get a dark placeholder block and everything else on the
page still works. No code change, no rebuild config.

## What the model needs

| | |
|---|---|
| **Format** | `.glb` (binary glTF — a single file, textures embedded) |
| **Interior** | **Required.** The camera flies into the cabin; a body-only shell will be hollow inside. Look for "interior" in the model description. |
| **Size** | Aim for **under 15 MB**. The APK ships this, and the web build serves it to phones on mobile data. |
| **Orientation** | Facing **+Z**, wheels near **y = 0**. If it's rotated, see below. |
| **Licence** | CC0 / CC-BY. If CC-BY, credit the author in the footer. |

Scale and centring are handled automatically — `FitToModel` in
`src/landing/CarStage.tsx` measures the bounding box, normalises the car to
~4.5 m long, and sits the wheels on the ground. A model that's 100× too big or
modelled in inches will still work.

## Where to get one

- **Sketchfab** — filter Downloadable + CC0/CC-BY, search "car interior".
  Download the **glTF** option, not FBX/OBJ.
- **Quaternius** (quaternius.com) — CC0, low-poly, very light. Stylised rather
  than photoreal, and most lack interiors.
- **Poly Haven** — CC0 and high quality, but a thin vehicle selection.

## If it's too big

`gltf-transform` will usually cut a model by 60–80% without a visible
difference:

```bash
npx @gltf-transform/cli optimize car-raw.glb car.glb --texture-size 2048
```

That draco-compresses the geometry, resizes oversized textures and drops unused
data. Check the result still looks right before committing it — aggressive
texture resizing shows up first on badges and dashboard dials.

## If the orientation is wrong

The camera path assumes the car faces +Z. If yours faces sideways or is on its
roof, rotate the wrapper group in `FitToModel`:

```tsx
<group ref={ref} rotation={[0, Math.PI / 2, 0]}>
```

`Math.PI / 2` is a 90° turn; `Math.PI` flips it end-for-end.

## Tuning the camera path

The five shots live in `SHOTS` at the top of `CarStage.tsx` — wide
three-quarter, orbit past the front, driver's door, inside facing forward, and
settled on the dash. Each has an `at` (scroll progress, 0–1), a `pos` (where
the camera is) and a `look` (what it aims at), all in metres.

Every model puts its door and seats in slightly different places, so expect to
nudge the last two shots once a real car is in. Scroll slowly with the page
open and adjust `pos`/`look` until the interior shot frames the dash.
