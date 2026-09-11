import { statusOf } from '../../lib/helpers'

const DOT = { good: '#12b76a', warn: '#f79009', bad: '#f04438' }

export default function StatusBadge({ pct, showLabel = true }) {
  const s = statusOf(pct)
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
      <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: DOT[s.tone] }} />
      {showLabel && s.label}
    </span>
  )
}
