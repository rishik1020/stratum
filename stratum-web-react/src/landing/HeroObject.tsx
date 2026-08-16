import { useState } from "react"
import {
  motion,
  useAnimationFrame,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
} from "framer-motion"

/**
 * The rotating centrepiece of the landing page.
 *
 * The reference is a 3D car orbiting on a dark road. Until a model is supplied
 * this renders the alloy-wheel photo instead — a real asset, and it turns,
 * which is the part that carries the scene. Swapping in a GLB later means
 * replacing this component only; nothing else on the page knows what's here.
 *
 * Spin is frame-driven rather than a CSS loop so there's no seam on repeat, and
 * it accelerates with scroll velocity so the page feels physically connected to
 * the object.
 */
export function HeroObject({ src = "/wheel.png" }: { src?: string }) {
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const reduce = useReducedMotion()

  const rot = useMotionValue(0)
  const { scrollY } = useScroll()
  const scrollVel = useVelocity(scrollY)
  const smoothVel = useSpring(scrollVel, { stiffness: 220, damping: 45 })

  useAnimationFrame((_, delta) => {
    if (reduce) return
    const idle = 22 // deg/sec
    const boost = smoothVel.get() * 0.02
    rot.set(rot.get() + (idle + boost) * (delta / 1000))
  })

  // Motion blur grows with speed, but stays subtle enough to read as motion
  // rather than as an out-of-focus image.
  const blurPx = useTransform(smoothVel, (v) => Math.min(3, Math.abs(v) * 0.0014))
  const filter = useMotionTemplate`blur(${blurPx}px)`

  // Counter-rotating sheen so the alloy catches light as it turns.
  const sheen = useTransform(rot, (r) => -r * 0.55)
  const sheenTransform = useMotionTemplate`rotate(${sheen}deg)`

  return (
    <div className="relative aspect-square w-full">
      {/* Ground pool of light under the object. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-[-30%] bottom-[6%] h-[26%] rounded-[50%] blur-3xl"
        style={{ background: "radial-gradient(50% 50% at 50% 50%, rgba(255,176,32,0.16), transparent 70%)" }}
      />

      {!failed && (
        <div
          className={`absolute inset-[8%] overflow-hidden rounded-full ${loaded ? "" : "opacity-0"}`}
          style={{ boxShadow: "0 30px 80px rgba(0,0,0,0.75)" }}
        >
          <motion.img
            src={src}
            alt=""
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            className="h-full w-full object-cover"
            style={{
              rotate: rot,
              filter,
              objectPosition: "50% 72%",
              transformOrigin: "49% 50%",
              willChange: "transform",
            }}
          />
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0 mix-blend-overlay"
            style={{
              transform: sheenTransform,
              background:
                "conic-gradient(from 0deg, transparent 0deg, rgba(255,255,255,0.18) 30deg, transparent 90deg, transparent 210deg, rgba(255,255,255,0.10) 250deg, transparent 320deg)",
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: "radial-gradient(circle, transparent 52%, rgba(0,0,0,0.55) 100%)" }}
          />
        </div>
      )}

      {/* If the image is missing, the scene still reads: a lit rim on the road. */}
      {failed && (
        <motion.div
          aria-hidden
          className="absolute inset-[12%] rounded-full border border-amber-40"
          style={{ rotate: rot, boxShadow: "inset 0 0 60px rgba(255,176,32,0.15)" }}
        />
      )}
    </div>
  )
}
