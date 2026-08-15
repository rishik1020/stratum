import { motion } from "framer-motion"
import { X } from "lucide-react"
import { AvatarInfo } from "./LiveMap"
import { RacerRow } from "./RacerPanel"
import { initials } from "../lib/format"
import { useUnits } from "../lib/units"

/**
 * Floating detail card for the selected racer, laid over the map.
 *
 * Deliberately a React overlay rather than a Leaflet popup: it needs to sit in
 * a fixed corner of the pane and stay put while the map pans, which a
 * lat/lng-anchored popup can't do.
 */
export const RacerCard = ({
  racer,
  avatar,
  isMe,
  vehicleLabel,
  onClose,
}: {
  racer: RacerRow
  avatar?: AvatarInfo
  isMe: boolean
  vehicleLabel?: string
  onClose: () => void
}) => {
  const { speedUnit, distUnit, toSpeed, toDist } = useUnits()
  const label = avatar?.label || racer.user

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      className="w-[260px] rounded-card border border-hairline-strong bg-ink-2/95 p-4 shadow-float backdrop-blur-xl"
    >
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-amber bg-ink-3 flex items-center justify-center">
          {avatar?.url ? (
            <img src={avatar.url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-[11px] font-semibold text-white/70">{initials(label)}</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-medium text-white">{label}</p>
            {isMe && <span className="text-[9px] uppercase tracking-[0.14em] text-amber">You</span>}
          </div>
          <p className="stat-num text-[11px] text-white/45">
            {racer.position === 1 ? "Leader" : `P${racer.position} · +${racer.gapToLeaderM} m`}
          </p>
        </div>

        <button
          onClick={onClose}
          aria-label="Close racer details"
          className="-mr-1 -mt-1 rounded-lg p-1 text-white/35 transition-colors hover:text-white"
        >
          <X size={14} />
        </button>
      </div>

      {vehicleLabel && (
        <p className="mt-3 truncate rounded-lg bg-ink-3 px-2.5 py-1.5 text-[11px] text-white/55">
          {vehicleLabel}
        </p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-ink-3 px-2.5 py-2">
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/35">Speed</div>
          <div className="stat-num mt-0.5 text-lg font-medium text-white">
            {toSpeed(racer.speed)}
            <span className="ml-1 text-[10px] text-white/40">{speedUnit}</span>
          </div>
        </div>
        <div className="rounded-lg bg-ink-3 px-2.5 py-2">
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/35">Distance</div>
          <div className="stat-num mt-0.5 text-lg font-medium text-white">
            {toDist(racer.distance)}
            <span className="ml-1 text-[10px] text-white/40">{distUnit}</span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
