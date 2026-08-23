import { Suspense, useEffect, useRef, useState } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { ContactShadows, Environment, useGLTF } from "@react-three/drei"
import * as THREE from "three"

import { BEATS, easeInOut, easeOut, ramp } from "./useCinematic"
import { FILM_SHOTS, Shot } from "./shots"

/** Where to drop the model. See docs/CAR_MODEL.md. */
const CAR_MODEL_URL = "/car.glb"

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

const LAUNCH_AT = BEATS.launch
const LAUNCH_FOR = BEATS.launchFor

/** How far down the road the car is at time `t`, in metres. */
function launchDistance(t: number) {
  const p = ramp(t, LAUNCH_AT, LAUNCH_AT + LAUNCH_FOR)
  // Quadratic — it pulls away rather than sliding at constant speed.
  return easeOut(p) * 46 * p
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
 * Normalises whatever model turns up — centres it, scales it to a known
 * length, sits the wheels on the ground — and drives it forward on launch.
 */
function Car({ url, time, drive }: { url: string; time: React.MutableRefObject<number>; drive: boolean }) {
  const { scene } = useGLTF(url, DRACO_PATH)
  const outer = useRef<THREE.Group>(null)
  const inner = useRef<THREE.Group>(null)
  const wheels = useRef<THREE.Object3D[]>([])

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

    // Round, roughly-wheel-sized meshes get spun during the launch.
    const found: THREE.Object3D[] = []
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh || !mesh.visible) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      const b = mesh.geometry?.boundingBox
      if (!b) return
      const s = new THREE.Vector3()
      b.getSize(s)
      const round = Math.abs(s.y - s.z) < s.y * 0.25 && s.x < s.y * 0.9 && s.y > size.y * 0.25
      if (round) found.push(mesh)
    })
    wheels.current = found
  }, [scene])

  useFrame(() => {
    const d = drive ? launchDistance(time.current) : 0
    if (outer.current) outer.current.position.z = d
    // Wheel circumference ≈ 2m, so radians ≈ distance.
    for (const w of wheels.current) w.rotation.x = -d
  })

  return (
    <group ref={outer}>
      <group ref={inner}>
        <primitive object={scene} />
      </group>
    </group>
  )
}

/** Shown until a model exists — a lit plinth, so the scene still reads. */
function Placeholder({ time, drive }: { time: React.MutableRefObject<number>; drive: boolean }) {
  const ref = useRef<THREE.Group>(null)
  useFrame(() => {
    if (ref.current) ref.current.position.z = drive ? launchDistance(time.current) : 0
  })
  return (
    <group ref={ref}>
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
  drive,
}: {
  time: React.MutableRefObject<number>
  modelUrl: string | null
  shots: Shot[]
  drive: boolean
}) {
  const shadow = useRef<any>(null)
  // The contact shadow travels with the car so it doesn't stay parked.
  useFrame(() => {
    if (shadow.current) shadow.current.position.z = drive ? launchDistance(time.current) : 0
  })

  return (
    <>
      <CameraRig time={time} shots={shots} />

      {/* Mostly silhouette with lit edges: cool key from the front, amber rim
          from behind, matching the reference's night-studio look. */}
      <ambientLight intensity={0.3} />
      <spotLight position={[7, 9, 7]} angle={0.5} penumbra={1} intensity={110} castShadow />
      <spotLight position={[-8, 4, -6]} angle={0.6} penumbra={1} intensity={55} color="#FFB020" />
      <spotLight position={[-9, 2.5, 4]} angle={0.7} penumbra={1} intensity={35} color="#bcd4ff" />
      <Environment preset="night" />

      <Suspense fallback={<Placeholder time={time} drive={drive} />}>
        {modelUrl ? (
          <Car url={modelUrl} time={time} drive={drive} />
        ) : (
          <Placeholder time={time} drive={drive} />
        )}
      </Suspense>

      <ContactShadows ref={shadow} position={[0, 0.01, 0]} opacity={0.8} scale={18} blur={2.6} far={4} />
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
  shots = FILM_SHOTS,
  drive = true,
  className = "!absolute inset-0",
}: {
  time: React.MutableRefObject<number>
  shots?: Shot[]
  drive?: boolean
  className?: string
}) {
  const [modelUrl, setModelUrl] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)

  // Only load a model if one has actually been dropped in — otherwise useGLTF
  // throws on a 404 and takes the whole canvas down with it.
  useEffect(() => {
    let cancelled = false
    fetch(CAR_MODEL_URL, { method: "HEAD" })
      .then((r) => {
        if (cancelled) return
        const type = r.headers.get("content-type") ?? ""
        // A dev server with SPA fallback answers 200 with index.html for a
        // missing file, so check the type rather than trusting the status.
        if (r.ok && !type.includes("text/html")) setModelUrl(CAR_MODEL_URL)
      })
      .catch(() => {})
      .finally(() => !cancelled && setChecked(true))
    return () => {
      cancelled = true
    }
  }, [])

  if (!checked) return null

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{ position: [shots[0].pos[0], shots[0].pos[1], shots[0].pos[2]], fov: shots[0].fov }}
      className={className}
    >
      <Scene time={time} modelUrl={modelUrl} shots={shots} drive={drive} />
    </Canvas>
  )
}
