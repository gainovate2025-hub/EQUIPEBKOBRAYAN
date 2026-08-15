import ProgressBar from './ProgressBar'
import StatusBadge from './StatusBadge'

export default function StatCard({ label, value, sub, pct, delay = 0, showStatus = false }) {
  return (
    <div className="card flex flex-col gap-3 p-6" style={{ animationDelay: `${delay}s` }}>
      <div className="flex items-center justify-between gap-2">
        <span className="stat-label">{label}</span>
        {showStatus && pct != null && <StatusBadge pct={pct} showLabel={false} />}
      </div>
      <span className="text-[34px] font-bold leading-none">{value}</span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
      {pct != null && <ProgressBar pct={pct} delay={delay + 0.2} />}
    </div>
  )
}
