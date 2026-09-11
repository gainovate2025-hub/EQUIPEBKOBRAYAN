import ProgressBar from './ProgressBar'

export function HeroCardRed({ label, value, sub, pct, minWidth = 200 }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg2 bg-brand-600 px-5 py-4 text-white" style={{ minWidth }}>
      <span className="text-xs font-medium uppercase tracking-wide opacity-80">{label}</span>
      <span className="text-[28px] font-semibold leading-none">{value}</span>
      {sub && <span className="text-xs opacity-80">{sub}</span>}
      {pct != null && (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/25">
          <div className="h-full rounded-full bg-white" style={{ width: `${Math.max(0, Math.min(pct, 100))}%` }} />
        </div>
      )}
    </div>
  )
}

export function HeroCardWhite({ label, value, sub, minWidth = 200 }) {
  return (
    <div className="stat-card" style={{ minWidth }}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </div>
  )
}
