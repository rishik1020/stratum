// Futuristic Stratum logo — geometric speed mark + Space Grotesk wordmark.
export function Logo({ size = 28, withText = true, className = "" }: { size?: number; withText?: boolean; className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="32" y2="32">
            <stop stopColor="#FFC65C" />
            <stop offset="0.55" stopColor="#FFB020" />
            <stop offset="1" stopColor="#C77F00" />
          </linearGradient>
        </defs>
        <rect x="1.2" y="1.2" width="29.6" height="29.6" rx="8.5" stroke="url(#lg)" strokeWidth="1.6" />
        <path d="M9 21.5 L16 10 L23 21.5" stroke="url(#lg)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 21.5 L16 15 L20 21.5" stroke="#fff" strokeOpacity="0.85" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {withText && <span className="font-display text-lg font-bold tracking-tight text-white">STRATUM</span>}
    </div>
  )
}
