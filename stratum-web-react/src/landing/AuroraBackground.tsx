// Drifting aurora glow + dot-mesh backdrop for the futuristic surfaces.
export function AuroraBackground({ className = "" }: { className?: string }) {
  return (
    <div className={`pointer-events-none fixed inset-0 overflow-hidden ${className}`}>
      <div
        className="aurora-a absolute -top-48 -left-24 h-[42rem] w-[42rem] rounded-full blur-[130px]"
        style={{ background: "radial-gradient(circle, rgba(139,92,246,0.24), transparent 60%)" }}
      />
      <div
        className="aurora-b absolute top-1/4 -right-24 h-[44rem] w-[44rem] rounded-full blur-[140px]"
        style={{ background: "radial-gradient(circle, rgba(217,70,239,0.18), transparent 60%)" }}
      />
      <div
        className="aurora-c absolute -bottom-48 left-1/3 h-[38rem] w-[38rem] rounded-full blur-[130px]"
        style={{ background: "radial-gradient(circle, rgba(163,230,53,0.12), transparent 60%)" }}
      />
      <div className="mesh-dots absolute inset-0 opacity-60" />
    </div>
  )
}
