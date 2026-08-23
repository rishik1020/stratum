import { Suspense, useEffect, useRef, useState } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { ContactShadows, Environment, Lightformer, useGLTF } from "@react-three/drei"
import * as THREE from "three"

import { easeInOut } from "./ease"
import { ORBIT_SHOTS, Shot } from "./shots"

/** Where to drop the model. See docs/CAR_MODEL.md. */
const CAR_MODEL_URL = "/car.glb"

/**
 * Same car, textures capped at 1024px — 4.2 MB instead of 8.3 MB, and ~30 MB of
 * GPU texture memory instead of ~95 MB. The full-size model ships a 2048x4096
 * base colour map, which is 44 MB on the GPU on its own, for a car drawn about
 * a thousand pixels wide. Built by `scripts/shrink-glb.py`.
 */
const CAR_MODEL_URL_SMALL = "/car-mobile.glb"

/** Locally vendored so the APK decodes Draco offline, not off a CDN. */
const DRACO_PATH = "/draco/"

/**
 * Camera keyframes, in seconds of film time.
 *
 * Opens on a flat side profile — the shot the whole thing is built around —
 * then pushes in toward the driver's window, holds while the in-car UI plays
 * over the top, and pulls out to a rear three-quarter for the launch.
 *
 * Exterior only, deliberately: the shipped 911 is a body shell with no cabin,
 * so the "inside" beat is a push toward the glass that hands over to a UI
 * scene, rather than a camera flying into an empty box. Swap in a model with
 * an interior and the 6.4s/9s shots can move through the window instead — see
 * docs/CAR_MODEL.md.
 *
 * Values assume a car ~4.5 m long facing +Z on y=0; <FitToModel> normalises
 * any model to that first.
 */
function shotAt(time: number, shots: Shot[]) {
  let i = 0
  while (i < shots.length - 2 && shots[i + 1].at < time) i++
  const a = shots[i]
  const b = shots[i + 1]
  const span = b.at - a.at
  const f = easeInOut(Math.min(1, Math.max(0, span > 0 ? (time - a.at) / span : 0)))
  const mix = (x: number[], y: number[]) => x.map((v, k) => v + (y[k] - v) * f)
  return { pos: mix(a.pos, b.pos), look: mix(a.look, b.look), fov: a.fov + (b.fov - a.fov) * f }
}

/** The aspect the shots were framed at. Narrower frames pull the camera back. */
const REFERENCE_ASPECT = 16 / 9

/**
 * Render settings, chosen once from the device.
 *
 * A phone was being asked for exactly what a laptop gets: shadow maps, a 2x
 * pixel ratio (four times the pixels), and a full-resolution contact shadow.
 * The scene is a dark car on a dark ground — dropping the shadow map costs
 * almost nothing visually and is the single biggest per-frame saving.
 */
interface Quality {
  dpr: [number, number]
  shadows: boolean
  shadowMap: number
  contactShadowRes: number
  /** Cube size for the generated environment. Rendered once, never fetched.
   *  64px is plenty on a phone: reflections on a car body are broad and
   *  low-frequency, so the resolution buys almost nothing visible. */
  envRes: number
  /** The lighter model, for devices that will not enjoy 95 MB of textures. */
  smallModel: boolean
}

function pickQuality(): Quality {
  if (typeof window === "undefined")
    return { dpr: [1, 1.5], shadows: true, shadowMap: 1024, contactShadowRes: 512, envRes: 128, smallModel: true }
  const coarse = window.matchMedia("(pointer: coarse)").matches
  const narrow = window.innerWidth < 900
  // Treat "coarse pointer or small screen" as mobile: a phone browser is the
  // case that was janking, and a small laptop gains from this too.
  if (coarse || narrow) {
    return { dpr: [1, 1.25], shadows: false, shadowMap: 512, contactShadowRes: 256, envRes: 64, smallModel: true }
  }
  return { dpr: [1, 1.75], shadows: true, shadowMap: 1024, contactShadowRes: 512, envRes: 256, smallModel: false }
}

function CameraRig({ time, shots }: { time: React.MutableRefObject<number>; shots: Shot[] }) {
  const { camera, size } = useThree()
  const target = useRef(new THREE.Vector3(0, 0.68, 0))

  useFrame((_, delta) => {
    const { pos, look, fov } = shotAt(time.current, shots)

    // Three's fov is *vertical*, so a portrait phone sees a far narrower slice
    // horizontally than a laptop does and the car ran off both edges. Pull the
    // camera back as the frame narrows, which keeps the same orbit while
    // fitting the car — reframing rather than re-shooting.
    const aspect = size.width / Math.max(1, size.height)
    const pull = aspect < REFERENCE_ASPECT ? Math.min(2.05, REFERENCE_ASPECT / Math.max(0.35, aspect)) : 1
    // Frame-rate independent damping — a fixed lerp factor moves at different
    // speeds on 60 Hz and 120 Hz displays.
    const k = 1 - Math.pow(0.0022, delta)
    // Scaled about the look target so the subject stays centred as it pulls out.
    camera.position.lerp(
      new THREE.Vector3(
        look[0] + (pos[0] - look[0]) * pull,
        look[1] + (pos[1] - look[1]) * pull,
        look[2] + (pos[2] - look[2]) * pull
      ),
      k
    )
    target.current.lerp(new THREE.Vector3(look[0], look[1], look[2]), k)
    camera.lookAt(target.current)

    const cam = camera as THREE.PerspectiveCamera
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov += (fov - cam.fov) * k
      cam.updateProjectionMatrix()
    }
  })
  return null
}

/**
 * Normalises whatever model turns up — centres it, scales it to a known length,
 * and sits the wheels on the ground.
 */
function Car({ url }: { url: string }) {
  const { scene } = useGLTF(url, DRACO_PATH)
  const inner = useRef<THREE.Group>(null)

  useEffect(() => {
    const group = inner.current
    if (!group) return

    // Sketchfab exports carry the original Blender scene: studio lamps and a
    // ground plane. Both fight the lighting set up here, and the plane skews
    // the bounding box the fit is measured from — so drop them first.
    const hide: THREE.Object3D[] = []
    scene.traverse((o) => {
      if ((o as THREE.Light).isLight) hide.push(o)
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh || !mesh.geometry) return
      mesh.geometry.computeBoundingBox()
      const b = mesh.geometry.boundingBox
      if (!b) return
      const s = new THREE.Vector3()
      b.getSize(s)
      if (s.y < Math.max(s.x, s.z) * 0.02 && Math.max(s.x, s.z) > 6) hide.push(mesh)
    })
    for (const o of hide) o.visible = false

    const box = new THREE.Box3().setFromObject(scene)
    const size = new THREE.Vector3()
    const centre = new THREE.Vector3()
    box.getSize(size)
    box.getCenter(centre)

    const scale = 4.5 / (Math.max(size.x, size.z) || 1)
    group.scale.setScalar(scale)
    group.position.set(-centre.x * scale, -box.min.y * scale, -centre.z * scale)

    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh || !mesh.visible) return
      mesh.castShadow = true
      mesh.receiveShadow = true
    })
  }, [scene])

  return (
    <group ref={inner}>
      <primitive object={scene} />
    </group>
  )
}

/** Shown until a model exists — a lit plinth, so the scene still reads. */
function Placeholder() {
  return (
    <group>
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[1.85, 1.05, 4.2]} />
        <meshStandardMaterial color="#15151a" roughness={0.35} metalness={0.7} />
      </mesh>
    </group>
  )
}

function Scene({
  time,
  modelUrl,
  shots,
  quality,
}: {
  time: React.MutableRefObject<number>
  modelUrl: string | null
  shots: Shot[]
  quality: Quality
}) {
  return (
    <>
      <CameraRig time={time} shots={shots} />

      {/* Mostly silhouette with lit edges: cool key from the front, amber rim
          from behind, matching the reference's night-studio look. */}
      {/* The environment is built here rather than downloaded.
          `preset="night"` pulled a 1.7 MB HDR from raw.githack.com on every
          visit — a third-party dependency, a heavy download on a phone, and
          PMREM work on top. But dropping it entirely flattened the car: a
          glossy body is mostly what it reflects, and without an environment it
          renders as a black cutout. These lightformers are the reflections,
          art-directed rather than photographed, and cost one small render. */}
      <Environment resolution={quality.envRes} frames={1}>
        {/* Long soft strip overhead — the highlight that runs the length of the
            roof and shoulder line. */}
        <Lightformer form="rect" intensity={2.6} position={[0, 5, -1]} scale={[10, 2, 1]} rotation={[Math.PI / 2, 0, 0]} color="#cfd8e6" />
        {/* Warm rim from behind, so the trailing edge picks up the brand amber. */}
        <Lightformer form="rect" intensity={3.4} position={[-6, 2, -4]} scale={[6, 3, 1]} rotation={[0, -Math.PI / 3, 0]} color="#FFB020" />
        {/* Cool fill from the front quarter. */}
        <Lightformer form="rect" intensity={1.6} position={[7, 2, 4]} scale={[6, 3, 1]} rotation={[0, Math.PI / 2.6, 0]} color="#9fc0ff" />
        {/* Dark floor, so the lower body does not glow. */}
        <Lightformer form="rect" intensity={0.35} position={[0, -3, 0]} scale={[12, 12, 1]} rotation={[-Math.PI / 2, 0, 0]} color="#0b0d12" />
      </Environment>

      <hemisphereLight args={["#2a3340", "#05060a", 0.35]} />
      <ambientLight intensity={0.22} />
      <spotLight
        position={[7, 9, 7]}
        angle={0.5}
        penumbra={1}
        intensity={110}
        castShadow={quality.shadows}
        shadow-mapSize={[quality.shadowMap, quality.shadowMap]}
      />
      <spotLight position={[-8, 4, -6]} angle={0.6} penumbra={1} intensity={62} color="#FFB020" />
      <spotLight position={[-9, 2.5, 4]} angle={0.7} penumbra={1} intensity={38} color="#bcd4ff" />

      <Suspense fallback={<Placeholder />}>
        {modelUrl ? <Car url={modelUrl} /> : <Placeholder />}
      </Suspense>

      <ContactShadows
        position={[0, 0.01, 0]}
        opacity={0.8}
        scale={18}
        blur={2.6}
        far={4}
        resolution={quality.contactShadowRes}
      />
    </>
  )
}

/**
 * The car scene.
 *
 * The driving parameter arrives in a ref and is read every frame, so the same
 * component works off a film clock or off scroll progress — it never reads
 * either directly. `shots` picks which path the camera walks; `drive` is the
 * film's launch, which the scroll orbit leaves off so the car stays framed.
 */
export function CarStage({
  time,
  shots = ORBIT_SHOTS,
  className = "!absolute inset-0",
}: {
  time: React.MutableRefObject<number>
  shots?: Shot[]
  className?: string
}) {
  const [modelUrl, setModelUrl] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)
  const [quality] = useState(pickQuality)

  // Only load a model if one has actually been dropped in — otherwise useGLTF
  // throws on a 404 and takes the whole canvas down with it.
  useEffect(() => {
    let cancelled = false
    const url = quality.smallModel ? CAR_MODEL_URL_SMALL : CAR_MODEL_URL
    fetch(url, { method: "HEAD" })
      .then((r) => {
        if (cancelled) return
        const type = r.headers.get("content-type") ?? ""
        // A dev server with SPA fallback answers 200 with index.html for a
        // missing file, so check the type rather than trusting the status.
        if (r.ok && !type.includes("text/html")) setModelUrl(url)
      })
      .catch(() => {})
      .finally(() => !cancelled && setChecked(true))
    return () => {
      cancelled = true
    }
  }, [quality.smallModel])

  if (!checked) return null

  return (
    <Canvas
      shadows={quality.shadows}
      dpr={quality.dpr}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{ position: [shots[0].pos[0], shots[0].pos[1], shots[0].pos[2]], fov: shots[0].fov }}
      className={className}
    >
      <Scene time={time} modelUrl={modelUrl} shots={shots} quality={quality} />
    </Canvas>
  )
}
