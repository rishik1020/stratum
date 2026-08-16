import { Suspense, useEffect, useRef, useState } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { ContactShadows, Environment, useGLTF } from "@react-three/drei"
import * as THREE from "three"

/** Where to drop the model. See docs/CAR_MODEL.md. */
export const CAR_MODEL_URL = "/car.glb"

/**
 * Camera keyframes for the scroll story, in scroll-progress order.
 *
 * `pos` is where the camera sits, `look` is what it aims at. Progress between
 * two keyframes is eased and interpolated, so the whole sequence — orbit the
 * car, move to the driver's door, settle in the cabin — is one continuous move
 * rather than a set of cuts.
 *
 * Values assume a car roughly 4.5 m long facing +Z, sitting on y=0. A model
 * with different proportions is handled by the auto-fit in <FitToModel>, which
 * scales the whole car to a known size before these run.
 */
const SHOTS = [
  { at: 0.0, pos: [5.2, 1.9, 6.4], look: [0, 0.7, 0] }, // wide three-quarter
  { at: 0.3, pos: [-5.6, 1.4, 3.2], look: [0, 0.7, 0] }, // orbit round the front
  { at: 0.55, pos: [-1.9, 1.35, 0.6], look: [-0.3, 1.05, 0.1] }, // at the driver's door
  { at: 0.75, pos: [-0.35, 1.15, -0.15], look: [0.1, 1.0, 1.6] }, // inside, facing forward
  { at: 1.0, pos: [-0.35, 1.12, -0.1], look: [0.35, 0.95, 1.4] }, // settled on the dash
]

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

function shotAt(p: number) {
  const clamped = Math.min(1, Math.max(0, p))
  let i = 0
  while (i < SHOTS.length - 2 && SHOTS[i + 1].at < clamped) i++
  const a = SHOTS[i]
  const b = SHOTS[i + 1]
  const span = b.at - a.at
  const f = easeInOut(span > 0 ? (clamped - a.at) / span : 0)
  const mix = (x: number[], y: number[]) => x.map((v, k) => v + (y[k] - v) * f)
  return { pos: mix(a.pos, b.pos), look: mix(a.look, b.look) }
}

/** Drives the camera from scroll progress, smoothing so it never snaps. */
function CameraRig({ progress }: { progress: React.MutableRefObject<number> }) {
  const { camera } = useThree()
  const target = useRef(new THREE.Vector3(0, 0.7, 0))

  useFrame((_, delta) => {
    const { pos, look } = shotAt(progress.current)
    // Frame-rate independent damping — a fixed lerp factor would move at
    // different speeds on 60 Hz and 120 Hz screens.
    const k = 1 - Math.pow(0.0015, delta)
    camera.position.lerp(new THREE.Vector3(pos[0], pos[1], pos[2]), k)
    target.current.lerp(new THREE.Vector3(look[0], look[1], look[2]), k)
    camera.lookAt(target.current)
  })
  return null
}

/**
 * Normalises whatever model turns up: centres it on the origin and scales it
 * so the wheelbase is a predictable size, so the camera keyframes above work
 * without hand-tuning per model.
 */
function FitToModel({ url, targetLength = 4.5 }: { url: string; targetLength?: number }) {
  const { scene } = useGLTF(url)
  const ref = useRef<THREE.Group>(null)

  useEffect(() => {
    const group = ref.current
    if (!group) return
    const box = new THREE.Box3().setFromObject(scene)
    const size = new THREE.Vector3()
    const centre = new THREE.Vector3()
    box.getSize(size)
    box.getCenter(centre)

    const longest = Math.max(size.x, size.z) || 1
    const scale = targetLength / longest
    group.scale.setScalar(scale)
    // Centre on x/z, and sit the wheels on the ground rather than the origin.
    group.position.set(-centre.x * scale, -box.min.y * scale, -centre.z * scale)

    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) {
        mesh.castShadow = true
        mesh.receiveShadow = true
      }
    })
  }, [scene, targetLength])

  return (
    <group ref={ref}>
      <primitive object={scene} />
    </group>
  )
}

/** Shown until a model exists — a lit plinth, so the scene still reads. */
function Placeholder() {
  const ref = useRef<THREE.Mesh>(null)
  useFrame((state) => {
    if (ref.current) ref.current.rotation.y = state.clock.elapsedTime * 0.25
  })
  return (
    <mesh ref={ref} position={[0, 0.55, 0]} castShadow>
      <boxGeometry args={[4.2, 1.05, 1.85]} />
      <meshStandardMaterial color="#15151a" roughness={0.35} metalness={0.7} />
    </mesh>
  )
}

function Scene({ progress, modelUrl }: { progress: React.MutableRefObject<number>; modelUrl: string | null }) {
  return (
    <>
      <CameraRig progress={progress} />

      {/* Key light from the front-left, amber rim from behind — the reference's
          lighting, where the car is mostly silhouette with lit edges. */}
      <ambientLight intensity={0.25} />
      <spotLight position={[6, 8, 6]} angle={0.5} penumbra={1} intensity={90} castShadow />
      <spotLight position={[-7, 4, -5]} angle={0.6} penumbra={1} intensity={45} color="#FFB020" />
      <Environment preset="night" />

      <Suspense fallback={<Placeholder />}>
        {modelUrl ? <FitToModel url={modelUrl} /> : <Placeholder />}
      </Suspense>

      <ContactShadows position={[0, 0, 0]} opacity={0.75} scale={16} blur={2.4} far={4} />
    </>
  )
}

/**
 * The scroll-driven car scene.
 *
 * Sits fixed behind the page while the scroll sections move over it, so the
 * camera walk and the copy stay in sync without the canvas remounting.
 */
export function CarStage({ progress }: { progress: React.MutableRefObject<number> }) {
  const [modelUrl, setModelUrl] = useState<string | null>(null)
  const [checked, setChecked] = useState(false)

  // Only load a model if one has actually been dropped in — otherwise useGLTF
  // would throw on a 404 and take the whole canvas down with it.
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
      camera={{ position: [5.2, 1.9, 6.4], fov: 40 }}
      className="!absolute inset-0"
    >
      <Scene progress={progress} modelUrl={modelUrl} />
    </Canvas>
  )
}
