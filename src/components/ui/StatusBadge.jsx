import { statusOf } from '../../lib/helpers'

export default function StatusBadge({ pct, showLabel = true }) {
  const s = statusOf(pct)
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-label">
      <span aria-hidden>{s.emoji}</span>
      {showLabel && s.label}
    </span>
  )
}
