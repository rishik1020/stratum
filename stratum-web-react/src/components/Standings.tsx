import { AvatarInfo } from "./LiveMap"

export interface DriverStanding {
  user: string
  speed: number
  distance: number
  position: number
  gapToLeaderM: number
  intervalM: number
}

const initials = (name: string) =>
  (name || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()

const Avatar = ({ info, name }: { info?: AvatarInfo; name: string }) => (
  <div className="w-8 h-8 shrink-0 rounded-full overflow-hidden border border-white/15 bg-white/5 flex items-center justify-center">
    {info?.url ? (
      <img src={info.url} alt="" className="w-full h-full object-cover" />
    ) : (
      <span className="text-[10px] font-semibold text-white/60">{initials(info?.label || name)}</span>
    )}
  </div>
)

/**
 * F1 timing-tower style standings list with participant avatars. Each row shows
 * position, avatar + name, live speed/distance, and — for everyone but the
 * leader — the gap to the leader and the interval to the car directly ahead
 * (both in metres, since the sprint is won on distance covered).
 */
export const Standings = ({
  standings,
  myName,
  avatars,
}: {
  standings: DriverStanding[]
  myName?: string
  avatars?: Record<string, AvatarInfo>
}) => (
  <ol className="space-y-2">
    {standings.length === 0 ? (
      <li className="text-white/60 text-sm">Waiting for telemetry...</li>
    ) : (
      standings.map((driver) => (
        <li
          key={driver.user}
          className={`flex items-center gap-3 rounded-lg px-3 py-2 border ${
            driver.user === myName
              ? "bg-stratum-blue/15 border-stratum-blue/40"
              : "bg-white/5 border-white/8"
          }`}
        >
          <span
            className={`stat-num w-5 shrink-0 text-center font-semibold ${
              driver.position === 1 ? "text-stratum-gold" : "text-white/40"
            }`}
          >
            {driver.position}
          </span>
          <Avatar info={avatars?.[driver.user]} name={driver.user} />
          <div className="flex-1 min-w-0">
            <strong className="block truncate font-medium">{avatars?.[driver.user]?.label || driver.user}</strong>
            <span className="stat-num text-xs text-white/45">
              {driver.speed} km/h · {(driver.distance / 1000).toFixed(2)} km
            </span>
          </div>
          <div className="text-right shrink-0">
            {driver.position === 1 ? (
              <span className="text-[11px] font-medium uppercase tracking-[0.15em] text-stratum-gold">Leader</span>
            ) : (
              <>
                <strong className="stat-num block text-sm font-medium">+{driver.gapToLeaderM} m</strong>
                <span className="stat-num text-xs text-white/40">▲ {driver.intervalM} m</span>
              </>
            )}
          </div>
        </li>
      ))
    )}
  </ol>
)
