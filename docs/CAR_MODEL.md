# The landing-page car model

The landing page pins a car on screen and lets scroll walk the camera around it
— side profile, round to the nose, a low front hero, then the tail. That needs a
3D model, and one isn't in the repo (it's large, and its licence isn't ours to
redistribute).

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
| **Interior** | **Not needed.** The camera stays outside for the whole orbit, so a body shell is fine — which is just as well, since the one in use has no cabin. |
| **Size** | Aim for **under 15 MB**, and check `gpuSize` too — see "The mobile build" below. Texture *resolution* hurts phones more than file size does. |
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

The camera path lives in `ORBIT_SHOTS` in `src/landing/shots.ts` — wide
three-quarter, orbit past the front, driver's door, inside facing forward, and
settled on the dash. Each has an `at` (scroll progress, 0–1), a `pos` (where
the camera is) and a `look` (what it aims at), all in metres.

Every model puts its door and seats in slightly different places, so expect to
nudge the last two shots once a real car is in. Scroll slowly with the page
open and adjust `pos`/`look` until the interior shot frames the dash.

## The mobile build

Phones are served `public/car-mobile.glb` instead — the same model with its
textures capped at 1024px. Regenerate it whenever `car.glb` changes:

```bash
cd stratum-web-react
python scripts/shrink-glb.py public/car.glb public/car-mobile.glb --max 1024
```

Both files are gitignored; this one is derived, so rebuild rather than commit it.

**Why a script and not `gltf-transform resize`:** this model carries two
palette-mode PNGs and one luminance+alpha PNG, and libvips — which
gltf-transform uses for image work — fails on all three with
`colourspace: parameter space not set`. Pillow reads them without complaint.

**Why it matters:** the full model ships a 2048×4096 base-colour texture. That
is 3.6 MB on disk and **44.7 MB once uploaded to the GPU**, alongside a
2048×2048 at 22.4 MB — roughly 95 MB of texture memory for a car drawn about a
thousand pixels wide. Capping at 1024 takes the file from 8.3 MB to 4.2 MB and
the texture budget to about 30 MB.

Check what a model actually costs before shipping it:

```bash
npx @gltf-transform/cli inspect public/car.glb
```

The `gpuSize` column is the one that decides whether a phone copes.
