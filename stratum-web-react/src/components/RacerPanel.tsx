import { AvatarInfo } from "./LiveMap"
import { initials } from "../lib/format"
import { useUnits } from "../lib/units"

export interface RacerRow {
  /** Username — the key telemetry is broadcast under. */
  user: string
  position: number
  speed: number
  distance: number
  gapToLeaderM: number
}

const Avatar = ({ info, name, selected }: { info?: AvatarInfo; name: string; selected: boolean }) => (
  <div
    className={`h-10 w-10 shrink-0 overflow-hidden rounded-full border bg-ink-2 flex items-center justify-center transition-colors ${
      selected ? "border-amber" : "border-hairline-strong"
    }`}
  >
    {info?.url ? (
      <img src={info.url} alt="" className="h-full w-full object-cover" />
    ) : (
      <span className="text-[11px] font-semibold text-white/65">{initials(info?.label || name)}</span>
    )}
  </div>
)

/**
 * The roster beside the map: one row per racer, tap to focus them.
 *
 * Rows are the selection surface shared with the map — picking here highlights
 * the pin and draws that racer's trail, and clicking a pin selects the row.
 */
export const RacerPanel = ({
  racers,
  avatars,
  meName,
  selected,
  onSelect,
  title = "Racers",
}: {
  racers: RacerRow[]
  avatars?: Record<string, AvatarInfo>
  meName?: string
  selected?: string
  onSelect?: (name: string) => void
  title?: string
}) => {
  const { speedUnit, distUnit, toSpeed, toDist } = useUnits()

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 pb-3 pt-1">
        <span className="eyebrow">{title}</span>
        <span className="stat-num text-xs text-white/40">{racers.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {racers.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-white/40">Waiting for telemetry…</p>
        ) : (
          <ul className="space-y-1.5">
            {racers.map((r) => {
              const isSelected = r.user === selected
              const isMe = r.user === meName
              const label = avatars?.[r.user]?.label || r.user
              return (
                <li key={r.user}>
                  <button
                    onClick={() => onSelect?.(r.user)}
                    aria-pressed={isSelected}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      isSelected
                        ? "border-amber bg-amber-10"
                        : "border-transparent bg-ink-2 hover:bg-ink-3"
                    }`}
                  >
                    <span
                      className={`stat-num w-5 shrink-0 text-center text-sm font-semibold ${
                        r.position === 1 ? "text-amber" : "text-white/35"
                      }`}
                    >
                      {r.position}
                    </span>

                    <Avatar info={avatars?.[r.user]} name={r.user} selected={isSelected} />

                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-white">{label}</span>
                        {isMe && (
                          <span className="shrink-0 text-[9px] uppercase tracking-[0.14em] text-amber">You</span>
                        )}
                      </span>
                      <span className="stat-num mt-0.5 block text-[11px] text-white/45">
                        {toDist(r.distance)} {distUnit}
                        {r.position === 1 ? " · leader" : ` · +${r.gapToLeaderM} m`}
                      </span>
                    </span>

                    <span className="shrink-0 text-right">
                      <span className="stat-num block text-sm font-medium text-white">{toSpeed(r.speed)}</span>
                      <span className="text-[10px] text-white/35">{speedUnit}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
