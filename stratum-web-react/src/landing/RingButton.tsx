import { motion } from "framer-motion"

/**
 * The glowing ring that sits at the centre of the globe and is the page's
 * single primary action.
 *
 * Deliberately not a `.btn-primary` pill: on the landing page this is the only
 * thing to press, so it gets to be the focal point the globe is arranged
 * around. The idle halo pulses to draw the eye; press feedback is a scale
 * knock-down rather than a colour change so it still reads at a glance.
 */
export function RingButton({
  label,
  sublabel,
  onClick,
  size = 148,
}: {
  label: string
  sublabel?: string
  onClick?: () => void
  size?: number
}) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: "spring", stiffness: 400, damping: 22 }}
      className="relative flex items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-4 focus-visible:ring-offset-ink"
      style={{ width: size, height: size }}
      aria-label={sublabel ? `${label} — ${sublabel}` : label}
    >
      {/* Breathing halo. Sits behind the ring and never intercepts pointer
          events, so it can overflow the button box freely. */}
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{ boxShadow: "0 0 60px rgba(255,176,32,0.45)" }}
        animate={{ opacity: [0.45, 0.85, 0.45], scale: [0.95, 1.06, 0.95] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Ring + dark well */}
      <span
        aria-hidden
        className="absolute inset-0 rounded-full border-2 border-amber bg-ink-1/85 backdrop-blur-sm"
      />

      <span className="relative flex flex-col items-center justify-center gap-1">
        <span className="display text-lg text-white tracking-tight">{label}</span>
        {sublabel && (
          <span className="text-[10px] uppercase tracking-[0.18em] text-amber">{sublabel}</span>
        )}
      </span>
    </motion.button>
  )
}
