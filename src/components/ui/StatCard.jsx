import ProgressBar from './ProgressBar'
import StatusBadge from './StatusBadge'

export default function StatCard({ label, value, sub, pct, showStatus = false, tone, icon: Icon }) {
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between gap-2">
        <span className="stat-label">{label}</span>
        {Icon && (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-900/40 text-brand-300">
            <Icon size={14} strokeWidth={2} />
          </span>
        )}
        {!Icon && showStatus && pct != null && <StatusBadge pct={pct} showLabel={false} />}
      </div>
      <span className="stat-value" style={tone ? { color: tone } : undefined}>{value}</span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
      {pct != null && <ProgressBar pct={pct} />}
    </div>
  )
}
