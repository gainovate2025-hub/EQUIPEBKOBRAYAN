import ProgressBar from './ProgressBar'
import StatusBadge from './StatusBadge'

export default function StatCard({ label, value, sub, pct, showStatus = false, tone }) {
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between gap-2">
        <span className="stat-label">{label}</span>
        {showStatus && pct != null && <StatusBadge pct={pct} showLabel={false} />}
      </div>
      <span className="stat-value" style={tone ? { color: tone } : undefined}>{value}</span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
      {pct != null && <ProgressBar pct={pct} />}
    </div>
  )
}
